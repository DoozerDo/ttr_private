import { evaluateSyntheticGenerationScenario } from './generation/synthetic-generation.evaluator';
import { listSyntheticGenerationScenarioBundles } from './generation/synthetic-generation.fixtures';
import { buildSyntheticTestPlan } from './synthetic-test-plan';

function buildPlan(bundle = listSyntheticGenerationScenarioBundles()[1], fitScore = 86) {
  return buildSyntheticTestPlan(bundle, fitScore);
}

describe('synthetic calibration bridge', () => {
  it('includes benchmark-backed calibration fields and minimum bar evaluation', () => {
    const bundle = listSyntheticGenerationScenarioBundles()[1];
    const result = evaluateSyntheticGenerationScenario({
      scenario: bundle.scenario,
      fitScore: 86,
      plan: buildPlan(bundle, 86),
      generatedResume: {
        summary:
          'Service delivery and incident operations leader focused on incident response, service reliability, process architecture, support operations, and cross-functional leadership.',
        experience: [
          {
            bullets: [
              'Led incident response and service delivery routines that improved recovery time.',
              'Built process architecture and escalation ownership across support operations.',
              'Partnered with product and engineering on cross-functional leadership and follow-through.',
            ],
          },
        ],
      },
      generatedCoverLetter: {
        salutation: 'Dear Hiring Team,',
        opening:
          'I am applying because I have led incident response, service delivery, process architecture, support operations, and cross-functional leadership.',
        bodyParagraphs: [
          'I make escalations visible and easier to execute.',
          'I turn service data into steadier operating discipline.',
        ],
        closingParagraph: 'I would welcome the chance to discuss the role.',
        signoff: 'Sincerely,',
        signatureName: 'Synthetic Candidate',
      },
      jobDescription: bundle.job.rawDescription,
      benchmark: bundle.benchmark ?? null,
    });

    expect(result.overallCalibration).toMatch(/aligned|close|off_target/);
    expect(result.calibrationBarPassed).not.toBeNull();
    expect(result.highSeverityCalibrationGapCount).toEqual(expect.any(Number));
  });
});
