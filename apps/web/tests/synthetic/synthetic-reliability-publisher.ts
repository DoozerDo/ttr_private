import {
  landingPublicJourneysSuiteKey,
  syntheticBaseURL,
  syntheticIngestToken,
} from "./synthetic-config";

export type SyntheticJourneyStatus = "passed" | "failed" | "skipped" | "timedOut";

export type SyntheticJourneyRecord = {
  key: string;
  title: string;
  status: SyntheticJourneyStatus;
  durationMs: number;
  errorMessage?: string | null;
};

export type SyntheticReliabilityPublishPayload = {
  suiteKey: string;
  status: "pass" | "fail";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  failureReason: string | null;
  environment: {
    baseURL: string;
    apiBaseURL: string;
    browser: string;
    runMode: "local" | "ci";
  };
  validatedJourneys: string[];
  stepResults: Array<{
    key: string;
    title: string;
    status: SyntheticJourneyStatus;
    durationMs: number;
    errorMessage: string | null;
  }>;
  runId: string;
  source: "playwright";
};

type PublishLogger = Pick<Console, "log" | "error" | "warn">;

const VALIDATED_JOURNEY_LABELS = [
  "Landing page renders with hero, analysis block, trust strip, and radar teaser",
  "Resume upload accepts a valid PDF or DOCX",
  "Job description input enables analysis only when validation is satisfied",
  "Beta signup reaches the intended confirmation or gated state",
  "Login routes through the intended authenticated handoff",
  "Post-login continuity reaches the app destination from landing",
];

const JOURNEY_KEYS = [
  "landing.render",
  "resume.upload",
  "analysis.preview",
  "validation.states",
  "beta.signup",
  "login.continuity",
];

const MAX_PUBLISH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

function buildSummary(status: "pass" | "fail", passedCount: number, totalCount: number, failureReason: string | null): string {
  if (status === "pass") {
    return `Landing/auth synthetic passed (${passedCount}/${totalCount} journeys).`;
  }

  return failureReason
    ? `Landing/auth synthetic failed (${passedCount}/${totalCount} journeys). ${failureReason}`
    : `Landing/auth synthetic failed (${passedCount}/${totalCount} journeys).`;
}

export function buildLandingSyntheticReliabilityPayload(input: {
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
    suiteKey: landingPublicJourneysSuiteKey,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: Math.max(0, new Date(input.completedAt).getTime() - new Date(input.startedAt).getTime()),
    summary: buildSummary(input.status, passedCount, totalCount, failureReason),
    failureReason,
    environment: {
      baseURL: syntheticBaseURL,
      apiBaseURL: process.env.API_BASE_URL?.replace(/\/+$/, "") || "http://127.0.0.1:3001",
      browser: input.environment?.browser || "chromium",
      runMode: input.environment?.runMode || (process.env.CI ? "ci" : "local"),
    },
    validatedJourneys: [...VALIDATED_JOURNEY_LABELS],
    stepResults: input.stepResults,
    runId: input.runId || `landing-public-journeys-${input.startedAt}`,
    source: "playwright",
  };
}

export async function publishLandingSyntheticReliabilityRun(
  payload: SyntheticReliabilityPublishPayload,
  options?: {
    baseUrl?: string;
    ingestToken?: string;
    fetchImpl?: typeof fetch;
    logger?: PublishLogger;
  },
): Promise<boolean> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const logger = options?.logger ?? console;
  const baseUrl = (options?.baseUrl ?? syntheticBaseURL).replace(/\/+$/, "");
  const ingestToken = options?.ingestToken ?? syntheticIngestToken;
  const url = `${baseUrl}/api/admin/synthetics`;

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-synthetic-ingest-token": ingestToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        lastError = `status ${response.status}`;
        logger.error("Synthetic reliability publish failed", {
          url,
          attempt,
          status: response.status,
          body: text.slice(0, 2000),
        });
        if (attempt < MAX_PUBLISH_ATTEMPTS) {
          logger.warn("Synthetic reliability publish retrying", {
            url,
            attempt,
            nextAttempt: attempt + 1,
          });
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        return false;
      }

      logger.log("Synthetic reliability publish complete", {
        suiteKey: payload.suiteKey,
        status: payload.status,
        stepCount: payload.stepResults.length,
        durationMs: payload.durationMs,
      });
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.error("Synthetic reliability publish failed", {
        url,
        attempt,
        message: lastError,
      });
      if (attempt < MAX_PUBLISH_ATTEMPTS) {
        logger.warn("Synthetic reliability publish retrying", {
          url,
          attempt,
          nextAttempt: attempt + 1,
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      return false;
    }
  }

  if (lastError) {
    logger.error("Synthetic reliability publish failed permanently", {
      url,
      message: lastError,
    });
  }

  return false;
}

export class LandingSyntheticRunReporter {
  private readonly startedAt: string;
  private readonly records = new Map<string, SyntheticJourneyRecord>();
  private published = false;

  constructor(
    private readonly options: {
      baseURL?: string;
      apiBaseURL?: string;
      ingestToken?: string;
      browser?: string;
      runMode?: "local" | "ci";
      logger?: PublishLogger;
    } = {},
  ) {
    this.startedAt = new Date().toISOString();
  }

  record(record: Omit<SyntheticJourneyRecord, "durationMs"> & { durationMs?: number }) {
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

    return buildLandingSyntheticReliabilityPayload({
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
      runId: `landing-public-journeys-${this.startedAt}`,
    });
  }

  async publish() {
    if (this.published) {
      return true;
    }
    this.published = true;
    const payload = this.buildPayload();
    return publishLandingSyntheticReliabilityRun(payload, {
      baseUrl: this.options.baseURL,
      ingestToken: this.options.ingestToken,
      logger: this.options.logger,
    });
  }
}
