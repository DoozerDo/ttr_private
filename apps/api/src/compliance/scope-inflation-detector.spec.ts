import { BaselineSectionType } from '../baseline/baseline-section.entity';
import { ComplianceFlagCode, ComplianceFlagSeverity } from './compliance.types';
import { ScopeInflationDetector } from './scope-inflation-detector';

describe('ScopeInflationDetector', () => {
  const detector = new ScopeInflationDetector();

  it('does not flag semantically similar baseline scope evidence', async () => {
    const embed = jest
      .fn()
      .mockImplementation(async (text: string) => {
        const normalized = text.toLowerCase();
        if (normalized.includes('team') && normalized.includes('engineer')) {
          return [0.9, 0.1, 0.2];
        }
        return [0.1, 0.2, 0.1];
      });

    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Managed team of 23 engineers supporting automation platform operations.',
        },
      ],
      [
        {
          title: 'Generated Resume',
          content: 'Led engineering team responsible for automation platform reliability.',
        },
      ],
      undefined,
      undefined,
      {
        embeddingProvider: embed,
        similarityThreshold: 0.76,
      },
    );

    expect(flags).toHaveLength(0);
  });

  it('does not flag semantically similar scale claims across different phrasing', async () => {
    const embed = jest
      .fn()
      .mockImplementation(async (text: string) => {
        const normalized = text.toLowerCase();
        if (normalized.includes('devices') || normalized.includes('infrastructure')) {
          return [0.85, 0.15, 0.3];
        }
        return [0.1, 0.1, 0.1];
      });

    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Responsible for 50k devices across mobile test environments.',
        },
      ],
      [
        {
          title: 'Generated Resume',
          content: 'Led department managing mobile test infrastructure reliability.',
        },
      ],
      undefined,
      undefined,
      {
        embeddingProvider: embed,
        similarityThreshold: 0.76,
      },
    );

    expect(flags).toHaveLength(0);
  });

  it('blocks global organization scope claims without baseline scale evidence', async () => {
    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Contributed to feature delivery and implementation planning.',
        },
      ],
      [
        {
          title: 'Generated Resume',
          content: 'Led global support organization across multiple regions.',
        },
      ],
      undefined,
      undefined,
      {
        embeddingProvider: async () => [0.05, 0.05, 0.05],
        similarityThreshold: 0.76,
      },
    );

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            generated: expect.stringContaining('Led global support organization'),
            reason: 'extreme_scale_without_baseline_match',
          }),
        ]),
      }),
    ]);
  });

  it('passes semantic global scope match before extreme-scale heuristics', async () => {
    const embed = jest
      .fn()
      .mockImplementation(async (text: string) => {
        const normalized = text.toLowerCase();
        if (
          normalized.includes('global') &&
          normalized.includes('support') &&
          normalized.includes('organization')
        ) {
          return [0.91, 0.08, 0.11];
        }
        return [0.1, 0.1, 0.1];
      });

    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Managed global customer support organization performance and staffing operations.',
        },
      ],
      [
        {
          title: 'Generated Cover Letter',
          content: 'Led global customer support organization through reliability improvements.',
        },
      ],
      undefined,
      undefined,
      {
        embeddingProvider: embed,
        similarityThreshold: 0.75,
      },
    );

    expect(flags).toHaveLength(0);
  });

  it('captures baseline scope evidence from leadership plus scale plus quantitative sentence', async () => {
    const embed = jest
      .fn()
      .mockImplementation(async (text: string) => {
        const normalized = text.toLowerCase();
        if (
          normalized.includes('department') &&
          normalized.includes('mobile test') &&
          normalized.includes('devices')
        ) {
          return [0.87, 0.16, 0.22];
        }
        return [0.1, 0.1, 0.1];
      });

    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content:
            'Led turnaround of department responsible for mobile test resources (50,000 devices).',
        },
      ],
      [
        {
          title: 'Generated Resume',
          content: 'Led department managing mobile test infrastructure.',
        },
      ],
      undefined,
      undefined,
      {
        embeddingProvider: embed,
        similarityThreshold: 0.75,
      },
    );

    expect(flags).toHaveLength(0);
  });

  it('evaluates sentence-level claims inside paragraphs and avoids paragraph-level false negatives', async () => {
    const embed = jest.fn().mockImplementation(async (text: string) => {
      const normalized = text.toLowerCase();
      if (
        normalized.includes('department') &&
        normalized.includes('mobile test resources')
      ) {
        return [0.9, 0.1, 0.2];
      }
      return [0.1, 0.1, 0.1];
    });

    const flags = await detector.detect(
      [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content:
            'I owned process governance and reporting cadences. Led turnaround of a department responsible for all mobile test resources (encompassing ~50,000 devices).',
        },
      ],
      [
        {
          title: 'Generated Cover Letter',
          content:
            'I focus on execution quality and partner alignment. Led turnaround of a department responsible for mobile test resources.',
        },
      ],
      undefined,
      undefined,
      {
        embeddingProvider: embed,
        similarityThreshold: 0.75,
      },
    );

    expect(flags).toHaveLength(0);
  });

  it('ignores scope cues in safe applying-for sentences', async () => {
    const flags = await detector.detect(
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
