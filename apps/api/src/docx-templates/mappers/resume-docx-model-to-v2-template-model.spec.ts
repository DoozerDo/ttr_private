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
});
