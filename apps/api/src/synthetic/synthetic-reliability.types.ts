import type { SyntheticCleanupRun } from './synthetic-cleanup-run.entity';
import type { SyntheticReliabilitySuiteRegistryEntry } from './synthetic-reliability.registry';

export type SyntheticReliabilityStatus = 'pass' | 'fail' | 'running' | 'unknown';

export type SyntheticReliabilityHealthStatus = 'all_passing' | 'failing' | 'stale' | 'unknown';

export type SyntheticReliabilityHealthRollup = {
  status: SyntheticReliabilityHealthStatus;
  statusLabel: string;
  failingSuites: number;
  failingSuiteNames: string[];
  staleSuites: number;
  staleSuiteNames: string[];
  latestRunAt: string | null;
  latestRunAgeMinutes: number | null;
  lastSuccessfulPublishAt: string | null;
  lastAttemptedPublishAt: string | null;
  recencyLabel: string;
  staleThresholdMinutes: number;
};

export type SyntheticReliabilityFirstFailureStep = {
  key: string;
  title: string;
  status: string;
  errorMessage: string | null;
};

export type SyntheticReliabilityRunViewModel = {
  id: string;
  status: SyntheticReliabilityStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  ageMinutes: number | null;
  isStale: boolean;
  summary: string;
  errorMessage: string | null;
  failureReason: string | null;
  firstFailureStep: SyntheticReliabilityFirstFailureStep | null;
  rawStatus: SyntheticCleanupRun['status'];
  stepCount: number;
};

export type SyntheticReliabilityIngestInput = {
  suiteKey: string;
  status: SyntheticReliabilityStatus;
  startedAt: string;
  completedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  summary?: Record<string, unknown>;
  stepResults?: Array<Record<string, unknown>>;
  environment?: Record<string, unknown> | null;
  validatedJourneys?: string[] | null;
  errorMessage?: string | null;
  failureReason?: string | null;
  runId?: string | null;
  source?: string | null;
};

export type SyntheticReliabilitySuiteViewModel = SyntheticReliabilitySuiteRegistryEntry & {
  latestRun: SyntheticReliabilityRunViewModel | null;
  recentHistory: SyntheticReliabilityRunViewModel[];
  provenance: {
    registrySource: 'static-registry';
    latestRunSource: 'database' | 'none';
    historySource: 'database' | 'none';
  };
};

export type SyntheticReliabilityPayload = {
  generatedAt: string;
  suiteCount: number;
  suites: SyntheticReliabilitySuiteViewModel[];
  statusCounts: Record<SyntheticReliabilityStatus, number>;
  healthRollup: SyntheticReliabilityHealthRollup;
  sources: {
    registry: 'static-registry';
    latestRuns: 'synthetic_cleanup_runs';
  };
};
