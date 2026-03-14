import { BaselineSectionType } from '../../baseline/baseline-section.entity';
import { mapResumeSectionsToDocxModel } from './resume-sections-to-model';
import {
  buildNormalizedResumeDocument,
  isPaginationArtifact,
} from '../../resume/resume-normalization';

describe('resume normalization and mapping', () => {
  it('groups parsed experience fragments into role-scoped entries', () => {
    const sections = [
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Professional Experience',
        content: [
          'Director, Support Operations | Alpha Co | 2022 - Present',
          '- Led incident response governance.',
          '- Owned support workflow design.',
          '',
          'Support Manager | Beta Co | 2019 - 2022',
          '- Managed staffing forecasts and queue health.',
        ].join('\n'),
        bullets: [
          {
            text: 'Led incident response governance.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Owned support workflow design.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Managed staffing forecasts and queue health.',
            source: { experienceEntryIndex: 1 },
          },
        ],
      },
    ];

    const normalized = buildNormalizedResumeDocument(sections as any);
    expect(normalized.experience).toHaveLength(2);
    expect(normalized.experience[0]?.company).toBe('Alpha Co');
    expect(normalized.experience[1]?.company).toBe('Beta Co');
    expect(normalized.experience[0]?.bullets).toContain('Led incident response governance.');
    expect(normalized.experience[1]?.bullets).toContain(
      'Managed staffing forecasts and queue health.',
    );
  });

  it('preserves role boundaries so bullets do not drift between companies', () => {
    const sections = [
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Professional Experience',
        content: [
          'Director, Support Operations | Alpha Co | 2022 - Present',
          '- Built executive escalation process.',
          '',
          'Support Manager | Beta Co | 2019 - 2022',
          '- Reduced queue backlog by redesigning routing.',
        ].join('\n'),
        bullets: [
          {
            text: 'Built executive escalation process.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Reduced queue backlog by redesigning routing.',
            source: { experienceEntryIndex: 1 },
          },
        ],
      },
    ];

    const model = mapResumeSectionsToDocxModel(sections as any, undefined, {
      normalizedDocument: buildNormalizedResumeDocument(sections as any),
    });
    const exp = model.sections.find((section) => section.key === 'experience');
    const entries = (exp?.items ?? []) as Array<{ company?: string; bullets?: string[] }>;
    expect(entries).toHaveLength(2);
    expect(entries[0]?.company).toBe('Alpha Co');
    expect(entries[0]?.bullets).toContain('Built executive escalation process.');
    expect(entries[0]?.bullets).not.toContain('Reduced queue backlog by redesigning routing.');
    expect(entries[1]?.company).toBe('Beta Co');
    expect(entries[1]?.bullets).toContain('Reduced queue backlog by redesigning routing.');
  });

  it('excludes imported page markers from document body output', () => {
    expect(isPaginationArtifact('Page 1')).toBe(true);
    expect(isPaginationArtifact('1 / 3')).toBe(true);

    const sections = [
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Page 1',
          'Support Manager | Acme | 2021 - 2024',
          '- Improved incident triage quality.',
          '1 / 3',
        ].join('\n'),
      },
    ];

    const model = mapResumeSectionsToDocxModel(sections as any, undefined, {
      normalizedDocument: buildNormalizedResumeDocument(sections as any),
    });
    const exp = model.sections.find((section) => section.key === 'experience');
    const entries = (exp?.items ?? []) as Array<{ bullets?: string[] }>;
    const combined = entries.flatMap((entry) => entry.bullets ?? []).join(' ');
    expect(combined).toContain('Improved incident triage quality.');
    expect(combined).not.toContain('Page 1');
    expect(combined).not.toContain('1 / 3');
  });

  it('throws when called without a normalized resume document', () => {
    expect(() => mapResumeSectionsToDocxModel([] as any)).toThrow(
      /canonical normalized resume model/i,
    );
  });
});
