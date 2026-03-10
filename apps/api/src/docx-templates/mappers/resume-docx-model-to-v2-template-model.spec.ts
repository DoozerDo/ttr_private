import { ResumeDocxModel } from '../docx-template.types';
import { mapResumeDocxModelToV2TemplateModel } from './resume-docx-model-to-v2-template-model';

describe('mapResumeDocxModelToV2TemplateModel', () => {
  it('maps summary, competencies, experience, education, and header contacts into v2 tokens', () => {
    const model: ResumeDocxModel = {
      header: {
        name: 'Alex Candidate',
        title: 'Director of Support',
        contactLines: [
          'Austin, TX',
          'alex@example.com',
          '555-555-1234',
          'linkedin.com/in/alexcandidate',
        ],
      },
      sections: [
        {
          key: 'summary',
          title: 'Summary',
          items: [{ paragraphs: ['Built global support operations for SaaS products.'] }],
        },
        {
          key: 'skills',
          title: 'Skills',
          items: [
            {
              groups: [
                {
                  values: [
                    'Incident Management',
                    'SaaS Operations',
                    'alex@example.com',
                  ],
                },
              ],
            },
          ],
        },
        {
          key: 'experience',
          title: 'Experience',
          items: [
            {
              role: 'Head of Support',
              company: 'Acme',
              dateRange: '2021-2025',
              location: 'Remote',
              bullets: ['Scaled team from 20 to 60.', ''],
            },
            {
              role: 'Placeholder',
              company: '',
              dateRange: '',
              location: '',
              bullets: [],
            },
          ],
        },
        {
          key: 'education',
          title: 'Education',
          items: [{ degree: 'B.S. Management', institution: 'State U', dateRange: '2016' }],
        },
      ],
    };

    const mapped = mapResumeDocxModelToV2TemplateModel(model);

    expect(mapped.full_name).toBe('Alex Candidate');
    expect(mapped.headline).toBe('Director of Support');
    expect(mapped.location).toBe('Austin, TX');
    expect(mapped.email).toBe('alex@example.com');
    expect(mapped.phone).toContain('555');
    expect(mapped.linkedin.toLowerCase()).toContain('linkedin.com');

    expect(mapped.summary).toContain('Built global support operations');
    expect(mapped.core_competencies).toContain('Incident Management');
    expect(mapped.core_competencies).toContain('SaaS Operations');
    expect(mapped.core_competencies).not.toContain('alex@example.com');

    expect(mapped.experience).toHaveLength(1);
    expect(mapped.experience[0]?.title).toBe('Head of Support');
    expect(mapped.experience[0]?.bullets).toEqual(['Scaled team from 20 to 60.']);

    expect(mapped.education).toEqual([
      { degree: 'B.S. Management', school: 'State U', grad_year: '2016' },
    ]);
  });

  it('suppresses malformed summary and empty competency placeholders', () => {
    const model: ResumeDocxModel = {
      header: {
        name: 'Casey Candidate',
      },
      sections: [
        {
          key: 'summary',
          title: 'Summary',
          items: [
            {
              paragraphs: [
                'Summary',
                '•',
                '•',
                '•',
              ],
            },
          ],
        },
        {
          key: 'skills',
          title: 'Skills',
          items: [
            {
              groups: [{ values: ['•', ' ', ' - ', '|'] }],
            },
          ],
        },
        {
          key: 'experience',
          title: 'Experience',
          items: [
            {
              role: 'Director, Support Operations',
              company: 'Acme Corp',
              dateRange: '2020 - 2024',
              location: 'Remote',
              bullets: ['Led support operations cadence.'],
            },
          ],
        },
      ],
    };

    const mapped = mapResumeDocxModelToV2TemplateModel(model);
    expect(mapped.summary).toBe('');
    expect(mapped.core_competencies).toBe('');
    expect(mapped.experience[0]?.title).toBe('Director, Support Operations');
    expect(mapped.experience[0]?.company).toBe('Acme Corp');
  });

  it('keeps clean prose summary and trims to readable length', () => {
    const model: ResumeDocxModel = {
      header: { name: 'Taylor Candidate' },
      sections: [
        {
          key: 'summary',
          title: 'Summary',
          items: [
            {
              paragraphs: [
                'Professional Summary: Operations leader with deep support experience across incident response, process design, and service delivery governance.',
                'Built cross-functional operating rhythms that improved team reliability and customer outcomes without over-claiming scope.',
              ],
            },
          ],
        },
      ],
    };

    const mapped = mapResumeDocxModelToV2TemplateModel(model);
    expect(mapped.summary).toContain('Operations leader');
    expect(mapped.summary).not.toContain('•');
    expect(mapped.summary.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(90);
  });
  it('renders multiline experience bullets as separate bullet items and keeps ordering', () => {
    const model: ResumeDocxModel = {
      header: { name: 'Jordan Candidate' },
      sections: [
        {
          key: 'experience',
          title: 'Experience',
          items: [
            {
              role: 'Support Operations Manager',
              company: 'Contoso',
              dateRange: '2022 - 2025',
              location: 'Remote',
              bullets: [
                'â€¢ Managed revenue-impacting incident workflows\nâ€¢ Led billing support operations\nâ€¢ Directed two team members',
              ],
            },
          ],
        },
      ],
    };

    const mapped = mapResumeDocxModelToV2TemplateModel(model);
    expect(mapped.experience).toHaveLength(1);
    expect(mapped.experience[0]?.bullets).toEqual([
      'Managed revenue-impacting incident workflows',
      'Led billing support operations',
      'Directed two team members',
    ]);
  });
});
