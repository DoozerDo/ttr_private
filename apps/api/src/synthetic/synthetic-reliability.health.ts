import type {
  SyntheticReliabilityHealthRollup,
  SyntheticReliabilityHealthStatus,
  SyntheticReliabilitySuiteViewModel,
} from './synthetic-reliability.types';

const DEFAULT_STALE_THRESHOLD_MINUTES = 15;

function normalizeThresholdMinutes(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_STALE_THRESHOLD_MINUTES;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), 1440);
}

function resolveRunTimestamp(run: SyntheticReliabilitySuiteViewModel['latestRun']): string | null {
  if (!run) return null;
  return run.finishedAt ?? run.startedAt ?? null;
}

function formatRecencyLabel(ageMinutes: number | null, isStale: boolean): string {
  if (ageMinutes === null) {
    return 'No run history yet';
  }

  if (isStale) {
    return 'stale';
  }

  if (ageMinutes < 1) {
    return 'last run just now';
  }

  if (ageMinutes === 1) {
    return 'last run 1 min ago';
  }

  return `last run ${ageMinutes} min ago`;
}

function pickHealthStatus(
  failingSuites: number,
  staleSuites: number,
  hasKnownRun: boolean,
  allPassing: boolean,
): SyntheticReliabilityHealthStatus {
  if (failingSuites > 0) {
    return 'failing';
  }

  if (staleSuites > 0) {
    return 'stale';
  }

  if (!hasKnownRun) {
    return 'unknown';
  }

  return allPassing ? 'all_passing' : 'unknown';
}

function statusLabel(status: SyntheticReliabilityHealthStatus): string {
  switch (status) {
    case 'all_passing':
      return 'All passing';
    case 'failing':
      return 'Failing';
    case 'stale':
      return 'Stale';
    default:
      return 'Unknown';
  }
}

export function resolveSyntheticReliabilityStaleThresholdMinutes(value?: unknown): number {
  return normalizeThresholdMinutes(value);
}

export function computeSyntheticReliabilityHealthRollup(
  suites: SyntheticReliabilitySuiteViewModel[],
  generatedAt: string,
  staleThresholdMinutes: number = DEFAULT_STALE_THRESHOLD_MINUTES,
): SyntheticReliabilityHealthRollup {
  const referenceTime = new Date(generatedAt).getTime();
  const normalizedThreshold = Math.min(Math.max(Math.floor(staleThresholdMinutes), 1), 1440);

  const latestRuns = suites
    .map((suite) => ({
      suiteName: suite.suiteName,
      latestRun: suite.latestRun,
      latestRunAt: resolveRunTimestamp(suite.latestRun),
    }))
    .filter((entry) => Boolean(entry.latestRunAt))
    .sort((left, right) => {
      const leftTime = new Date(left.latestRunAt ?? 0).getTime();
      const rightTime = new Date(right.latestRunAt ?? 0).getTime();
      return rightTime - leftTime;
    });

  const latestRunAt = latestRuns[0]?.latestRunAt ?? null;
  const latestRunAgeMinutes =
    latestRunAt && Number.isFinite(referenceTime)
      ? Math.max(0, Math.floor((referenceTime - new Date(latestRunAt).getTime()) / 60000))
      : null;
  const hasKnownRun = suites.some((suite) => suite.latestRun !== null);
  const failingSuiteNames = suites
    .filter((suite) => suite.latestRun?.status === 'fail')
    .map((suite) => suite.suiteName);
  const staleSuiteNames = suites
    .filter((suite) => {
      if (!suite.latestRun) {
        return false;
      }
      const timestamp = resolveRunTimestamp(suite.latestRun);
      if (!timestamp || !Number.isFinite(referenceTime)) {
        return false;
      }
      const ageMinutes = Math.max(0, Math.floor((referenceTime - new Date(timestamp).getTime()) / 60000));
      return ageMinutes >= normalizedThreshold;
    })
    .map((suite) => suite.suiteName);
  const staleSuites = staleSuiteNames.length;
  const failingSuites = failingSuiteNames.length;
  const allPassing = suites.every(
    (suite) => suite.latestRun?.status === 'pass' && suite.latestRun?.isStale !== true,
  );
  const status = pickHealthStatus(failingSuites, staleSuites, hasKnownRun, allPassing);

  return {
    status,
    statusLabel: statusLabel(status),
    failingSuites,
    failingSuiteNames,
    staleSuites,
    staleSuiteNames,
    latestRunAt,
    latestRunAgeMinutes,
    lastSuccessfulPublishAt: latestRunAt,
    lastAttemptedPublishAt: latestRunAt,
    recencyLabel: formatRecencyLabel(latestRunAgeMinutes, status === 'stale'),
    staleThresholdMinutes: normalizedThreshold,
  };
}
