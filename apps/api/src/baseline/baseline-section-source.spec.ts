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

  it('prefers direct canonical baseline sections when they yield more canonical evidence than persisted Resume V2', () => {
    const baseline = {
      id: 'baseline-1',
      sections: [
        {
          id: 'section-1',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.RAW,
          title: 'Raw',
          content:
            'Michael Talbert Customer Operations and ITSM Leader | SaaS | Incident/Change | Automation | Global Teams ' +
            'Supports global customer escalations, incident management, and service reliability operations. '.repeat(10),
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'section-2',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content:
            'Senior operations leader with experience across incident management, service reliability, ' +
            'customer operations, and cross-functional execution. '.repeat(6),
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'section-3',
          baselineId: 'baseline-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Professional Experience',
          content:
            'Starbucks Senior Manager, Technology Operations Excellence Apr 2020 Mar 2022\n' +
            '- Led global incident response for executive and customer-facing operations.\n' +
            '- Managed workforce scheduling, voice operations, and escalation management for distributed teams.\n' +
            '- Improved operational consistency across high-volume support channels.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 2,
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
              {
                company: 'Customer Support Co',
                roleTitle: 'Director of Support Operations',
                dateRange: 'Jan 2018 - Mar 2020',
                bullets: [],
                evidence: [
                  { text: 'Led global support operations and escalation strategy.' },
                  { text: 'Improved queue health and SLA adherence across distributed teams.' },
                ],
              },
              {
                company: 'Operations Lab',
                roleTitle: 'Program Manager',
                dateRange: '2016 - 2018',
                bullets: [],
                evidence: [
                  { text: 'Built operational reporting and executive cadence for service teams.' },
                ],
              },
            ],
          },
        },
      ],
    } as any;

    const sections = resolveBaselineSectionsForGeneration(baseline);

    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.id)).toEqual([
      'section-1',
      'section-2',
      'section-3',
    ]);
    expect(sections[0].content).toContain('Michael Talbert');
    expect(sections[1].content).toContain('Senior operations leader');
    expect(sections[2].content).toContain('Starbucks');
    expect(sections[2].content).toContain('Senior Manager, Technology Operations Excellence');
    expect(sections[2].content).toContain('Led global incident response for executive and customer-facing operations.');
    expect(sections[2].content).toContain('Managed workforce scheduling, voice operations, and escalation management for distributed teams.');
    expect(sections[2].content).toContain('Improved operational consistency across high-volume support channels.');
  });
});
