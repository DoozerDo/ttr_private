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

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('section-1');
    expect(sections[0].content).toContain('Canonical Co');
    expect(sections[0].content).not.toContain('Parsed Co');
    expect(sections[0].content).not.toContain('Resume V2 Co');
  });
});
