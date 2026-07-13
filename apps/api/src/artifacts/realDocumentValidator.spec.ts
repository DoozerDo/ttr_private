import { validateRealCoverLetterDocument, validateRealResumeDocument } from './realDocumentValidator';

describe('real document contract', () => {
  it('marks thin resume drafts as generated_unusable', () => {
    const result = validateRealResumeDocument({
      resume: {
        heading: { name: 'Test', contactLine: 'x' },
        summary: 'Support leader.',
        experience: [{ company: 'Acme', roleTitle: 'Director', dateRange: '2020-2024', bullets: ['Led ops.'] }],
      } as any,
      jobTitle: 'Director of Support Operations',
      jobDescription: 'Own support operations.',
      evidenceExists: true,
    });
    expect(result.classification).toBe('generated_unusable');
    expect(result.reasonCodes).toContain('resume_contract:summary_too_thin');
  });

  it('marks summary-only resume drafts as generated_unusable', () => {
    const result = validateRealResumeDocument({
      resume: {
        heading: { name: 'Test', contactLine: 'x' },
        summary:
          'Experienced support operations leader with clear ownership and reliable follow through.',
        experience: [],
      } as any,
      jobTitle: 'Director of Support Operations',
      jobDescription: 'Own support operations.',
      evidenceExists: false,
    });
    expect(result.classification).toBe('generated_unusable');
    expect(result.reasonCodes).toContain('resume_contract:missing_experience_section');
  });

  it('marks generic cover letters as generated_unusable', () => {
    const result = validateRealCoverLetterDocument({
      paragraphs: ['Hello', 'I am passionate about working in a fast-paced environment.', 'Thanks'],
      jobTitle: 'Director of Support Operations',
      companyName: 'ExampleCo',
      requiredEvidenceSnippets: ['Led support operations', 'incident response'],
    });
    expect(result.classification).toBe('generated_unusable');
    expect(result.reasonCodes).toContain('cover_contract:missing_company');
  });

  it('normalizes production-shaped role titles and companies before reference checks', () => {
    const result = validateRealCoverLetterDocument({
      paragraphs: [
        'Dear Hiring Team,',
        'I am focused on the Director of Support Operations Date Less Fixture role at Example SaaS because I owned support workflow design and queue health for a SaaS team.',
        'I built dashboards and KPI reporting for executive reviews and staffing decisions that kept staffing and SLA trends visible for support leaders.',
        'I partnered with cloud teams on incident response and service reliability, standardized Zendesk, Jira, and Salesforce Service Cloud reporting, and drove recurring issue follow up across the support motion.',
        'I would welcome the chance to discuss how that background supports your service quality and operating rhythm at Example SaaS.',
        'Sincerely,',
        'Synthetic Runner',
      ],
      jobTitle: 'Director of Support Operations - Date Less Fixture',
      companyName: 'Example SaaS',
      requiredEvidenceSnippets: [
        'owned support workflow design and queue health for a SaaS team',
        'built dashboards and KPI reporting for executive reviews and staffing decisions',
      ],
    });
    expect(result.classification).toBe('usable');
    expect(result.reasonCodes).toEqual([]);
  });
});
