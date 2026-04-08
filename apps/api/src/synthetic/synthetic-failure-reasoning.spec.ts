import {
  evaluateSyntheticGenerationScenario,
} from './generation/synthetic-generation.evaluator';
import {
  listSyntheticGenerationScenarioBundles,
} from './generation/synthetic-generation.fixtures';
import { buildSyntheticTestPlan } from './synthetic-test-plan';

function buildPlan(bundle = listSyntheticGenerationScenarioBundles()[0], fitScore = 60) {
  return buildSyntheticTestPlan(bundle, fitScore);
}

describe('synthetic failure reasoning', () => {
  it('returns explicit failure reasons when generation is missing or score is too low', () => {
    const bundle = listSyntheticGenerationScenarioBundles()[0];
    const result = evaluateSyntheticGenerationScenario({
      scenario: bundle.scenario,
      fitScore: 60,
      plan: buildPlan(bundle, 60),
      generatedResume: null,
      generatedCoverLetter: null,
      jobDescription: bundle.job.rawDescription,
      benchmark: null,
    });

    expect(result.status).toBe('fail');
    expect(result.failureReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Fit score 60 fell below'),
        expect.stringContaining('Resume was not generated or is empty'),
        expect.stringContaining('Cover letter was not generated or is empty'),
      ]),
    );
  });
});
