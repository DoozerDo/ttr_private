import {
  BaselineIncludePolicy,
  BaselineSectionType,
} from '../../baseline/baseline-section.entity';

export type AllowedBaselineBlock = {
  id: string;
  title: string | null;
  content: string;
  includePolicy: BaselineIncludePolicy;
  order: number;
  sectionType: BaselineSectionType;
};

export type CoverLetterJobContext = {
  id: string;
  title: string | null;
  company: string | null;
  responsibilities: string[];
  requirements: string[];
};

export type CoverLetterClosingTemplate = {
  key: string;
  text: string;
};

export type CoverLetterGenerationInput = {
  baselineId: string;
  jobId: string;
  allowedBaselineBlocks: AllowedBaselineBlock[];
  job: CoverLetterJobContext;
  closingTemplate: CoverLetterClosingTemplate;
  maxWords?: number;
  tone?: string;
  safeMode?: boolean;
};

export type CoverLetterGenerationResult = {
  content: string;
  wordCount: number;
  greeting: string;
  paragraphs: string[];
  closingParagraphs: string[];
};

export interface CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult;
}
