import { BaselineIncludePolicy, BaselineSectionType } from './baseline-section.entity';
import { resolveBaselineSectionsForGeneration } from './baseline-section-source';

describe('resolveBaselineSectionsForGeneration', () => {
  it('falls back to parsedJson experience when direct sections are sparse', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
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
          parsedJson: {
            experience: [
              {
                company: 'Example Co',
                role_title: 'Director',
                start_date: 'Jan 2020',
                end_date: 'Present',
                details_text: 'Led operations.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('parsed-experience-0');
    expect(sections[0].sectionType).toBe(BaselineSectionType.EXPERIENCE);
    expect(sections[0].content).toContain('Example Co');
    expect(sections[0].content).toContain('Director');
    expect(sections[0].content).toContain('Led operations.');
  });

  it('prefers parsedJson when direct sections contain fewer structured experience entries', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'section-1',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Example Co | Director | 2020 - Present',
            '- Led operational planning.',
          ].join('\n'),
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
                company: 'Example Co',
                role_title: 'Director',
                start_date: 'Jan 2020',
                end_date: 'Present',
                details_text: 'Led operational planning.',
              },
              {
                company: 'Acme Corp',
                role_title: 'Customer Operations Manager',
                start_date: 'Jan 2018',
                end_date: 'Dec 2019',
                details_text: 'Built dashboards and playbooks.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('parsed-experience-0');
    expect(sections[0].content).toContain('Example Co');
    expect(sections[0].content).toContain('Acme Corp');
    expect(sections[0].content).toContain('Customer Operations Manager');
  });

  it('prefers parsedJson when direct sections tie with parsed structured experience coverage', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'section-1',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Example Co | Director | 2020 - Present',
            '- Led operational planning and execution.',
          ].join('\n'),
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
                company: 'Example Co',
                role_title: 'Director',
                start_date: 'Jan 2020',
                end_date: 'Present',
                details_text: 'Led operational planning and execution.',
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('parsed-experience-0');
    expect(sections[0].content).toContain('Example Co');
    expect(sections[0].content).toContain('Director');
    expect(sections[0].content).toContain('Led operational planning and execution.');
  });

  it('prefers verified Resume V2 evidence over sparse direct sections when parsed records carry canonical resumeV2Json', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
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
          parsedJson: {},
          resumeV2Json: {
            experience: [
              {
                company: 'Starbucks',
                roleTitle: 'Senior Manager, Technology Operations Excellence',
                dateRange: 'Apr 2020 - Mar 2022',
                bullets: [],
                evidence: [
                  { text: 'Owned global incident and escalation management.' },
                  { text: 'Managed Five9 voice operations and workforce management.' },
                ],
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('parsed-experience-0');
    expect(sections[0].content).toContain('Starbucks');
    expect(sections[0].content).toContain('Senior Manager, Technology Operations Excellence');
    expect(sections[0].content).toContain('Owned global incident and escalation management.');
    expect(sections[0].content).toContain('Managed Five9 voice operations and workforce management.');
  });
});
