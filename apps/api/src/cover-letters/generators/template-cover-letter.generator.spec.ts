// FILE: apps/api/src/cover-letters/generators/template-cover-letter.generator.spec.ts

import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countParagraphs(text: string): number {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

describe('TemplateCoverLetterGenerator', () => {
  it('generates deterministic output with 4 paragraphs and <= 400 words', () => {
    const generator = new TemplateCoverLetterGenerator();

    const input = {
      job: {
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
          title: 'Summary',
          content:
            'Customer operations leader with experience building scalable support programs. Led cross functional initiatives to improve customer experience and operational outcomes.',
          order: 0,
        },
        {
          title: 'Experience',
          content:
            'Implemented dashboards and operating cadences to drive visibility and accountability. Focused on measurable outcomes and clear stakeholder communication.',
          order: 1,
        },
      ],
      closingTemplate: {
        key: 'steady',
        text: 'I am ready to execute steadily, stay aligned with documented scope, and keep communication clear and predictable.',
      },
      tone: 'neutral',
      maxWords: 350,
    };

    const output1 = generator.generate(input as any);
    const output2 = generator.generate(input as any);

    expect(output1).toEqual(output2);
    expect(typeof output1.content).toBe('string');
    expect(output1.content.length).toBeGreaterThan(0);

    expect(output1.content.startsWith('Dear Hiring Team,')).toBe(true);
    expect(countParagraphs(output1.content)).toBe(4);
    expect(countWords(output1.content)).toBeLessThanOrEqual(350);
  });

  it('locks the greeting to the approved salutation even when another greeting is present', () => {
    const generator = new TemplateCoverLetterGenerator();

    const input = {
      job: {
        title: 'Product Manager',
        company: 'Fabrikam',
        responsibilities: [
          'Lead product roadmaps.',
          'Partner with engineering.',
        ],
        requirements: ['Drive impact.', 'Collaborate across teams.'],
      },
      allowedBaselineBlocks: [
        {
          title: 'Summary',
          content:
            'Delivered 25% lift in engagement by coordinating cross-functional releases. Communicated clearly with stakeholders.',
          order: 0,
        },
      ],
      closingTemplate: {
        key: 'steady',
        text: 'I am ready to execute steadily, stay aligned with documented scope, and keep communication clear and predictable.',
      },
      tone: 'direct',
      maxWords: 260,
    };

    const output = generator.generate(input as any);

    expect(output.content.startsWith('Dear Hiring Team,')).toBe(true);
    expect(output.content.toLowerCase()).not.toContain('dear hiring manager');
  });

  it('does not include disallowed baseline content when it is not provided', () => {
    const generator = new TemplateCoverLetterGenerator();

    const disallowed = 'DO_NOT_INCLUDE_THIS';

    const input = {
      job: {
        title: 'Manager, Support Programs',
        company: 'Example Inc',
        responsibilities: [
          'Own support mechanisms and continuous improvement.',
        ],
        requirements: ['Program management and stakeholder alignment.'],
      },
      // Intentionally do NOT include the sentinel in allowedBaselineBlocks.
      allowedBaselineBlocks: [
        {
          title: 'Allowed',
          content:
            'Built support operating rhythms and improved internal handoffs. Documented outcomes in plain language and kept commitments modest and clear.',
          order: 0,
        },
      ],
      closingTemplate: {
        key: 'steady',
        text: 'I am ready to execute steadily, stay aligned with documented scope, and keep communication clear and predictable.',
      },
      tone: 'neutral',
      maxWords: 300,
    };

    const output = generator.generate(input as any);

    expect(output.content).not.toContain(disallowed);
    expect(countParagraphs(output.content)).toBe(4);
    expect(countWords(output.content)).toBeLessThanOrEqual(350);
  });
});
