import {
  listSyntheticGenerationScenarioBundles,
} from './generation/synthetic-generation.fixtures';
import {
  validateSyntheticGenerationScenario,
} from './generation/synthetic-generation.types';

describe('synthetic scenario validation', () => {
  it('accepts the curated fixture contracts', () => {
    for (const bundle of listSyntheticGenerationScenarioBundles()) {
      const validation = validateSyntheticGenerationScenario(bundle.scenario);
      expect(validation.valid).toBe(true);
      expect(validation.issues).toEqual([]);
    }
  });

  it('reports missing required fields', () => {
    const validation = validateSyntheticGenerationScenario({
      name: 'Broken scenario',
      baselineFixtureId: 'baseline-broken',
      jobFixtureId: 'job-broken',
      id: 'broken-scenario',
      title: 'Broken scenario',
      personaKey: 'broken-persona',
      baselineSourceArtifact: { kind: 'fixture', fixtureId: 'baseline-broken' },
      targetSourceArtifact: { kind: 'fixture', fixtureId: 'job-broken' },
      tags: [],
      expected: {
        generationMode: 'generate',
        requiresResume: true,
        requiresCoverLetter: true,
        minRoleMatchReadiness: 'ready',
        mustPassCalibrationBar: true,
        maxHighSeverityCalibrationGaps: 1,
        requiredRoleSignals: [],
        bannedFailureStates: [],
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        'expected.minFitScore',
        'expected.requiredRoleSignals',
        'expected.bannedFailureStates',
      ]),
    );
  });
});
