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
          content:
            'Directed a global organization of thousands across regions.',
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
            generated: expect.stringContaining(
              'Directed a global organization',
            ),
          }),
        ]),
        confidence: expect.any(Number),
      }),
    ]);
    expect(flags[0].confidence).toBeGreaterThan(0.8);
  });

  it('warns when only shared ownership cues are new to the generated text', () => {
    const flags = detector.detect(
      [],
      [
        {
          title: 'Generated Resume',
          content: 'Led a small team to document requirements.',
        },
      ],
    );

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.WARN,
        confidence: expect.any(Number),
      }),
    ]);
    expect(flags[0].confidence).toBeLessThan(0.6);
  });

  it('ignores scope cues in safe "applying for" sentences', () => {
    const flags = detector.detect(
      [],
      [
        {
          title: 'Generated Cover Letter',
          content: 'Dear Hiring Team, I am applying for Head of Customer Services.',
        },
      ],
    );

    expect(flags).toHaveLength(0);
  });
});
