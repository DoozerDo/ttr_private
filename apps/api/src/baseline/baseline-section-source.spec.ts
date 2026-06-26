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
    expect(sections[0].sectionType).toBe(BaselineSectionType.EXPERIENCE);
    expect(sections[0].content).toContain('Example Co');
    expect(sections[0].content).toContain('Director');
    expect(sections[0].content).toContain('Led operations.');
  });
});
