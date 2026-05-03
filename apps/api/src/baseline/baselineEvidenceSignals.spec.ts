import { buildBaselineEvidenceSignals } from './baselineEvidenceSignals';
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';
import { DALEN_MESSY_RESUME_FIXTURE } from '../evidence/__fixtures__/dalen-messy-resume.fixture';

describe('baseline evidence signals (structured + interpreted)', () => {
  it('includes interpreted evidence when resume text exists and preserves structured baseline output', () => {
    const sections = [
      { sectionType: 'EXPERIENCE', title: 'Experience', content: DALEN_MESSY_RESUME_FIXTURE.resumeText },
    ] as any;

    const structuredOnly = extractStructuredBaselineFromSections(sections);
    const signals = buildBaselineEvidenceSignals({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      baselineSections: sections,
    });

    expect(signals.structuredBaseline).toEqual(structuredOnly);
    expect(signals.interpretedEvidence.length).toBeGreaterThan(0);
    expect(signals.interpretedEvidenceSummary.strongEvidenceCount + signals.interpretedEvidenceSummary.partialEvidenceCount).toBeGreaterThan(0);
  });
});

