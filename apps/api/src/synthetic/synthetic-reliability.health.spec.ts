import { computeSyntheticReliabilityHealthRollup } from './synthetic-reliability.health';

describe('synthetic reliability health rollup', () => {
  it('reports unknown when there is no run history', () => {
    const rollup = computeSyntheticReliabilityHealthRollup([], '2026-04-12T10:00:00.000Z', 15);

    expect(rollup.status).toBe('unknown');
    expect(rollup.recencyLabel).toBe('No run history yet');
    expect(rollup.failingSuites).toBe(0);
  });

  it('reports failing when at least one suite failed', () => {
    const rollup = computeSyntheticReliabilityHealthRollup(
      [
        {
          suiteKey: 'landing-public-journeys',
          suiteName: 'Landing / Auth Synthetic',
          surface: 'Public landing + auth',
          category: 'Public conversion',
          journeySummary: 'Landing render, upload, and auth.',
          active: true,
          validatedJourneys: [],
          dependencies: [],
          envInputs: [],
          sourceRefs: [],
          artifactRefs: [],
          latestRun: {
            id: 'run-1',
            status: 'fail',
            startedAt: '2026-04-12T09:55:00.000Z',
            finishedAt: '2026-04-12T09:56:00.000Z',
            durationMs: 60000,
            ageMinutes: 4,
            isStale: false,
            summary: 'Auth redirect mismatch',
            errorMessage: 'Auth redirect mismatch',
            failureReason: 'Auth redirect mismatch',
            firstFailureStep: null,
            rawStatus: 'failed',
            stepCount: 6,
          },
          recentHistory: [],
          provenance: {
            registrySource: 'static-registry',
            latestRunSource: 'database',
            historySource: 'database',
          },
        },
      ],
      '2026-04-12T10:00:00.000Z',
      15,
    );

    expect(rollup.status).toBe('failing');
    expect(rollup.failingSuites).toBe(1);
    expect(rollup.failingSuiteNames).toEqual(['Landing / Auth Synthetic']);
  });

  it('reports stale when the latest run exceeds the threshold', () => {
    const rollup = computeSyntheticReliabilityHealthRollup(
      [
        {
          suiteKey: 'landing-public-journeys',
          suiteName: 'Landing / Auth Synthetic',
          surface: 'Public landing + auth',
          category: 'Public conversion',
          journeySummary: 'Landing render, upload, and auth.',
          active: true,
          validatedJourneys: [],
          dependencies: [],
          envInputs: [],
          sourceRefs: [],
          artifactRefs: [],
          latestRun: {
            id: 'run-1',
            status: 'pass',
            startedAt: '2026-04-12T09:30:00.000Z',
            finishedAt: '2026-04-12T09:31:00.000Z',
            durationMs: 60000,
            ageMinutes: 29,
            isStale: true,
            summary: 'Landing/auth synthetic passed',
            errorMessage: null,
            failureReason: null,
            firstFailureStep: null,
            rawStatus: 'succeeded',
            stepCount: 6,
          },
          recentHistory: [],
          provenance: {
            registrySource: 'static-registry',
            latestRunSource: 'database',
            historySource: 'database',
          },
        },
      ],
      '2026-04-12T10:00:00.000Z',
      15,
    );

    expect(rollup.status).toBe('stale');
    expect(rollup.recencyLabel).toBe('stale');
    expect(rollup.staleSuites).toBe(1);
  });

  it('rolls up multiple suites including password reset synthetic coverage', () => {
    const rollup = computeSyntheticReliabilityHealthRollup(
      [
        {
          suiteKey: 'landing-public-journeys',
          suiteName: 'Landing / Auth Synthetic',
          surface: 'Public landing + auth',
          category: 'Public conversion',
          journeySummary: 'Landing render, upload, and auth.',
          active: true,
          validatedJourneys: [],
          dependencies: [],
          envInputs: [],
          sourceRefs: [],
          artifactRefs: [],
          latestRun: {
            id: 'run-1',
            status: 'pass',
            startedAt: '2026-04-12T10:00:00.000Z',
            finishedAt: '2026-04-12T10:01:00.000Z',
            durationMs: 60000,
            ageMinutes: 0,
            isStale: false,
            summary: 'Landing/auth synthetic passed',
            errorMessage: null,
            failureReason: null,
            firstFailureStep: null,
            rawStatus: 'succeeded',
            stepCount: 6,
          },
          recentHistory: [],
          provenance: {
            registrySource: 'static-registry',
            latestRunSource: 'database',
            historySource: 'database',
          },
        },
        {
          suiteKey: 'password-reset-public-journeys',
          suiteName: 'Password Reset Synthetic',
          surface: 'Public auth + recovery',
          category: 'Authentication recovery',
          journeySummary: 'Password reset and authentication recovery.',
          active: true,
          validatedJourneys: [],
          dependencies: [],
          envInputs: [],
          sourceRefs: [],
          artifactRefs: [],
          latestRun: {
            id: 'run-2',
            status: 'fail',
            startedAt: '2026-04-12T09:45:00.000Z',
            finishedAt: '2026-04-12T09:46:00.000Z',
            durationMs: 60000,
            ageMinutes: 14,
            isStale: false,
            summary: 'Password reset token retrieval failed',
            errorMessage: 'No reset token found',
            failureReason: 'No reset token found',
            firstFailureStep: null,
            rawStatus: 'failed',
            stepCount: 6,
          },
          recentHistory: [],
          provenance: {
            registrySource: 'static-registry',
            latestRunSource: 'database',
            historySource: 'database',
          },
        },
      ],
      '2026-04-12T10:00:00.000Z',
      15,
    );

    expect(rollup.status).toBe('failing');
    expect(rollup.failingSuites).toBe(1);
    expect(rollup.failingSuiteNames).toContain('Password Reset Synthetic');
    expect(rollup.lastSuccessfulPublishAt).toBe('2026-04-12T10:01:00.000Z');
  });
});
