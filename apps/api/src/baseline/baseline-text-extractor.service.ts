import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Express } from 'express';
import * as mammoth from 'mammoth';
import pdf from 'pdf-parse';
import PizZip from 'pizzip';

const extractRawText = mammoth.extractRawText as (options: {
  buffer: Buffer;
}) => Promise<unknown>;
const parsePdf = pdf as (buffer: Buffer) => Promise<unknown>;

@Injectable()
export class BaselineTextExtractor {
  private readonly logger = new Logger(BaselineTextExtractor.name);

  async extractText(file: Express.Multer.File): Promise<string> {
    const buffer = await this.readFileBuffer(file);
    const extension = path
      .extname(file.originalname || file.path || '')
      .toLowerCase();
    const mimetype = (file.mimetype || '').toLowerCase();

    const isDocx =
      extension === '.docx' ||
      mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isPdf = extension === '.pdf' || mimetype === 'application/pdf';

    if (isDocx) {
      // For known formats, prefer typed errors over falling back to raw bytes.
      return await this.extractDocx(buffer);
    }

    if (isPdf) {
      try {
        return await this.extractPdf(buffer);
      } catch (error) {
        // pdf-parse can throw on unusual/minimal PDFs. Best effort fallback keeps uploads resilient.
        this.logger.error(
          'Failed to extract text from uploaded PDF; falling back to UTF-8 decode',
          (error as Error)?.stack,
        );
        return this.fallbackToUtf8(buffer);
      }
    }

    return this.fallbackToUtf8(buffer);
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    try {
      const result: unknown = await extractRawText({ buffer });
      if (!isRawTextResult(result)) {
        throw new Error('Unexpected docx extraction result');
      }
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          // eslint-disable-next-line no-console
          console.log('[BASELINE_DOCX_PARSE][MAMMOTH_OK]', {
            textLength: result.value.length,
            lineCount: String(result.value).split(/\r?\n/).filter(Boolean).length,
          });
        } catch {
          // ignore
        }
      }
      return result.value;
    } catch (error) {
      // Mammoth can throw on certain rich/invalid OOXML structures (relationships, symbols, etc.).
      // Fall back to a permissive unzip + text-node scan that preserves usable text.
      this.logger.warn(
        `mammoth docx extraction failed; attempting fallback: ${this.describeError(error)}`,
      );
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          // eslint-disable-next-line no-console
          console.warn('[BASELINE_DOCX_PARSE][MAMMOTH_FAILED_FALLBACK]', {
            reason: this.describeError(error),
          });
        } catch {
          // ignore
        }
      }
      return this.extractDocxFallback(buffer);
    }
  }

  private extractDocxFallback(buffer: Buffer): string {
    try {
      const zip = new PizZip(buffer);
      const docXmlFile = zip.file('word/document.xml');
      const xml = docXmlFile?.asText?.() ?? null;
      if (!xml) {
        throw new Error('DOCX document.xml missing');
      }

      const text = extractTextFromDocxXml(xml);
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          // eslint-disable-next-line no-console
          console.log('[BASELINE_DOCX_PARSE][FALLBACK_OK]', {
            textLength: text.length,
            lineCount: String(text).split(/\r?\n/).filter(Boolean).length,
            xmlLength: xml.length,
          });
        } catch {
          // ignore
        }
      }
      return text;
    } catch (error) {
      // At this point, we could not interpret the DOCX container.
      // Return a typed 4xx so clients can message "invalid document" clearly.
      throw new BadRequestException({
        error: {
          code: 'DOCX_PARSE_FAILED',
          message:
            'We could not parse this DOCX file. Please re-save/export the document and try again.',
          reason: this.describeError(error),
        },
      });
    }
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const result: unknown = await parsePdf(buffer);
    if (!isExtractResult(result)) {
      throw new Error('Unexpected pdf extraction result');
    }
    if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
      try {
        const text = String((result as any).text ?? '');
        // eslint-disable-next-line no-console
        console.log('[BASELINE_PDF_PARSE][PDF_PARSE_OK]', {
          textLength: text.length,
          lineCount: text.split(/\r?\n/).filter(Boolean).length,
          preview: text.slice(0, 240),
        });
      } catch {
        // ignore
      }
    }
    return result.text;
  }

  private async readFileBuffer(file: Express.Multer.File): Promise<Buffer> {
    if (file.buffer) {
      return file.buffer;
    }

    if (file.path) {
      return await readFile(file.path);
    }

    throw new Error('Unable to read uploaded file buffer');
  }

  private fallbackToUtf8(buffer: Buffer): string {
    const text = buffer.toString('utf8');
    return [...text]
      .filter((char) => char >= ' ' && char !== '\u007F')
      .join('');
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

function isExtractResult(value: unknown): value is { text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).text === 'string'
  );
}

function isRawTextResult(value: unknown): value is { value: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).value === 'string'
  );
}

function extractTextFromDocxXml(xml: string): string {
  // Preserve coarse structure before extracting text nodes.
  const withBreaks = xml
    .replace(/<w:tab\b[^/>]*\/>/gi, '\t')
    .replace(/<w:br\b[^/>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n');

  const parts: string[] = [];
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(withBreaks))) {
    parts.push(decodeXmlEntities(match[1]));
  }

  return parts
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\\d+);/g, (_match, num) =>
      String.fromCodePoint(Number.parseInt(num, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    );
}
