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

import type { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';
import type { NormalizedCoverLetterDocument } from '../../documents/normalized-document.models';

export type CoverLetterGenerationInput = {
  baselineId: string;
  jobId: string;
  allowedBaselineBlocks: AllowedBaselineBlock[];
  job: CoverLetterJobContext;
  candidateName?: string | null;
  closingTemplate: CoverLetterClosingTemplate;
  maxWords?: number;
  tone?: string;
  safeMode?: boolean;
  complianceConstraints?: CoverLetterComplianceConstraints;
  gapAnalysis?: {
    strengths: string[];
    criticalGaps: Array<{
      title: string;
      requirementEvidence: string;
      baselineEvidence: string | null;
      reasoning: string;
    }>;
  };
};

export type CoverLetterGenerationResult = {
  document: NormalizedCoverLetterDocument;
  content: string;
  wordCount: number;
  greeting: string;
  paragraphs: string[];
  closingParagraphs: string[];
  constraintSummary?: string | null;
  paragraphEvidence?: Array<{
    paragraphKey: 'opening' | 'body_1' | 'body_2' | 'body_3' | 'closing';
    sourceEvidenceIds: string[];
    anchorTexts?: string[];
  }>;
};

export interface CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult;
}
