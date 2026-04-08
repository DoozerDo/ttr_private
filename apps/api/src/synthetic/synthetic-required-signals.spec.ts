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
          `I am applying because I bring ${signals.join(', ')}.`,
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
