import { evaluateSyntheticGenerationScenario } from './generation/synthetic-generation.evaluator';
import { listSyntheticGenerationScenarioBundles } from './generation/synthetic-generation.fixtures';
import { buildSyntheticTestPlan } from './synthetic-test-plan';

function buildPlan(bundle = listSyntheticGenerationScenarioBundles()[0], fitScore = 86) {
  return buildSyntheticTestPlan(bundle, fitScore);
}

describe('synthetic required role signals', () => {
  it('detects required signals deterministically when the output is explicit', () => {
    const bundle = listSyntheticGenerationScenarioBundles()[2];
    const signals = bundle.scenario.expected.requiredRoleSignals;
    const scenario = {
      ...bundle.scenario,
      expected: {
        ...bundle.scenario.expected,
        minRoleMatchReadiness: 'needs_tightening' as const,
        mustPassCalibrationBar: false,
      },
    };
    const result = evaluateSyntheticGenerationScenario({
      scenario,
      fitScore: 86,
      plan: buildPlan(bundle, 86),
      generatedResume: {
        summary:
          `Customer Operations and Support Strategy leader focused on ${signals.join(', ')}.`,
        experience: [
          {
            bullets: [
              `Improved ${signals[0]} and ${signals[1]}.`,
              `Strengthened ${signals[2]} and ${signals[3]}.`,
              `Used ${signals[3]} to improve service delivery.`,
            ],
          },
        ],
      },
      generatedCoverLetter: {
        salutation: 'Dear Hiring Team,',
        opening:
          `I am applying because I bring ${signals.join(', ')} and I know how to translate those strengths into steady customer operations. I have worked in environments where the day to day work needed clear ownership, reliable workflow design, and direct follow through so leaders could see progress without guessing. That is the operating style I would bring here.`,
        bodyParagraphs: [
          `I keep ${signals[0]} visible and measurable by pairing operating reviews with practical reporting and straightforward ownership paths. That keeps the work moving and gives managers a clearer picture of what needs attention.`,
          `I connect the team around ${signals[1]} and ${signals[2]} by keeping the next owner, the next action, and the next check-in easy to see. That kind of follow through is how I help teams stay aligned when the pace changes.`,
          `I also rely on ${signals[3]} to make sure the work does not drift away from the customer or the business. When the team can see the process clearly, it becomes easier to reduce confusion, improve service quality, and keep improvement work practical.`,
          `Across all of that, I try to keep the writing and the operating rhythm simple enough that frontline managers can use it immediately. I have found that the best process changes are the ones people can repeat without extra translation, and that is where steady customer operations work creates the most value.`,
        ],
        closingParagraph:
          'I would welcome the chance to discuss the role and how this background could support a steadier operating rhythm, clearer ownership, and better customer outcomes over time.',
        signoff: 'Sincerely,',
        signatureName: 'Synthetic Candidate',
      },
      jobDescription: bundle.job.rawDescription,
      benchmark: null,
    });

    expect(result.status).toBe('pass');
    expect(result.detectedRoleSignals).toEqual(
      expect.arrayContaining(bundle.scenario.expected.requiredRoleSignals),
    );
  });

  it('fails when a required signal is missing', () => {
    const bundle = listSyntheticGenerationScenarioBundles()[2];
    const scenario = {
      ...bundle.scenario,
      expected: {
        ...bundle.scenario.expected,
        minRoleMatchReadiness: 'needs_tightening' as const,
        mustPassCalibrationBar: false,
        requiredRoleSignals: [
          ...bundle.scenario.expected.requiredRoleSignals.slice(0, 3),
          'zero-touch escalation governance',
        ],
      },
    };
    const result = evaluateSyntheticGenerationScenario({
      scenario,
      fitScore: 86,
      plan: buildPlan(bundle, 86),
      generatedResume: {
        summary:
          'Customer Operations and Support Strategy leader focused on customer operations leadership, support strategy, and workflow design.',
        experience: [
          {
            bullets: [
              'Improved customer operations leadership and support strategy.',
              'Strengthened workflow design.',
            ],
          },
        ],
      },
      generatedCoverLetter: {
        salutation: 'Dear Hiring Team,',
        opening:
          'I am applying because I bring customer operations leadership, support strategy, and workflow design.',
        bodyParagraphs: [
          'I keep service delivery visible and measurable.',
          'I connect the team around clear ownership and follow-through.',
        ],
        closingParagraph: 'I would welcome the chance to discuss the role.',
        signoff: 'Sincerely,',
        signatureName: 'Synthetic Candidate',
      },
      jobDescription: bundle.job.rawDescription,
      benchmark: null,
    });

    expect(result.status).toBe('fail');
    expect(result.failureReasons.join(' ')).toContain('Required role signals were not detected');
  });
});
