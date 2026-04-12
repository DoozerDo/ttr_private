import {
  passwordResetPublicJourneysSuiteKey,
  syntheticApiBaseURL,
  syntheticIngestToken,
} from "./synthetic-config";
import type {
  SyntheticJourneyRecord,
  SyntheticReliabilityPublishPayload,
} from "./synthetic-reliability-publisher";
import { publishLandingSyntheticReliabilityRun } from "./synthetic-reliability-publisher";

export type PasswordResetSyntheticJourneyRecord = SyntheticJourneyRecord;

const VALIDATED_JOURNEY_LABELS = [
  "Reset request is accepted",
  "Reset link is retrievable from the synthetic token store",
  "Reset link opens and accepts a new password",
  "New password logs in successfully",
  "Old password is rejected",
  "Reused reset link fails cleanly",
];

const JOURNEY_KEYS = [
  "reset.request",
  "reset.link",
  "reset.apply",
  "login.new-password",
  "login.old-password",
  "reset.reuse",
];

function buildSummary(
  status: "pass" | "fail",
  passedCount: number,
  totalCount: number,
  failureReason: string | null,
): string {
  if (status === "pass") {
    return `Password reset synthetic passed (${passedCount}/${totalCount} journeys).`;
  }

  return failureReason
    ? `Password reset synthetic failed (${passedCount}/${totalCount} journeys). ${failureReason}`
    : `Password reset synthetic failed (${passedCount}/${totalCount} journeys).`;
}

export function buildPasswordResetSyntheticReliabilityPayload(input: {
  startedAt: string;
  completedAt: string;
  status: "pass" | "fail";
  failureReason?: string | null;
  environment?: Partial<SyntheticReliabilityPublishPayload["environment"]>;
  stepResults: SyntheticReliabilityPublishPayload["stepResults"];
  runId?: string;
}): SyntheticReliabilityPublishPayload {
  const passedCount = input.stepResults.filter((step) => step.status === "passed").length;
  const totalCount = input.stepResults.length;
  const failureReason = input.failureReason?.trim() || null;

  return {
    suiteKey: passwordResetPublicJourneysSuiteKey,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: Math.max(0, new Date(input.completedAt).getTime() - new Date(input.startedAt).getTime()),
    summary: buildSummary(input.status, passedCount, totalCount, failureReason),
    failureReason,
    environment: {
      baseURL: input.environment?.baseURL || process.env.BASE_URL?.replace(/\/+$/, "") || "http://127.0.0.1:3100",
      apiBaseURL: input.environment?.apiBaseURL || syntheticApiBaseURL,
      browser: input.environment?.browser || "chromium",
      runMode: input.environment?.runMode || (process.env.CI ? "ci" : "local"),
    },
    validatedJourneys: [...VALIDATED_JOURNEY_LABELS],
    stepResults: input.stepResults,
    runId: input.runId || `password-reset-public-journeys-${input.startedAt}`,
    source: "playwright",
  };
}

export async function publishPasswordResetSyntheticReliabilityRun(
  payload: SyntheticReliabilityPublishPayload,
  options?: {
    baseUrl?: string;
    ingestToken?: string;
    fetchImpl?: typeof fetch;
    logger?: Pick<Console, "log" | "error" | "warn">;
  },
): Promise<boolean> {
  return publishLandingSyntheticReliabilityRun(payload, {
    baseUrl: options?.baseUrl,
    ingestToken: options?.ingestToken ?? syntheticIngestToken,
    fetchImpl: options?.fetchImpl,
    logger: options?.logger,
  });
}

export class PasswordResetSyntheticRunReporter {
  private readonly startedAt: string;
  private readonly records = new Map<string, PasswordResetSyntheticJourneyRecord>();
  private published = false;

  constructor(
    private readonly options: {
      baseURL?: string;
      apiBaseURL?: string;
      ingestToken?: string;
      browser?: string;
      runMode?: "local" | "ci";
      logger?: Pick<Console, "log" | "error" | "warn">;
    } = {},
  ) {
    this.startedAt = new Date().toISOString();
  }

  record(record: Omit<PasswordResetSyntheticJourneyRecord, "durationMs"> & { durationMs?: number }) {
    this.records.set(record.key, {
      ...record,
      durationMs: Math.max(0, record.durationMs ?? 0),
    });
  }

  buildPayload(): SyntheticReliabilityPublishPayload {
    const stepResults = JOURNEY_KEYS.map((key, index) => {
      const record = this.records.get(key);
      const title = record?.title ?? VALIDATED_JOURNEY_LABELS[index] ?? key;
      return {
        key,
        title,
        status: record?.status ?? "skipped",
        durationMs: record?.durationMs ?? 0,
        errorMessage: record?.errorMessage ?? null,
      };
    });

    const passedCount = stepResults.filter((step) => step.status === "passed").length;
    const failedRecord = stepResults.find((step) => step.status === "failed" || step.status === "timedOut");
    const status = passedCount === stepResults.length ? "pass" : "fail";
    const failureReason =
      failedRecord?.errorMessage ??
      (passedCount === stepResults.length ? null : "One or more journeys did not complete.");
    const completedAt = new Date().toISOString();

    return buildPasswordResetSyntheticReliabilityPayload({
      startedAt: this.startedAt,
      completedAt,
      status,
      failureReason,
      environment: {
        baseURL: this.options.baseURL,
        apiBaseURL: this.options.apiBaseURL,
        browser: this.options.browser,
        runMode: this.options.runMode,
      },
      stepResults,
      runId: `password-reset-public-journeys-${this.startedAt}`,
    });
  }

  async publish() {
    if (this.published) {
      return true;
    }
    this.published = true;
    const payload = this.buildPayload();
    return publishPasswordResetSyntheticReliabilityRun(payload, {
      baseUrl: this.options.baseURL,
      ingestToken: this.options.ingestToken,
      logger: this.options.logger,
    });
  }
}
