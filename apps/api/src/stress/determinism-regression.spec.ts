import { compareArtifactDeterminism } from './artifact-validation.harness';

describe('determinism regression harness', () => {
  it('reports identical artifacts as deterministic', () => {
    const artifact = {
      traceMap: { a: ['e1'], b: ['e2'] },
      debugTrace: {
        passed: true,
        failures: [],
        traceCoverage: 100,
        unusedEvidence: ['e3'],
        selectedEvidence: ['e1', 'e2'],
      },
    };

    expect(compareArtifactDeterminism(artifact, artifact)).toBe(true);
  });
});
