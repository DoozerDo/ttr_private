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
});

