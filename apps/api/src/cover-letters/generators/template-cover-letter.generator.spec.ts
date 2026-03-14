import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe('TemplateCoverLetterGenerator', () => {
  it('produces structured letter components with recruiter-friendly length', () => {
    const generator = new TemplateCoverLetterGenerator();

    const output = generator.generate({
      job: {
        id: 'job-1',
        title: 'Director, Customer Support Operations',
        company: 'Acme Corp',
        responsibilities: [
          'Build and scale support programs and operating rhythms.',
          'Partner with Product and Engineering to reduce defects.',
        ],
        requirements: [
          'Experience leading cross functional programs.',
          'Strong metrics and continuous improvement mindset.',
        ],
      },
      allowedBaselineBlocks: [
        {
          id: 'b1',
          title: 'Summary',
          content:
            'Customer operations leader with experience building scalable support programs. Led cross functional initiatives to improve customer experience and operational outcomes.',
          includePolicy: 'always' as any,
          order: 0,
          sectionType: 'summary' as any,
        },
      ],
      closingTemplate: {
        key: 'steady',
        text: 'Thank you for your consideration.',
      },
      baselineId: 'baseline-1',
      jobId: 'job-1',
      maxWords: 320,
    });

    expect(output.document.salutation).toBe('Dear Hiring Team,');
    expect(output.document.opening.length).toBeGreaterThan(0);
    expect(output.document.bodyParagraphs.length).toBeGreaterThanOrEqual(1);
    expect(output.document.closingParagraph.length).toBeGreaterThan(0);
    const totalNarrativeParagraphs =
      1 + output.document.bodyParagraphs.length + 1;
    expect(totalNarrativeParagraphs).toBeGreaterThanOrEqual(3);
    expect(totalNarrativeParagraphs).toBeLessThanOrEqual(5);
    expect(output.document.signoff).toBe('Sincerely,');
    expect(output.content).not.toContain('{"');
    expect(output.content).not.toContain('audit_id');
    expect(countWords(output.content)).toBeLessThanOrEqual(340);
  });

  it('filters giant evidence blobs and page markers from body paragraphs', () => {
    const generator = new TemplateCoverLetterGenerator();

    const output = generator.generate({
      job: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Acme Corp',
        responsibilities: ['Own incident response.'],
        requirements: ['Lead cross functional execution.'],
      },
      allowedBaselineBlocks: [
        {
          id: 'b1',
          title: 'Experience',
          content: `Page 1\nDelivered measurable support outcomes across recurring operations workflows while partnering across teams and maintaining stakeholder communication.\n{"audit_id":"raw"}`,
          includePolicy: 'always' as any,
          order: 0,
          sectionType: 'experience' as any,
        },
      ],
      closingTemplate: {
        key: 'steady',
        text: 'Thank you for your consideration.',
      },
      baselineId: 'baseline-1',
      jobId: 'job-1',
    });

    const body = output.document.bodyParagraphs.join(' ');
    expect(body).not.toContain('Page 1');
    expect(body).not.toContain('audit_id');
    expect(body).not.toContain('{"');
  });

  it('surfaces constraints summary in strict mode', () => {
    const generator = new TemplateCoverLetterGenerator();

    const output = generator.generate({
      job: {
        id: 'job-1',
        title: 'Director, Customer Support Operations',
        company: 'Acme Corp',
        responsibilities: ['Build programs.'],
        requirements: ['Partner with engineering.'],
      },
      allowedBaselineBlocks: [
        {
          id: 'b1',
          title: 'Summary',
          content: 'Documented program growth anchored in customer focus.',
          includePolicy: 'always' as any,
          order: 0,
          sectionType: 'summary' as any,
        },
      ],
      closingTemplate: {
        key: 'steady',
        text: 'Thank you for your consideration.',
      },
      baselineId: 'baseline-1',
      jobId: 'job-1',
      complianceConstraints: {
        mode: 'strict',
        allowedCompanyNames: ['Acme Corp'],
        disallowPhrases: ['the Director'],
      },
    });

    expect(output.constraintSummary).toContain('Allowed companies: Acme Corp');
    expect(output.constraintSummary).toContain('Avoid phrases such as the Director');
  });
});
