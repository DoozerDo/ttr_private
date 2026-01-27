import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Express } from 'express';
import * as mammoth from 'mammoth';
import pdf from 'pdf-parse';

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

    try {
      if (
        extension === '.docx' ||
        mimetype ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        return await this.extractDocx(buffer);
      }

      if (extension === '.pdf' || mimetype === 'application/pdf') {
        return await this.extractPdf(buffer);
      }
    } catch (error) {
      this.logger.error(
        'Failed to extract text from uploaded file',
        (error as Error)?.stack,
      );
    }

    return this.fallbackToUtf8(buffer);
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    const result: unknown = await extractRawText({ buffer });
    if (!isRawTextResult(result)) {
      throw new Error('Unexpected docx extraction result');
    }
    return result.value;
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const result: unknown = await parsePdf(buffer);
    if (!isExtractResult(result)) {
      throw new Error('Unexpected pdf extraction result');
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
