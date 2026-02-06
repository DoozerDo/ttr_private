import type { Buffer } from 'node:buffer';

export type DocxTemplateKind = 'resume' | 'cover_letter';
export type DocxTemplateKey = string;

export interface DocxRenderContextBase {
  font?: string;
  margin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  locale?: string;
  templateKey?: DocxTemplateKey;
}

export interface ResumeDocxHeader {
  name?: string;
  title?: string;
  contactLines?: string[];
}

export interface ExperienceEntry {
  role: string;
  company?: string;
  dateRange?: string;
  bullets: string[];
}

export interface ResumeDocxModel {
  header: ResumeDocxHeader;
  summary?: string[];
  skills?: string[][];
  experiences?: ExperienceEntry[];
  education?: string[];
  certifications?: string[];
}

export interface CoverLetterDocxModel {
  dateLine?: string;
  greeting: string;
  paragraphs: string[];
  closingLines?: string[];
  signatureName?: string;
}

export interface DocxRenderResult {
  buffer: Buffer;
  metadata?: Record<string, unknown>;
}

export interface DocxTemplateDefinition<TModel> {
  kind: DocxTemplateKind;
  key: DocxTemplateKey;
  render(model: TModel, context: DocxRenderContextBase): Promise<DocxRenderResult>;
}
