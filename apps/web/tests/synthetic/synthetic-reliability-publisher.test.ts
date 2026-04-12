import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  buildLandingSyntheticReliabilityPayload,
  publishLandingSyntheticReliabilityRun,
  LandingSyntheticRunReporter,
} from "./synthetic-reliability-publisher";
import { landingPublicJourneysSuiteKey } from "./synthetic-config";

describe("synthetic reliability publisher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a payload aligned to the canonical landing suite key", () => {
    const payload = buildLandingSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "pass",
      stepResults: [
        {
          key: "landing.render",
          title: "Landing page renders with hero, analysis block, trust strip, and radar teaser",
          status: "passed",
          durationMs: 100,
          errorMessage: null,
        },
        {
          key: "resume.upload",
          title: "Resume upload accepts a valid PDF or DOCX",
          status: "passed",
          durationMs: 80,
          errorMessage: null,
        },
      ],
    });

    expect(payload.suiteKey).toBe(landingPublicJourneysSuiteKey);
    expect(payload.status).toBe("pass");
    expect(payload.summary).toContain("2/2 journeys");
    expect(payload.validatedJourneys).toContain(
      "Landing page renders with hero, analysis block, trust strip, and radar teaser",
    );
  });

  it("reports failure details and keeps the original failure reason", () => {
    const payload = buildLandingSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "fail",
      failureReason: "Auth redirect mismatch",
      stepResults: [
        {
          key: "landing.render",
          title: "Landing page renders with hero, analysis block, trust strip, and radar teaser",
          status: "passed",
          durationMs: 100,
          errorMessage: null,
        },
        {
          key: "login.continuity",
          title: "Login routes through the intended authenticated handoff",
          status: "failed",
          durationMs: 120,
          errorMessage: "Auth redirect mismatch",
        },
      ],
    });

    expect(payload.status).toBe("fail");
    expect(payload.failureReason).toBe("Auth redirect mismatch");
    expect(payload.summary).toContain("Auth redirect mismatch");
  });

  it("publishes success and logs the result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const payload = buildLandingSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "pass",
      stepResults: [],
    });

    const ok = await publishLandingSyntheticReliabilityRun(payload, {
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
    const payload = buildLandingSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "pass",
      stepResults: [],
    });

    const ok = await publishLandingSyntheticReliabilityRun(payload, {
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
    const payload = buildLandingSyntheticReliabilityPayload({
      startedAt: "2026-04-12T10:00:00.000Z",
      completedAt: "2026-04-12T10:01:30.000Z",
      status: "fail",
      failureReason: "Auth redirect mismatch",
      stepResults: [],
    });

    const ok = await publishLandingSyntheticReliabilityRun(payload, {
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
    const reporter = new LandingSyntheticRunReporter({
      baseURL: "http://127.0.0.1:3100",
      ingestToken: "synthetic-ingest-local",
      browser: "chromium",
      runMode: "local",
    });

    reporter.record({
      key: "landing.render",
      title: "Landing page renders with hero, analysis block, trust strip, and radar teaser",
      status: "passed",
      durationMs: 10,
    });

    const payload = reporter.buildPayload();
    expect(payload.stepResults.some((step) => step.status === "skipped")).toBe(true);
  });
});
