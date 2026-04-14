import { FitScoreEngine } from './fit-score.engine';
import type { FitScoreInput } from './fit-score.types';

const baseSentence =
  'Lead and scale support operations with SLAs, CSAT, first response time, time to resolution, backlog management, QA reviews, ticket audits, operating rhythms, incident management, escalation frameworks, and executive reporting across cross-functional leadership.';

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
      'Head of Support / Director of Support and Support Operations leader. Owned incident management, incident communications, and escalation frameworks; built operating rhythms; and drove KPIs like SLAs, CSAT, first response time, and time to resolution with backlog management, QA reviews, and ticket audits. Led and scale global support teams with org design, hiring and performance management, executive reporting, customer advocacy, and cross-functional leadership. Drove change management initiatives with executive influence across Product, Engineering, and Finance teams supporting compliance and subscription billing workflows for enterprise customers.',
  },
  {
    type: 'SKILLS',
    content:
      'ServiceNow, Jira Service Management, Zendesk, automation, routing rules, macros, reporting dashboards, backlog management, QA reviews, ticket audits',
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
        'Lead and scale the support function. Own support operations rigor with KPIs, operating rhythms, quality assurance, root cause analysis, incident management, escalation frameworks, and executive reporting. Drive ticketing platform migration, automation, routing, macros, and reporting dashboards using ServiceNow and Zendesk. Support enterprise customers in compliance and subscription billing / accounting workflows. Be the voice of support with cross-functional planning, customer-impacting incidents, and customer advocacy.',
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
        'Experience supporting KPIs, operating rhythms, ticket audits, backlog management, and QA reviews while partnering cross-functionally on root cause analysis and reporting dashboards.',
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
      rawDescription: repeatSentence(baseSentence, 35),
      normalizedResponsibilities: [repeatSentence('Run support operations with KPIs and operating rhythms.', 40)],
      normalizedRequirements: [repeatSentence('Experience with ServiceNow, dashboards, and cross-functional leadership.', 40)],
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
    const overrideToken = repeatSentence('FULL RAW CONTEXT for support operations and incident management.', 80);
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
        normalizedResponsibilities: [repeatSentence('Normalized one', 200)],
        normalizedRequirements: [repeatSentence('Normalized two', 200)],
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
