import { assembleCoverLetterFromStructuredBaseline } from './coverLetterTemplateAssembler';

describe('assembleCoverLetterFromStructuredBaseline', () => {
  it('uses the canonical composer output instead of inventing an opening from job context', () => {
    const document = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: '',
        experience: [
          {
            id: 'exp-1',
            company: 'Acme',
            roleTitle: 'Director of Support',
            dates: '2022 - Present',
            bullets: [
              'Led support operations programs and reduced escalation churn through clear handoffs.',
              'Built operating reviews that kept queue health and service quality visible.',
            ],
          } as any,
        ],
      } as any,
      senderName: 'Alex Candidate',
      senderContactLine: 'alex@example.com',
      jobTitle: 'Director of Support',
      companyName: 'ExampleCo',
    });

    expect(document.salutation).toBe('Dear Hiring Team,');
    expect(document.opening).toBe('');
    expect(document.bodyParagraphs.length).toBeGreaterThan(0);
    expect(document.closingParagraph).toBe('Thank you for your time and consideration.');
    expect(document.signatureName).toBe('Alex Candidate');
  });

  it('passes through approved thesis text into the composed opening', () => {
    const document = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: 'Service delivery and incident operations leader.',
        experience: [
          {
            id: 'exp-1',
            company: 'Acme',
            roleTitle: 'Director of Support',
            dates: '2022 - Present',
            bullets: ['Led support operations programs.'],
          } as any,
        ],
      } as any,
      senderName: 'Alex Candidate',
      jobTitle: 'Director of Support',
      companyName: 'ExampleCo',
    });

    expect(document.opening).toBe('Service delivery and incident operations leader.');
    expect(document.bodyParagraphs.length).toBeGreaterThan(0);
  });
});
