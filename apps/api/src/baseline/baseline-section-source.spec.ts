import { BaselineIncludePolicy, BaselineSectionType } from './baseline-section.entity';
import { resolveBaselineSectionsForGeneration } from './baseline-section-source';

describe('resolveBaselineSectionsForGeneration', () => {
  it('returns canonical baseline sections in order', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'section-2',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Example Co | Director | 2020 - Present',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'section-1',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: 'Senior operations leader.',
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [
        {
          createdAt: new Date(),
          resumeV2Json: {
            experience: [
              {
                company: 'Legacy Co',
                roleTitle: 'Legacy Role',
                bullets: ['Recovered from persisted Resume V2.'],
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.map((section) => section.id)).toEqual(['section-1', 'section-2']);
    expect(sections[0].title).toBe('Summary');
    expect(sections[1].title).toBe('Experience');
    expect(sections[1].content).toContain('Example Co');
  });

  it('promotes richer parsed baseline experience when canonical experience sections are sparse', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'section-summary',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: 'Customer operations leader focused on measurable improvements.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'section-experience',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Sparse Co | Director of Support Operations | Jan 2021 - Present',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          parsedJson: {
            identity: { full_name: 'Jordan Lee' },
            summary: 'Canonical parsed baseline summary.',
            experience: [
              {
                company: 'Parsed Co',
                role_title: 'Director of Support Operations',
                details_text:
                  'Led support operations and exec updates.\nImproved incident routing and operating reviews.',
              },
              {
                company: 'Parsed Co',
                role_title: 'Support Operations Manager',
                details_text:
                  'Built reporting and queue health dashboards.\nPartnered cross-functionally to reduce repeat escalations.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['section-summary', 'parsed-experience-0', 'parsed-experience-1']),
    );
    expect(sections.some((section) => String(section.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
    expect(sections.find((section) => section.id === 'parsed-experience-0')?.content).toContain('Parsed Co');
    expect(sections.find((section) => section.id === 'parsed-experience-1')?.content).toContain('Support Operations Manager');
  });

  it('prefers richer parsed baseline experience when explicitly requested', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'legacy-summary',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: 'Operations leader focused on measurable improvements.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'legacy-experience',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Legacy Co | Director | 2020 - Present\n- Sparse legacy evidence.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          parsedJson: {
            identity: { full_name: 'Jordan Lee' },
            summary: 'Canonical parsed baseline summary.',
            experience: [
              {
                company: 'Parsed Co',
                role_title: 'Director of Support Operations',
                details_text: 'Led support operations and exec updates.\nImproved incident routing and operating reviews.',
              },
              {
                company: 'Parsed Co',
                role_title: 'Support Operations Manager',
                details_text: 'Built reporting and queue health dashboards.\nPartnered cross-functionally to reduce repeat escalations.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['legacy-summary', 'parsed-experience-0', 'parsed-experience-1']),
    );
    expect(sections.some((section) => section.id === 'legacy-experience')).toBe(false);
    expect(sections.find((section) => section.id === 'parsed-experience-0')?.content).toContain('Parsed Co');
    expect(sections.find((section) => section.id === 'parsed-experience-1')?.content).toContain('Support Operations Manager');
    expect(sections.some((section) => String(section.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
  });

  it('does not derive canonical sections from persisted Resume V2 records', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'section-1',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Canonical Co | Director | 2020 - Present',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [
        {
          createdAt: new Date(),
          parsedJson: {
            experience: [
              {
                company: 'Parsed Co',
                role_title: 'Parsed Role',
                details_text: 'Should not replace canonical sections.',
              },
            ],
          },
          resumeV2Json: {
            experience: [
              {
                company: 'Resume V2 Co',
                roleTitle: 'Resume V2 Role',
                bullets: ['Should not replace canonical sections.'],
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.some((section) => String(section.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
    expect(sections.some((section) => String(section.content ?? '').includes('Resume V2 Co'))).toBe(false);
  });

  it('derives canonical parsed-experience sections from the latest parsed baseline when baseline sections are absent', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [],
      parsedRecords: [
        {
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          parsedJson: {
            identity: { full_name: 'Old Candidate' },
            summary: 'Should be surfaced canonically.',
            experience: [
              {
                company: 'Older Co',
                role_title: 'Earlier Role',
                details_text: 'Legacy experience should not win.',
              },
            ],
          },
        },
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          parsedJson: {
            identity: { full_name: 'Jordan Lee' },
            summary: 'Canonical parsed baseline summary.',
            experience: [
              {
                company: 'Parsed Co',
                role_title: 'Director of Support Operations',
                details_text: 'Led support operations and exec updates.\nImproved incident routing and operating reviews.',
              },
              {
                company: 'Parsed Co',
                role_title: 'Support Operations Manager',
                details_text: 'Built reporting and queue health dashboards.\nPartnered cross-functionally to reduce repeat escalations.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.map((section) => section.id)).toEqual(
      expect.arrayContaining([
        'baseline-1:resume-v2:summary',
        'parsed-experience-0',
        'parsed-experience-1',
      ]),
    );
    expect(sections.filter((section) => section.sectionType === BaselineSectionType.EXPERIENCE)).toHaveLength(2);
    expect(sections.find((section) => section.id === 'parsed-experience-0')?.content).toContain('Parsed Co');
    expect(sections.find((section) => section.id === 'parsed-experience-1')?.content).toContain('Support Operations Manager');
    expect(sections.some((section) => String(section.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
    expect(sections.some((section) => String(section.content ?? '').includes('Legacy experience should not win.'))).toBe(false);
  });

  it('derives canonical parsed-experience sections from the latest parsed baseline when persisted Resume V2 is sparse', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [],
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          parsedJson: {
            identity: { full_name: 'Jordan Lee' },
            summary: 'Structured parsed baseline summary.',
            experience: [
              {
                company: 'Parsed Co',
                role_title: 'Director of Support Operations',
                details_text: 'Led support operations and exec updates.\nImproved incident routing and operating reviews.',
              },
              {
                company: 'Parsed Co',
                role_title: 'Support Operations Manager',
                details_text: 'Built reporting and queue health dashboards.\nPartnered cross-functionally to reduce repeat escalations.',
              },
            ],
          },
          resumeV2Json: null,
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['parsed-experience-0', 'parsed-experience-1']),
    );
    expect(sections.find((section) => section.id === 'parsed-experience-0')?.content).toContain('Parsed Co');
    expect(sections.find((section) => section.id === 'parsed-experience-1')?.content).toContain('Support Operations Manager');
    expect(sections.some((section) => String(section.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
  });

  it('appends canonical parsed-experience sections when existing baseline sections do not already include experience', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'section-summary',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: 'Customer operations leader.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          parsedJson: {
            identity: { full_name: 'Jordan Lee' },
            summary: 'Canonical parsed baseline summary.',
            experience: [
              {
                company: 'Parsed Co',
                role_title: 'Director of Support Operations',
                details_text: 'Led support operations and exec updates.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['section-summary', 'parsed-experience-0']),
    );
    expect(sections.filter((section) => section.sectionType === BaselineSectionType.EXPERIENCE)).toHaveLength(1);
    expect(sections.find((section) => section.id === 'parsed-experience-0')?.content).toContain('Parsed Co');
    expect(sections.some((section) => String(section.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
  });

  it('replaces malformed legacy experience sections with canonical parsed-experience sections from parsed baseline evidence', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'malformed-experience',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Legacy malformed experience content that should not stay authoritative.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'section-summary',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: 'Customer operations leader.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          parsedJson: {
            identity: { full_name: 'Jordan Lee' },
            summary: 'Canonical parsed baseline summary.',
            experience: [
              {
                company: 'Parsed Co',
                role_title: 'Director of Support Operations',
                details_text: 'Led support operations and exec updates.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['section-summary', 'parsed-experience-0']),
    );
    expect(sections.some((section) => section.id === 'malformed-experience')).toBe(false);
    expect(sections.filter((section) => section.sectionType === BaselineSectionType.EXPERIENCE)).toHaveLength(1);
    expect(sections.find((section) => section.id === 'parsed-experience-0')?.content).toContain('Parsed Co');
  });
});
