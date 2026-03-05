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

export type ResumeSectionKey =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'other';

export interface ResumeDocxSection {
  key: ResumeSectionKey;
  title: string;
  items: ResumeSectionItem[];
}

export interface ResumeSummaryItem {
  paragraphs: string[];
}

export interface ResumeSkillsGroup {
  label?: string;
  values: string[];
}

export interface ResumeSkillsItem {
  groups?: ResumeSkillsGroup[];
  lines?: string[];
}

export interface ResumeEducationItem {
  institution?: string;
  degree?: string;
  dateRange?: string;
  details?: string[];
  raw?: string;
}

export interface ResumeCertificationItem {
  title: string;
  organization?: string;
  dateRange?: string;
}

export interface ResumeOtherItem {
  lines: string[];
}

export interface ExperienceItem {
  role: string;
  company?: string;
  location?: string;
  dateRange?: string;
  description?: string;
  bullets: string[];
}

export type ResumeSectionItem =
  | ResumeSummaryItem
  | ResumeSkillsItem
  | ExperienceItem
  | ResumeEducationItem
  | ResumeCertificationItem
  | ResumeOtherItem;

export interface ResumeDocxModel {
  header: ResumeDocxHeader;
  sections: ResumeDocxSection[];
}

export interface CoverLetterDocxModel {
  dateLine?: string;
  addresseeLines?: string[];
  greeting: string;
  paragraphs: string[];
  closingLines?: string[];
  signatureName?: string;
}

export interface ResumeV2ExperienceItem {
  title: string;
  company: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface ResumeV2EducationItem {
  degree: string;
  school: string;
  grad_year: string;
}

export interface ResumeV2TemplateModel {
  full_name: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
  summary: string;
  core_competencies: string;
  experience: ResumeV2ExperienceItem[];
  education: ResumeV2EducationItem[];
}

export interface DocxRenderResult {
  buffer: Buffer;
  metadata?: Record<string, unknown>;
}

export interface DocxTemplateDefinition<TModel> {
  kind: DocxTemplateKind;
  key: DocxTemplateKey;
  sourceType?: 'docx' | 'programmatic';
  render(model: TModel, context: DocxRenderContextBase): Promise<DocxRenderResult>;
}
