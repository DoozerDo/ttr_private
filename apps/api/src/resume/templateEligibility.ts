import type { BaselineSection } from '../baseline/baseline-section.entity';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';

export type TemplateEligibilityResult = {
  scoreForTemplate: number;
  structuredBaselineMissingReasons: string[] | null;
};

export function computeTemplateEligibilityFromBaselineSections(opts: {
  rawScore: number;
  threshold: number;
  baselineSections: Array<Pick<BaselineSection, 'title' | 'content' | 'sectionType'>>;
}): TemplateEligibilityResult {
  const rawScore = typeof opts.rawScore === 'number' ? opts.rawScore : 0;
  if (rawScore < opts.threshold) {
    return { scoreForTemplate: rawScore, structuredBaselineMissingReasons: null };
  }

  const structured = extractStructuredBaselineFromSections(opts.baselineSections as any);
  if ((structured.experience ?? []).length > 0) {
    return { scoreForTemplate: rawScore, structuredBaselineMissingReasons: null };
  }

  return {
    scoreForTemplate: opts.threshold - 1,
    structuredBaselineMissingReasons: structured.missingEvidenceReasons.slice(0, 8),
  };
}

