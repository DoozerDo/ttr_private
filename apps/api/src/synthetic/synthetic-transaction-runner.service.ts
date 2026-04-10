import { Injectable } from "@nestjs/common";
import type { SyntheticGenerationSuiteResult } from "./generation/synthetic-generation.types";
import type { SyntheticCleanupRun } from "./synthetic-cleanup-run.entity";

export type SyntheticTransactionResult = {
  status: "pass" | "fail";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: Record<string, unknown>;
  errorMessage: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptySuiteResult(): SyntheticGenerationSuiteResult {
  const startedAt = nowIso();
  return {
    status: "pass",
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    scenarioResults: [],
    passCount: 0,
    failCount: 0,
    summary: {},
    errorMessage: null,
  };
}

function emptyTransactionResult(): SyntheticTransactionResult {
  const startedAt = nowIso();
  return {
    status: "pass",
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    summary: {},
    errorMessage: null,
  };
}

@Injectable()
export class SyntheticTransactionRunnerService {
  async runCoreLoopSmoke(_triggerSource: "manual" | "system" = "manual"): Promise<SyntheticTransactionResult> {
    return emptyTransactionResult();
  }

  async runDocumentGenerationHarnessSuite(
    _triggerSource: "manual" | "system" = "manual",
  ): Promise<SyntheticGenerationSuiteResult> {
    return emptySuiteResult();
  }

  async listRecentSyntheticTransactionRuns(
    _limit = 20,
  ): Promise<SyntheticCleanupRun[]> {
    return [];
  }

  async getLatestCoreLoopRun(): Promise<SyntheticCleanupRun | null> {
    return null;
  }
}
