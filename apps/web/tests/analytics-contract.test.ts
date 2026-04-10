import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { trackEvent } from "@/src/lib/analytics";

describe("analytics contract", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: "user-1" }),
      })) as unknown as typeof fetch,
    );
  });

  it("accepts artifact_viewed_with_confidence_level with the Studio payload shape", async () => {
    trackEvent("artifact_viewed_with_confidence_level", {
      source: "studio",
      baselineId: "base-1",
      jobId: "job-1",
      artifactType: "resume",
      confidence: "MEDIUM",
      artifactScore: 78,
      missingEvidenceCount: 2,
    }, { userId: "user-1" });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("artifact_viewed_with_confidence_level");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        baselineId: "base-1",
        jobId: "job-1",
        artifactType: "resume",
        confidence: "MEDIUM",
        artifactScore: 78,
        missingEvidenceCount: 2,
      }),
    );
  });

  it("accepts baseline_readiness_viewed with the baseline payload shape", async () => {
    trackEvent("baseline_readiness_viewed", {
      source: "baseline",
      baselineId: "base-1",
      readinessState: "READY",
      latestAssessmentId: "assessment-1",
      latestFitScore: 78,
      dataSource: "persisted",
    }, { userId: "user-1" });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("baseline_readiness_viewed");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "baseline",
        baselineId: "base-1",
        readinessState: "READY",
        latestAssessmentId: "assessment-1",
        latestFitScore: 78,
        dataSource: "persisted",
      }),
    );
  });

  it("accepts target_cta_clicked with the canonical CTA payload shape", async () => {
    trackEvent("target_cta_clicked", {
      state: "READY",
      score: 82,
      label: "Open Studio",
      href: "/studio?analysisId=analysis-82&jobId=job-82&baselineId=base-82",
      actionType: "open_studio_generate",
    }, { userId: "user-1" });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("target_cta_clicked");
    expect(body.properties).toEqual(
      expect.objectContaining({
        state: "READY",
        score: 82,
        label: "Open Studio",
        href: "/studio?analysisId=analysis-82&jobId=job-82&baselineId=base-82",
        actionType: "open_studio_generate",
      }),
    );
  });
});
