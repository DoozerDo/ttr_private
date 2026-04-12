import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { SyntheticCleanupRun } from './synthetic-cleanup-run.entity';
import {
  computeSyntheticReliabilityHealthRollup,
  resolveSyntheticReliabilityStaleThresholdMinutes,
} from './synthetic-reliability.health';
import { listSyntheticReliabilitySuites } from './synthetic-reliability.registry';
import type {
  SyntheticReliabilityIngestInput,
  SyntheticReliabilityPayload,
  SyntheticReliabilityFirstFailureStep,
  SyntheticReliabilityRunViewModel,
  SyntheticReliabilityStatus,
  SyntheticReliabilitySuiteViewModel,
} from './synthetic-reliability.types';

function nowIso(): string {
  return new Date().toISOString();
}

function resolveStaleThresholdMinutes(): number {
  return resolveSyntheticReliabilityStaleThresholdMinutes(process.env.SYNTHETIC_RELIABILITY_STALE_MINUTES);
}

function resolveRunAgeMinutes(run: SyntheticCleanupRun, generatedAt: string): number | null {
  const latestTimestamp = run.finishedAt ?? run.startedAt;
  if (!latestTimestamp) {
    return null;
  }

  const generatedAtMs = new Date(generatedAt).getTime();
  const runMs = latestTimestamp.getTime();
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(runMs)) {
    return null;
  }

  return Math.max(0, Math.floor((generatedAtMs - runMs) / 60000));
}

function resolveLatestTimestamp(runs: SyntheticCleanupRun[], selector: (run: SyntheticCleanupRun) => Date | null): string | null {
  let latest: Date | null = null;

  for (const run of runs) {
    const candidate = selector(run);
    if (!candidate) continue;
    if (!latest || candidate.getTime() > latest.getTime()) {
      latest = candidate;
    }
  }

  return latest ? latest.toISOString() : null;
}

function resolveFirstFailureStep(stepResultsJson: Array<Record<string, unknown>>): SyntheticReliabilityFirstFailureStep | null {
  for (const result of stepResultsJson) {
    const status = typeof result.status === 'string' ? result.status.toLowerCase() : '';
    if (status !== 'failed' && status !== 'timedout' && status !== 'timed_out') {
      continue;
    }

    const key = typeof result.key === 'string' && result.key.trim() ? result.key.trim() : 'unknown-step';
    const title =
      typeof result.title === 'string' && result.title.trim()
        ? result.title.trim()
        : typeof result.name === 'string' && result.name.trim()
          ? result.name.trim()
          : key;
    const errorMessage =
      typeof result.errorMessage === 'string' && result.errorMessage.trim()
        ? result.errorMessage.trim()
        : typeof result.message === 'string' && result.message.trim()
          ? result.message.trim()
          : null;

    return {
      key,
      title,
      status,
      errorMessage,
    };
  }

  return null;
}

function normalizeRunStatus(
  run: SyntheticCleanupRun,
  summaryJson?: Record<string, unknown> | null,
): SyntheticReliabilityStatus {
  const summaryStatus = typeof summaryJson?.syntheticStatus === 'string' ? summaryJson.syntheticStatus : null;
  const normalized = (summaryStatus ?? run.status).toLowerCase();

  if (normalized === 'pass' || normalized === 'succeeded' || normalized === 'dry_run') return 'pass';
  if (normalized === 'fail' || normalized === 'failed') return 'fail';
  if (normalized === 'running' || normalized === 'started') return 'running';
  return 'unknown';
}

function summarizeRun(
  run: SyntheticCleanupRun,
  summaryJson?: Record<string, unknown> | null,
): string {
  const candidates = [
    summaryJson?.summary,
    summaryJson?.message,
    summaryJson?.headline,
    summaryJson?.shortSummary,
    summaryJson?.description,
    run.errorMessage,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return run.status === 'failed' ? 'Synthetic transaction suite failed.' : 'Synthetic transaction suite has not reported a summary yet.';
}

function normalizeRun(run: SyntheticCleanupRun): SyntheticReliabilityRunViewModel {
  const summaryJson = (run.summaryJson ?? {}) as Record<string, unknown>;
  const stepResultsJson = Array.isArray(run.stepResultsJson) ? run.stepResultsJson : [];
  const generatedAt = nowIso();
  const ageMinutes = resolveRunAgeMinutes(run, generatedAt);
  const staleThresholdMinutes = resolveStaleThresholdMinutes();

  return {
    id: run.id,
    status: normalizeRunStatus(run, summaryJson),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    durationMs: typeof run.durationMs === 'number' ? run.durationMs : null,
    ageMinutes,
    isStale: typeof ageMinutes === 'number' && ageMinutes >= staleThresholdMinutes,
    summary: summarizeRun(run, summaryJson),
    errorMessage: run.errorMessage ?? (typeof summaryJson.errorMessage === 'string' ? summaryJson.errorMessage : null),
    failureReason:
      run.errorMessage ??
      (typeof summaryJson.errorMessage === 'string' ? summaryJson.errorMessage : null),
    firstFailureStep: resolveFirstFailureStep(stepResultsJson),
    rawStatus: run.status,
    stepCount: stepResultsJson.length,
  };
}

function resolveDbStatus(status: SyntheticReliabilityStatus): SyntheticCleanupRun['status'] {
  if (status === 'pass') return 'succeeded';
  if (status === 'fail') return 'failed';
  return 'started';
}

@Injectable()
export class SyntheticReliabilityService {
  constructor(
    @InjectRepository(SyntheticCleanupRun)
    private readonly syntheticRunRepository: Repository<SyntheticCleanupRun>,
  ) {}

  async getReliabilityReport(historyLimit = 5): Promise<SyntheticReliabilityPayload> {
    const registry = listSyntheticReliabilitySuites();
    const suiteKeys = registry.map((suite) => suite.suiteKey);
    const boundedHistoryLimit = Math.min(Math.max(historyLimit, 1), 20);
    const generatedAt = nowIso();
    const runs = suiteKeys.length
      ? await this.syntheticRunRepository.find({
          where: {
            runType: 'synthetic_transaction',
            scenarioKey: In(suiteKeys),
          },
          order: {
            startedAt: 'DESC',
          },
        })
      : [];

    const bySuiteKey = new Map<string, SyntheticCleanupRun[]>();
    for (const run of runs) {
      const key = run.scenarioKey ?? 'unknown';
      const next = bySuiteKey.get(key) ?? [];
      next.push(run);
      bySuiteKey.set(key, next);
    }

    const suites: SyntheticReliabilitySuiteViewModel[] = registry.map((suite) => {
      const suiteRuns = bySuiteKey.get(suite.suiteKey) ?? [];
      const recentHistory = suiteRuns.slice(0, boundedHistoryLimit).map(normalizeRun);
      const latestRun = recentHistory[0] ?? null;
      const latestTimestamp = latestRun?.finishedAt ?? latestRun?.startedAt ?? null;
      const latestRunAgeMinutes =
        latestTimestamp && Number.isFinite(new Date(generatedAt).getTime())
          ? Math.max(0, Math.floor((new Date(generatedAt).getTime() - new Date(latestTimestamp).getTime()) / 60000))
          : null;
      const isLatestRunStale =
        typeof latestRunAgeMinutes === 'number' &&
        latestRunAgeMinutes >= resolveStaleThresholdMinutes();

      return {
        ...suite,
        latestRun: latestRun
          ? {
              ...latestRun,
              ageMinutes: latestRunAgeMinutes,
              isStale: isLatestRunStale,
            }
          : null,
        recentHistory,
        provenance: {
          registrySource: 'static-registry',
          latestRunSource: suiteRuns.length > 0 ? 'database' : 'none',
          historySource: suiteRuns.length > 0 ? 'database' : 'none',
        },
      };
    });

    const statusCounts = suites.reduce<Record<SyntheticReliabilityStatus, number>>(
      (acc, suite) => {
        acc[suite.latestRun?.status ?? 'unknown'] += 1;
        return acc;
      },
      { pass: 0, fail: 0, running: 0, unknown: 0 },
    );
    const lastAttemptedPublishAt = resolveLatestTimestamp(runs, (run) => run.startedAt ?? null);
    const lastSuccessfulPublishAt = resolveLatestTimestamp(runs, (run) =>
      run.status === 'succeeded' || run.status === 'failed'
        ? run.finishedAt ?? run.startedAt ?? null
        : null,
    );
    const healthRollup = computeSyntheticReliabilityHealthRollup(
      suites,
      generatedAt,
      resolveStaleThresholdMinutes(),
    );

    return {
      generatedAt,
      suiteCount: suites.length,
      suites,
      statusCounts,
      healthRollup: {
        ...healthRollup,
        lastSuccessfulPublishAt,
        lastAttemptedPublishAt,
      },
      sources: {
        registry: 'static-registry',
        latestRuns: 'synthetic_cleanup_runs',
      },
    };
  }

  async recordRun(input: SyntheticReliabilityIngestInput): Promise<SyntheticReliabilityRunViewModel> {
    const startedAt = new Date(input.startedAt);
    const finishedAt = input.completedAt
      ? new Date(input.completedAt)
      : input.finishedAt
        ? new Date(input.finishedAt)
        : null;
    const payloadSummary = input.summary ?? {};
    const syntheticStatus = input.status;
    const run = await this.syntheticRunRepository.save(
      this.syntheticRunRepository.create({
        runType: 'synthetic_transaction',
        scenarioKey: input.suiteKey,
        syntheticRunId: input.runId ?? null,
        status: resolveDbStatus(syntheticStatus),
        triggerSource: 'system',
        startedAt,
        finishedAt,
        durationMs: typeof input.durationMs === 'number' ? input.durationMs : null,
        summaryJson: {
          ...payloadSummary,
          syntheticStatus,
          syntheticSource: input.source ?? 'external',
          summary: typeof payloadSummary.summary === 'string' ? payloadSummary.summary : payloadSummary.message ?? null,
          environment: input.environment ?? payloadSummary.environment ?? null,
          validatedJourneys: input.validatedJourneys ?? payloadSummary.validatedJourneys ?? null,
        },
        stepResultsJson: Array.isArray(input.stepResults) ? input.stepResults : [],
        errorMessage: input.failureReason ?? input.errorMessage ?? null,
      }),
    );

    return normalizeRun(run);
  }
}
