import fs from 'node:fs';
import path from 'node:path';

import { FitScoreEngine } from '../../src/scoring/fit-score/fit-score.engine';
import type { FitScoreInput } from '../../src/scoring/fit-score/fit-score.types';

type Fixture = {
  name: string;
  baseline: string;
  job: string;
};

const fixtures: Fixture[] = [
  {
    name: 'strong-fit',
    baseline: fs.readFileSync(path.resolve(__dirname, 'fixtures', 'strong.baseline.txt'), 'utf8'),
    job: fs.readFileSync(path.resolve(__dirname, 'fixtures', 'strong.job.txt'), 'utf8'),
  },
  {
    name: 'penalty-fit',
    baseline: fs.readFileSync(path.resolve(__dirname, 'fixtures', 'penalty.baseline.txt'), 'utf8'),
    job: fs.readFileSync(path.resolve(__dirname, 'fixtures', 'penalty.job.txt'), 'utf8'),
  },
];

const expectedOutputs: Record<
  typeof fixtures[number]['name'],
  {
    overallScore: number;
    dimensionScores: Record<string, number>;
    penaltiesApplied: string[];
  }
> = {
  'strong-fit': {
    overallScore: 100,
    dimensionScores: {
      experienceAlignment: 25,
      leadershipLevel: 25,
      strategicTacticalFit: 15,
      industryContext: 15,
      technicalPlatformFit: 20,
    },
    penaltiesApplied: [],
  },
  'penalty-fit': {
    overallScore: 5,
    dimensionScores: {
      experienceAlignment: 5,
      leadershipLevel: 5,
      strategicTacticalFit: 3,
      industryContext: 3,
      technicalPlatformFit: 4,
    },
    penaltiesApplied: ['scope_mismatch_downlevel', 'domain_mismatch_hard'],
  },
};

describe('CX Fit calibration suite', () => {
  const engine = new FitScoreEngine();

  fixtures.forEach((fixture) => {
    it('scores ' + fixture.name, async () => {
      const input: FitScoreInput = {
        job: {
          title: 'Calibration Test',
          company: 'Target This Role',
          rawDescription: fixture.job,
          normalizedResponsibilities: [],
          normalizedRequirements: [],
          sourceUrl: null,
        },
        baseline: {
          sections: [
            {
              type: 'EXPERIENCE',
              content: fixture.baseline,
            },
          ],
        },
      };

      const result = await engine.score(input);
      const expected = expectedOutputs[fixture.name];

      expect(result.overallScore).toBe(expected.overallScore);
      expect(result.dimensionScores).toEqual(expected.dimensionScores);
      expect(result.penaltiesApplied).toEqual(expected.penaltiesApplied);
    });
  });
});
