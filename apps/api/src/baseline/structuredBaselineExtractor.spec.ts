import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';

describe('structuredBaselineExtractor', () => {
  it('parses company + inline date range on same line, with role title on next line', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso October 2023 – March 2024',
          'Senior Program Manager',
          '- Led support operations across global teams.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('October 2023 – March 2024');
    expect(structured.experience[0].bullets.length).toBeGreaterThan(0);
  });

  it('parses split date range across two lines without treating end date as role title', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso October 2023',
          'March 2024',
          'Senior Program Manager',
          '- Led incident response and reliability work across teams.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('October 2023 – March 2024');
  });
});

