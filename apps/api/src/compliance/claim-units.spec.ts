import { extractClaimUnitsFromSections } from './claim-units';
import { GeneratedTextSourceType, type ComplianceTextSection } from './compliance.types';

describe('extractClaimUnitsFromSections', () => {
  it('filters malformed baseline fragments and keeps complete claims', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Experience',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'Senior Lead IT Engineer on the',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
          {
            text: 'Served as Senior Lead IT Engineer on the Cloud Support Engineering team.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const units = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
    });

    expect(units.map((unit) => unit.text)).not.toContain(
      'Senior Lead IT Engineer on the',
    );
    expect(units.map((unit) => unit.text)).toContain(
      'Served as Senior Lead IT Engineer on the Cloud Support Engineering team.',
    );
  });

  it('keeps standalone role titles that are semantically complete', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Experience',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'Software Development Engineer in Test',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const units = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
    });

    expect(units.map((unit) => unit.text)).toContain(
      'Software Development Engineer in Test',
    );
  });
});
