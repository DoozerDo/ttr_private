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
import type {
  CanonicalCoverLetterDocument,
  CanonicalCoverLetterParagraphEvidence,
} from '../../documents/normalized-document.models';
import type { DocumentStrategyPlanLike } from '../../document-strategy-plan.types';
import type { AuthoritativeRenderPlan } from '../../positioning/authoritative-render-plan';

export type CoverLetterGenerationInput = {
  document: CanonicalCoverLetterDocument;
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
  documentStrategyPlan?: DocumentStrategyPlanLike;
  authoritativeRenderPlan?: AuthoritativeRenderPlan;
  gapAnalysis?: {
    strengths: string[];
    criticalGaps: Array<{
      title: string;
      requirementEvidence: string;
      baselineEvidence: string | null;
      reasoning: string;
    }>;
  };
  traceMap?: Record<string, string[]>;
  paragraphEvidence?: CoverLetterGenerationResult['paragraphEvidence'];
  internalTrace?: CoverLetterGenerationResult['internalTrace'];
  constraintSummary?: string | null;
  debugTrace?: CoverLetterGenerationResult['debugTrace'];
};

export type CoverLetterGenerationResult = {
  document: CanonicalCoverLetterDocument;
  content: string;
  wordCount: number;
  greeting: string;
  paragraphs: string[];
  closingParagraphs: string[];
  salutation: string;
  closing: string;
  traceMap: Record<string, string[]>;
  debugTrace?: {
    passed: boolean;
    failures: string[];
    traceCoverage: number;
    unusedEvidence: string[];
    selectedEvidence: string[];
  };
  internalTrace?: {
    usedEvidenceIds: string[];
    droppedEvidenceIds: string[];
  };
  constraintSummary?: string | null;
  paragraphEvidence?: CanonicalCoverLetterParagraphEvidence[];
};

export interface CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult;
}
