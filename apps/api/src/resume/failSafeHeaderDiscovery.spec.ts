import { buildFailSafeExperienceContentFromStructuredAndBaseline } from './resume.service';
import { sanitizeResumePreviewForStudio } from './resumePreviewSanitizer';

describe('Fail-safe experience header discovery', () => {
  it('rejects malformed fragments such as "Vue 3), deck builder frontend" as company headers', () => {
    const baselineSections: any[] = [
      {
        id: 'exp-1',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 0,
        includePolicy: 'ALWAYS',
        content: [
          'Project',
          'Vue 3), deck builder frontend',
          '2020 â€“ 2021',
          'Built a deck builder frontend.',
        ].join('\n'),
      },
    ];

    const content = buildFailSafeExperienceContentFromStructuredAndBaseline({
      baselineSections: baselineSections as any,
      structuredExperience: [] as any,
    });

    expect(content).not.toContain('Vue 3), deck builder frontend');
  });

  it('rejects subsection headings such as "Automation & Monitoring" as company headers', () => {
    const baselineSections: any[] = [
      {
        id: 'exp-1',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 0,
        includePolicy: 'ALWAYS',
        content: [
          'Senior Systems Engineer',
          'Automation & Monitoring',
          '2018 â€“ 2019',
          'Improved alert quality and response time.',
        ].join('\n'),
      },
    ];

    const content = buildFailSafeExperienceContentFromStructuredAndBaseline({
      baselineSections: baselineSections as any,
      structuredExperience: [] as any,
    });

    expect(content).not.toContain('Automation & Monitoring');
  });

  it('still accepts valid company/title/date headers', () => {
    const baselineSections: any[] = [
      {
        id: 'exp-1',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 0,
        includePolicy: 'ALWAYS',
        content: [
          'Acme Corp | Senior Engineer | 2021 - 2024',
          '- Shipped reliable systems.',
        ].join('\n'),
      },
    ];

    const content = buildFailSafeExperienceContentFromStructuredAndBaseline({
      baselineSections: baselineSections as any,
      structuredExperience: [
        { company: 'Acme Corp', roleTitle: 'Senior Engineer', dates: '2021 - 2024', bullets: ['Shipped reliable systems.'] },
      ] as any,
    });

    expect(content).toContain('Acme Corp | Senior Engineer | 2021 - 2024');
  });
});

describe('Resume preview sanitization', () => {
  it('drops experience entries that lack both company and roleTitle (no placeholder company emitted)', () => {
    const preview = sanitizeResumePreviewForStudio({
      heading: { name: 'Test Candidate', contactLine: '' },
      summary: 'Test summary',
      experience: [
        { company: '', roleTitle: '', bullets: [], dateRange: '2020 - 2024' },
        { company: 'Example Co', roleTitle: 'Support Engineer', bullets: ['Did work.'], dateRange: '2020 - 2024' },
      ],
      education: [],
      competencies: [],
    } as any);

    expect(JSON.stringify(preview.experience ?? [])).not.toContain('Experience entry needs correction');
    expect(preview.experience.length).toBe(1);
    expect(preview.experience[0].company).toBe('Example Co');
  });
});
