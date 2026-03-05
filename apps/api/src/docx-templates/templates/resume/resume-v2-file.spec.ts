import JSZip from 'jszip';
import '../index';
import { getDocxTemplate } from '../../docx-template.registry';
import { ResumeDocxModel } from '../../docx-template.types';

describe('resume_v2 template rendering', () => {
  it('renders a merge model into the v2 template DOCX', async () => {
    const template = getDocxTemplate<ResumeDocxModel>('resume', 'resume_v2');
    const model: ResumeDocxModel = {
      header: {
        name: 'Jane Candidate',
        title: 'Operations Leader',
        contactLines: [
          'San Francisco, CA',
          'jane@example.com',
          '+1 (555) 555-5555',
          'linkedin.com/in/janecandidate',
        ],
      },
      sections: [
        {
          key: 'summary',
          title: 'Summary',
          items: [{ paragraphs: ['Led multi-region support operations.'] }],
        },
        {
          key: 'skills',
          title: 'Skills',
          items: [{ groups: [{ values: ['Incident Management', 'SaaS Ops'] }] }],
        },
        {
          key: 'experience',
          title: 'Experience',
          items: [
            {
              role: 'Senior Director, Support',
              company: 'Acme Corp',
              dateRange: '2020-2024',
              location: 'Remote',
              description: 'Owned global support operations.',
              bullets: ['Scaled team by 2x', 'Reduced escalations by 30%'],
            },
          ],
        },
        {
          key: 'education',
          title: 'Education',
          items: [{ degree: 'B.S. Business', institution: 'State University', dateRange: '2016' }],
        },
      ],
    };

    const result = await template.render(model, { templateKey: 'resume_v2' });
    expect(result.buffer.byteLength).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(result.buffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    expect(documentXml).toContain('Jane Candidate');
  });
});
