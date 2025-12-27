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

export type CoverLetterGenerationInput = {
  baselineId: string;
  jobId: string;
  allowedBaselineBlocks: AllowedBaselineBlock[];
  job: CoverLetterJobContext;
  maxWords?: number;
  tone?: string;
};

export type CoverLetterGenerationResult = {
  content: string;
  wordCount: number;
};

export interface CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult;
}
