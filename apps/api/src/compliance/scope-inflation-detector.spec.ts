import { BaselineSectionType } from '../baseline/baseline-section.entity';
import { ComplianceFlagCode, ComplianceFlagSeverity } from './compliance.types';
import { ScopeInflationDetector } from './scope-inflation-detector';

describe('ScopeInflationDetector', () => {
  const detector = new ScopeInflationDetector();

  it('does not flag scope cues that are present in the baseline fingerprint', () => {
    const flags = detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Led a global team delivering a 10% uplift.',
        },
      ],
      [
        {
          title: 'Generated Resume',
          content: 'Led a global team delivering a 10% uplift.',
        },
      ],
    );

    expect(flags).toHaveLength(0);
  });

  it('blocks exaggerated seniority and scale claims beyond the baseline', () => {
    const flags = detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Contributed to feature delivery.',
        },
      ],
      [
        {
          title: 'Generated Resume',
          content: 'Directed a global organization of thousands across regions.',
        },
      ],
    );

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            baseline: expect.any(String),
            generated: expect.stringContaining('Directed a global organization'),
          }),
        ]),
      }),
    ]);
  });
});
