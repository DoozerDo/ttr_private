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
});
