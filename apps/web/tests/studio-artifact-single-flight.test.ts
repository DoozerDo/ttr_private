import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireStudioArtifactSingleFlight,
  buildStudioArtifactSingleFlightKey,
  isStudioArtifactSingleFlightInFlight,
  releaseStudioArtifactSingleFlight,
} from "@/lib/studioArtifactSingleFlight";

describe("studioArtifactSingleFlight", () => {
  beforeEach(() => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.clear();
    }
    vi.useRealTimers();
  });

  it("does not acquire when pair context is missing", () => {
    const result = acquireStudioArtifactSingleFlight({
      baselineId: null,
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
      requestId: "r1",
    });

    expect(result.acquired).toBe(false);
    expect(result.reason).toBe("missing_pair_context");
  });

  it("blocks only the same artifact type for the same exact pair", () => {
    const resumeFirst = acquireStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
      requestId: "r1",
      ttlMs: 60_000,
    });
    expect(resumeFirst.acquired).toBe(true);

    const resumeSecond = acquireStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
      requestId: "r2",
      ttlMs: 60_000,
    });
    expect(resumeSecond.acquired).toBe(false);
    expect(resumeSecond.reason).toBe("already_in_flight");

    const coverAllowed = acquireStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "cover_letter",
      requestId: "c1",
      ttlMs: 60_000,
    });
    expect(coverAllowed.acquired).toBe(true);
  });

  it("releases and allows a later retry", () => {
    const first = acquireStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
      requestId: "r1",
      ttlMs: 60_000,
    });
    expect(first.acquired).toBe(true);

    releaseStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
    });

    const second = acquireStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
      requestId: "r2",
      ttlMs: 60_000,
    });
    expect(second.acquired).toBe(true);
  });

  it("ignores stale sessionStorage locks older than TTL and replaces them", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const storageKey = buildStudioArtifactSingleFlightKey({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
    });
    expect(storageKey).not.toBeNull();

    // Create an expired lock record.
    const ttlMs = 60_000;
    sessionStorage.setItem(
      storageKey!,
      JSON.stringify({
        requestId: "old",
        acquiredAt: Date.now() - (ttlMs + 1),
      }),
    );

    expect(
      isStudioArtifactSingleFlightInFlight({
        baselineId: "base-1",
        jobId: "job-1",
        analysisId: "analysis-1",
        artifactType: "resume",
        ttlMs,
      }),
    ).toBe(false);

    const result = acquireStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
      requestId: "fresh",
      ttlMs,
    });
    expect(result.acquired).toBe(true);
  });

  it("treats a fresh sessionStorage lock as in-flight and blocks a duplicate acquire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const storageKey = buildStudioArtifactSingleFlightKey({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
    });
    expect(storageKey).not.toBeNull();

    const ttlMs = 60_000;
    sessionStorage.setItem(
      storageKey!,
      JSON.stringify({
        requestId: "active",
        acquiredAt: Date.now(),
      }),
    );

    expect(
      isStudioArtifactSingleFlightInFlight({
        baselineId: "base-1",
        jobId: "job-1",
        analysisId: "analysis-1",
        artifactType: "resume",
        ttlMs,
      }),
    ).toBe(true);

    const result = acquireStudioArtifactSingleFlight({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      artifactType: "resume",
      requestId: "blocked",
      ttlMs,
    });
    expect(result.acquired).toBe(false);
    expect(result.reason).toBe("already_in_flight");
  });
});

