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

  it('parses inline date range with hyphen and preserves company/role title separation', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso July 2024 - April 2026',
          'Senior Program Manager',
          '- Delivered measurable outcomes.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – April 2026');
  });

  it('parses present/current date ranges and does not assign dates as role title', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso April 2026 - Present',
          'Staff Program Manager',
          '- Led support operations.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Staff Program Manager');
    expect(structured.experience[0].dates).toBe('April 2026 – Present');
  });

  it('parses inline date range with en dash (–)', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: ['Biblioso July 2024 – April 2026', 'Senior Program Manager', '- Delivered outcomes.'].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – April 2026');
  });

  it('parses inline date range with em dash (—)', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: ['Biblioso July 2024 — April 2026', 'Senior Program Manager', '- Delivered outcomes.'].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – April 2026');
  });

  it('parses inline date range using \"to Present\"', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: ['Biblioso July 2024 to Present', 'Staff Program Manager', '- Delivered outcomes.'].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Staff Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – Present');
  });

  it('does not promote project/tech fragments into experience company headers (Vue 3), deck builder frontend)', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Vue 3), deck builder frontend August 2024 – Present',
          'Founder',
          '- Built a deck builder.',
          '',
          'AMS DataSerfs August 2022 – August 2024',
          'Infrastructure Engineer',
          '- Improved reliability.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    const companies = structured.experience.map((e) => e.company);
    expect(companies).not.toContain('Vue 3), deck builder frontend');
    expect(companies).toContain('AMS DataSerfs');
  });
});

