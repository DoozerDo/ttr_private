import type { BaselineSection } from './baseline-section.entity';
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';
import { interpretEvidenceFromResumeText } from '../evidence/evidence-interpreter';
import type { InterpretedEvidence, EvidenceItem } from '../evidence/evidence-model';

export type BaselineEvidenceSignals = {
  structuredBaseline: ReturnType<typeof extractStructuredBaselineFromSections>;
  interpretedEvidence: EvidenceItem[];
  interpretedEvidenceSummary: InterpretedEvidence['summary'];
};

function flattenBaselineText(sections: BaselineSection[]): string {
  return (sections ?? [])
    .map((section) => String((section as any)?.content ?? ''))
    .filter(Boolean)
    .join('\n');
}

export function buildBaselineEvidenceSignals(opts: {
  baselineId: string;
  baselineVersionId: string;
  baselineSections: BaselineSection[];
}): BaselineEvidenceSignals {
  const structuredBaseline = extractStructuredBaselineFromSections(opts.baselineSections as any);
  const resumeText = flattenBaselineText(opts.baselineSections);
  const interpreted = interpretEvidenceFromResumeText({
    baselineId: opts.baselineId,
    baselineVersionId: opts.baselineVersionId,
    resumeText,
  });

  return {
    structuredBaseline,
    interpretedEvidence: interpreted.items,
    interpretedEvidenceSummary: interpreted.summary,
  };
}
