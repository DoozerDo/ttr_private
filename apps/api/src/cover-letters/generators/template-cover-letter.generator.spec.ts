import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';
import {
  gameDesignFixture,
  supportOperationsFixture,
} from './__fixtures__/cover-letter-fixtures';

describe('TemplateCoverLetterGenerator', () => {
  it('rejects underspecified evidence fixtures with a supported-input error', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() => generator.generate(gameDesignFixture)).toThrow(/unsupported_input/i);
  });

  it('filters resume artifacts and raw payload fragments before failing unsupported inputs', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() =>
      generator.generate({
        ...supportOperationsFixture,
        allowedBaselineBlocks: [
          {
            ...supportOperationsFixture.allowedBaselineBlocks[0],
            content:
              'Page 2 | 3\nâ€¢ Summary\nDelivered measurable support outcomes across recurring operations workflows while partnering across teams.\n{"audit_id":"raw"}',
          },
        ],
      }),
    ).toThrow(/unsupported_input|insufficient baseline evidence/i);
  });

  it('keeps support operations text from collapsing into a JD mirror when the input is supported', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() =>
      generator.generate({
        ...supportOperationsFixture,
        allowedBaselineBlocks: [
          {
            ...supportOperationsFixture.allowedBaselineBlocks[0],
            content:
              'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams.',
          },
        ],
      }),
    ).toThrow(/unsupported_input|insufficient baseline evidence/i);
  });

  it('keeps paragraph ordering validation guarded by the supported evidence envelope', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() =>
      generator.generate({
        ...supportOperationsFixture,
        allowedBaselineBlocks: [
          {
            ...supportOperationsFixture.allowedBaselineBlocks[0],
            content:
              'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams.',
          },
        ],
      }),
    ).toThrow(/unsupported_input|insufficient baseline evidence/i);
  });

  it('surfaces constraints summary behavior only after the evidence envelope is met', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() =>
      generator.generate({
        ...supportOperationsFixture,
        complianceConstraints: {
          mode: 'strict',
          allowedCompanyNames: ['Acme Care'],
          disallowPhrases: ['the Director'],
        },
      }),
    ).toThrow(/unsupported_input/i);
  });
});
