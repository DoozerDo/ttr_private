import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  buildPasswordResetSyntheticReliabilityPayload,
  publishPasswordResetSyntheticReliabilityRun,
  PasswordResetSyntheticRunReporter,
} from "./password-reset-synthetic-reliability-publisher";
import { passwordResetPublicJourneysSuiteKey } from "./synthetic-config";

describe("password reset synthetic reliability publisher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a payload aligned to the canonical password reset suite key", () => {
    const payload = buildPasswordResetSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "pass",
      stepResults: [
        {
          key: "reset.request",
          title: "Reset request is accepted",
          status: "passed",
          durationMs: 100,
          errorMessage: null,
        },
        {
          key: "reset.link",
          title: "Reset link is retrievable from the synthetic token store",
          status: "passed",
          durationMs: 80,
          errorMessage: null,
        },
      ],
    });

    expect(payload.suiteKey).toBe(passwordResetPublicJourneysSuiteKey);
    expect(payload.status).toBe("pass");
    expect(payload.summary).toContain("2/2 journeys");
    expect(payload.validatedJourneys).toContain("Reset request is accepted");
  });

  it("reports failure details and keeps the original failure reason", () => {
    const payload = buildPasswordResetSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "fail",
      failureReason: "No reset token found",
      stepResults: [
        {
          key: "reset.request",
          title: "Reset request is accepted",
          status: "passed",
          durationMs: 100,
          errorMessage: null,
        },
        {
          key: "reset.link",
          title: "Reset link is retrievable from the synthetic token store",
          status: "failed",
          durationMs: 120,
          errorMessage: "No reset token found",
        },
      ],
    });

    expect(payload.status).toBe("fail");
    expect(payload.failureReason).toBe("No reset token found");
    expect(payload.summary).toContain("No reset token found");
  });

  it("publishes success and logs the result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const payload = buildPasswordResetSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "pass",
      stepResults: [],
    });

    const ok = await publishPasswordResetSyntheticReliabilityRun(payload, {
      baseUrl: "http://127.0.0.1:3100",
      ingestToken: "synthetic-ingest-local",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
    });

    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:3100/api/admin/synthetics",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-synthetic-ingest-token": "synthetic-ingest-local",
        }),
      }),
    );
    expect(logger.log).toHaveBeenCalled();
  });

  it("retries once before succeeding", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const payload = buildPasswordResetSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "pass",
      stepResults: [],
    });

    const ok = await publishPasswordResetSyntheticReliabilityRun(payload, {
      baseUrl: "http://127.0.0.1:3100",
      ingestToken: "synthetic-ingest-local",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
    });

    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("logs and returns false when publish fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }));
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const payload = buildPasswordResetSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "fail",
      failureReason: "No reset token found",
      stepResults: [],
    });

    const ok = await publishPasswordResetSyntheticReliabilityRun(payload, {
      baseUrl: "http://127.0.0.1:3100",
      ingestToken: "bad-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
    });

    expect(ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("fills skipped steps when the suite aborts early", () => {
    const reporter = new PasswordResetSyntheticRunReporter({
      baseURL: "http://127.0.0.1:3100",
      ingestToken: "synthetic-ingest-local",
      browser: "chromium",
      runMode: "local",
    });

    reporter.record({
      key: "reset.request",
      title: "Reset request is accepted",
      status: "passed",
      durationMs: 10,
    });

    const payload = reporter.buildPayload();
    expect(payload.stepResults.some((step) => step.status === "skipped")).toBe(true);
  });
});

