import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';
import {
  gameDesignFixture,
  supportOperationsFixture,
} from './__fixtures__/cover-letter-fixtures';

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe('TemplateCoverLetterGenerator', () => {
  it('produces concise recruiter ready output for game design fixture', () => {
    const generator = new TemplateCoverLetterGenerator();
    const output = generator.generate(gameDesignFixture);

    expect(output.content.startsWith('Dear Hiring Team,')).toBe(true);
    expect(output.content).not.toMatch(/-/);
    expect(output.content).not.toMatch(
      /\bverified experience\b|\bdocumented execution\b|\bclear ownership\b/i,
    );
    expect(output.content).toContain('Northline Interactive');
    expect(output.content).toContain('Senior Game Designer');
    expect(output.content).toContain('\n\nSincerely,\n\nAlex Rivera');
    expect(output.paragraphEvidence?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(
      output.paragraphEvidence?.every(
        (entry) => Array.isArray(entry.sourceEvidenceIds) && entry.sourceEvidenceIds.length > 0,
      ),
    ).toBe(true);
    expect(countWords(output.content)).toBeGreaterThanOrEqual(250);
    expect(countWords(output.content)).toBeLessThanOrEqual(400);
    expect(output.document.bodyParagraphs.length).toBeLessThanOrEqual(3);
  });

  it('filters resume artifacts and raw payload fragments', () => {
    const generator = new TemplateCoverLetterGenerator();
    const output = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Page 2 | 3\n• Summary\nDelivered measurable support outcomes across recurring operations workflows while partnering across teams.\n{"audit_id":"raw"}',
        },
      ],
    });

    expect(output.content).not.toContain('Page 2 | 3');
    expect(output.content).not.toContain('•');
    expect(output.content).not.toContain('Summary');
    expect(output.content).not.toContain('audit_id');
    expect(output.content).not.toContain('{"');
  });

  it('supports support operations fixture without collapsing into JD mirror text', () => {
    const generator = new TemplateCoverLetterGenerator();
    const output = generator.generate(supportOperationsFixture);

    expect(output.content).toContain('Support Operations Manager');
    expect(output.content).toContain('Acme Care');
    expect(output.content).toContain('Jordan Lee');
    expect(output.content).toContain('Dear Hiring Team,');
    expect(output.content).toContain('Sincerely,');

    const jdLine =
      supportOperationsFixture.job.responsibilities[0].toLowerCase().replace(/[^\w\s]/g, '');
    const letter = output.content.toLowerCase().replace(/[^\w\s]/g, ' ');
    expect(letter.includes(jdLine)).toBe(false);
  });

  it('surfaces constraints summary in strict mode', () => {
    const generator = new TemplateCoverLetterGenerator();

    const output = generator.generate({
      ...supportOperationsFixture,
      complianceConstraints: {
        mode: 'strict',
        allowedCompanyNames: ['Acme Care'],
        disallowPhrases: ['the Director'],
      },
    });

    expect(output.constraintSummary).toContain('Allowed companies: Acme Care');
    expect(output.constraintSummary).toContain('Avoid phrases such as the Director');
  });
});
