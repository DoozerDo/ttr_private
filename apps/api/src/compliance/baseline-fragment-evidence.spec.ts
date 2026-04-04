import { BaselineSectionType } from '../baseline/baseline-section.entity';
import { ComplianceFlagCode, ComplianceFlagSeverity } from './compliance.types';
import { ScopeInflationDetector } from './scope-inflation-detector';

describe('baseline fragment evidence extraction', () => {
  const detector = new ScopeInflationDetector();

  it('accepts fragment-style baseline scope evidence and supports semantic scope claims', async () => {
    const embed = jest.fn().mockImplementation(async (text: string) => {
      const normalized = text.toLowerCase();
      if (
        normalized.includes('infrastructure') &&
        normalized.includes('cloud') &&
        normalized.includes('platform')
      ) {
        return [0.93, 0.08, 0.14];
      }
      if (
        normalized.includes('mobile') &&
        normalized.includes('lab') &&
        normalized.includes('infrastructure')
      ) {
        return [0.9, 0.1, 0.16];
      }
      return [0.1, 0.1, 0.1];
    });

    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'mobile lab infrastructure management',
            'cloud platform automation engineering',
            'network infrastructure deployment',
          ].join('\n'),
        },
      ],
      [
        {
          title: 'Generated Resume',
          content:
            'Led infrastructure team initiatives supporting cloud platform automation environments.',
        },
      ],
      undefined,
      undefined,
      {
        embeddingProvider: embed,
        similarityThreshold: 0.75,
      },
    );

    expect(flags).toEqual([]);
  });

  it('still warns when baseline contains no usable scope evidence', async () => {
    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content:
            'Improved collaboration practices and communication quality across teams.',
        },
      ],
      [
        {
          title: 'Generated Resume',
          content:
            'Led infrastructure team initiatives supporting cloud platform automation environments.',
        },
      ],
      undefined,
      undefined,
      {
        similarityThreshold: 0.75,
      },
    );

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.WARN,
      }),
    ]);
  });
});
