import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';

describe('TemplateCoverLetterGenerator', () => {
  it('renders a canonical document without authoring new narrative', () => {
    const generator = new TemplateCoverLetterGenerator();
    const result = generator.generate({
      document: {
        senderHeading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
        salutation: 'Dear Hiring Team,',
        opening: 'Service delivery and incident operations leader.',
        bodyParagraphs: [
          'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams.',
          'Built weekly operating reviews that kept queue health, staffing tradeoffs, and service quality visible.',
        ],
        closingParagraph: 'Thank you for your time and consideration.',
        signoff: 'Sincerely,',
        signatureName: 'Alex Candidate',
      },
      baselineId: 'base-1',
      jobId: 'job-1',
      allowedBaselineBlocks: [],
      job: {
        id: 'job-1',
        title: 'Director of Support',
        company: 'ExampleCo',
        responsibilities: [],
        requirements: [],
      },
      closingTemplate: { key: 'default', text: 'Thank you for your time and consideration.' },
      paragraphEvidence: [
        { paragraphKey: 'opening', sourceEvidenceIds: ['e1'], anchorTexts: ['Service delivery and incident operations leader.'] },
        { paragraphKey: 'body_1', sourceEvidenceIds: ['e2'], anchorTexts: ['Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams.'] },
        { paragraphKey: 'body_2', sourceEvidenceIds: ['e3'], anchorTexts: ['Built weekly operating reviews that kept queue health, staffing tradeoffs, and service quality visible.'] },
        { paragraphKey: 'closing', sourceEvidenceIds: ['e4'], anchorTexts: ['Thank you for your time and consideration.'] },
      ],
      traceMap: { opening: ['e1'], body_1: ['e2'], body_2: ['e3'], closing: ['e4'] },
    } as any);

    expect(result.document.opening).toBe('Service delivery and incident operations leader.');
    expect(result.paragraphs).toEqual([
      'Service delivery and incident operations leader.',
      'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams.',
      'Built weekly operating reviews that kept queue health, staffing tradeoffs, and service quality visible.',
      'Thank you for your time and consideration.',
    ]);
    expect(result.content).toContain('Managed escalation flows and coordinated incident handoffs');
    expect(result.traceMap).toEqual({ opening: ['e1'], body_1: ['e2'], body_2: ['e3'], closing: ['e4'] });
    expect(result.paragraphEvidence).toHaveLength(4);
  });

  it('renders absence when the canonical document has no body paragraphs', () => {
    const generator = new TemplateCoverLetterGenerator();
    const result = generator.generate({
      document: {
        senderHeading: { name: 'Alex Candidate' },
        salutation: 'Dear Hiring Team,',
        opening: '',
        bodyParagraphs: [],
        closingParagraph: '',
        signoff: 'Sincerely,',
        signatureName: 'Alex Candidate',
      },
      baselineId: 'base-1',
      jobId: 'job-1',
      allowedBaselineBlocks: [],
      job: { id: 'job-1', title: null, company: null, responsibilities: [], requirements: [] },
      closingTemplate: { key: 'default', text: '' },
    } as any);

    expect(result.paragraphs).toEqual([]);
    expect(result.content).toBe('');
    expect(result.wordCount).toBe(0);
  });

  it('does not infer themes, role problems, or evidence transitions', () => {
    const generator = new TemplateCoverLetterGenerator();
    const result = generator.generate({
      document: {
        senderHeading: { name: 'Alex Candidate' },
        salutation: 'Dear Hiring Team,',
        opening: 'Canonical opening.',
        bodyParagraphs: ['Canonical body.'],
        closingParagraph: 'Canonical closing.',
        signoff: 'Sincerely,',
        signatureName: 'Alex Candidate',
      },
      baselineId: 'base-1',
      jobId: 'job-1',
      allowedBaselineBlocks: [],
      job: { id: 'job-1', title: null, company: null, responsibilities: [], requirements: [] },
      closingTemplate: { key: 'default', text: '' },
      traceMap: {},
    } as any);

    expect(result.content).toBe('Canonical opening.\n\nCanonical body.\n\nCanonical closing.');
    expect(result.greeting).toBe('Dear Hiring Team,');
    expect(result.closing).toBe('Sincerely,\nAlex Candidate');
  });
});
