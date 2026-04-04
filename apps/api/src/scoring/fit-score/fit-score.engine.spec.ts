import { FitScoreEngine } from './fit-score.engine';
import type { FitScoreInput } from './fit-score.types';

const baseSentence =
  'Lead enterprise SaaS security and customer experience programs, coach cross-functional stakeholders, and scale strategy through AWS, ServiceNow, and automation.';

const repeatSentence = (sentence: string, count: number) =>
  Array(count).fill(sentence).join(' ');

type SelectJobTextSelection = {
  text: string;
  wordCount: number;
  source: string;
};

type SelectJobTextInvoker = (
  job: FitScoreInput['job'],
) => SelectJobTextSelection;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const assertSelection = (
  value: unknown,
): asserts value is SelectJobTextSelection => {
  if (
    !isObject(value) ||
    typeof value.text !== 'string' ||
    typeof value.wordCount !== 'number' ||
    typeof value.source !== 'string'
  ) {
    throw new Error('Expected job text selection payload.');
  }
};

const baseSections = [
  {
    type: 'EXPERIENCE',
    content:
      'Led enterprise SaaS security programs, orchestrated CX operations, defined strategy roadmaps, and scaled ServiceNow-driven teams across automation and customer support.',
  },
  {
    type: 'SKILLS',
    content:
      'AWS, Kubernetes, Terraform, Snowflake, ServiceNow, Jira, security automation, CX operations',
  },
];

const strongJobInput: FitScoreInput = {
  job: {
    title: 'Director of Customer Experience',
    company: 'ExampleCo',
    rawDescription: repeatSentence(baseSentence, 35),
    normalizedResponsibilities: [repeatSentence(baseSentence, 30)],
    normalizedRequirements: [
      repeatSentence(
        'Drive enterprise strategy, security, and CX operations with AWS, Kubernetes, Terraform, Snowflake, ServiceNow, Jira, and ServiceNow ticketing.',
        20,
      ),
    ],
    sourceUrl: 'https://example.com/job/strategic-lead',
  },
  baseline: {
    version: 3,
    sections: baseSections,
  },
};

const adjacentJobInput: FitScoreInput = {
  job: {
    title: 'Program Manager',
    company: 'ExampleCo',
    rawDescription: repeatSentence(
      `${baseSentence} Support customer experience operations and global teams.`,
      22,
    ),
    normalizedResponsibilities: [
      repeatSentence(
        `${baseSentence} Support customer experience operations and global teams.`,
        20,
      ),
    ],
    normalizedRequirements: [
      repeatSentence(
        'Experience with AWS, Kubernetes, and Terraform while supporting customer experience and strategy programs.',
        20,
      ),
    ],
    sourceUrl: 'https://example.com/job/ops-program',
  },
  baseline: {
    version: 3,
    sections: baseSections,
  },
};

const weakJobInput: FitScoreInput = {
  job: {
    title: 'Systems Associate',
    company: 'ExampleCo',
    rawDescription: repeatSentence(
      'Execute day-to-day break fix tasks, maintain monitoring dashboards, and assist in incident response.',
      30,
    ),
    normalizedResponsibilities: [
      repeatSentence(
        'Execute day-to-day break fix tasks, maintain monitoring dashboards, and assist in incident response.',
        25,
      ),
    ],
    normalizedRequirements: [
      repeatSentence(
        'Comfortable with general ops work and basic Linux troubleshooting.',
        25,
      ),
    ],
    sourceUrl: null,
  },
  baseline: {
    version: 3,
    sections: baseSections,
  },
};

describe('FitScoreEngine golden bands', () => {
  const engine = new FitScoreEngine();

  it('scores strong inputs above 85 with Apply verdict', async () => {
    const result = await engine.score(strongJobInput);
    expect(result.overallScore).toBeGreaterThanOrEqual(85);
    expect(result.verdict).toBe('Apply');
  });

  it('scores adjacent inputs between 65 and 85', async () => {
    const result = await engine.score(adjacentJobInput);
    expect(result.overallScore).toBeGreaterThanOrEqual(65);
    expect(result.overallScore).toBeLessThan(85);
  });

  it('scores weak inputs at or below 65', async () => {
    const result = await engine.score(weakJobInput);
    expect(result.overallScore).toBeLessThanOrEqual(65);
  });

  it('is deterministic within a 2-point delta for repeated runs', async () => {
    const first = await engine.score(adjacentJobInput);
    const second = await engine.score(adjacentJobInput);
    expect(
      Math.abs(first.overallScore - second.overallScore),
    ).toBeLessThanOrEqual(2);
  });
});

describe('FitScoreEngine job text override', () => {
  const engine = new FitScoreEngine();
  const baseJobInput: FitScoreInput = {
    job: {
      title: 'Override Test',
      company: 'ExampleCo',
      rawDescription: 'Raw leads from executive ops.',
      normalizedResponsibilities: ['Run operations'],
      normalizedRequirements: ['5 years operations'],
      sourceUrl: null,
    },
    baseline: {
      version: 1,
      sections: baseSections,
    },
  };

  it('prefers jobTextOverride when present', async () => {
    const spy = jest.spyOn(
      engine as unknown as { selectJobText: SelectJobTextInvoker },
      'selectJobText',
    );
    const overrideToken = 'FULL RAW CONTEXT';
    const input = {
      ...baseJobInput,
      job: {
        ...baseJobInput.job,
        jobTextOverride: overrideToken,
      },
    };

    await engine.score(input);
    const result = spy.mock.results[0];
    expect(result).toBeDefined();
    const selection = result.value;
    assertSelection(selection);
    expect(selection.text).toContain(overrideToken);
    spy.mockRestore();
  });

  it('falls back to normalized sections when override absent', async () => {
    const spy = jest.spyOn(
      engine as unknown as { selectJobText: SelectJobTextInvoker },
      'selectJobText',
    );
    const input = {
      ...baseJobInput,
      job: {
        ...baseJobInput.job,
        rawDescription: '',
        jobTextOverride: undefined,
        normalizedResponsibilities: ['Normalized one'],
        normalizedRequirements: ['Normalized two'],
      },
    };

    await engine.score(input);
    const result = spy.mock.results[0];
    expect(result).toBeDefined();
    const selection = result.value;
    assertSelection(selection);
    expect(selection.text).toContain('Normalized one');
    expect(selection.source).toBe('normalizedSections');
    spy.mockRestore();
  });
});
