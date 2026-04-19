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

  it("accepts target_cta_clicked for draft-capable flows (state=DRAFT)", async () => {
    trackEvent(
      "target_cta_clicked",
      {
        state: "DRAFT",
        score: 78,
        label: "Open Studio",
        href: "/studio?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
        actionType: "open_studio_generate",
      },
      { userId: "user-1" },
    );

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
        state: "DRAFT",
        score: 78,
        label: "Open Studio",
        href: "/studio?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
        actionType: "open_studio_generate",
      }),
    );
  });

  it("accepts the target momentum entry events with the route aware payload shapes", async () => {
    trackEvent(
      "target_momentum_entry_viewed",
      {
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: null,
      },
      { userId: "user-1" },
    );
    trackEvent(
      "target_job_input_focused",
      {
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: null,
      },
      { userId: "user-1" },
    );
    trackEvent(
      "target_job_pasted",
      {
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: null,
        pastedLength: 42,
      },
      { userId: "user-1" },
    );
    trackEvent(
      "target_score_started_from_momentum",
      {
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: "job-1",
        inputLength: 42,
      },
      { userId: "user-1" },
    );
    trackEvent(
      "target_auto_score_started",
      {
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: "job-1",
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(5);
    });

    const bodies = vi.mocked(fetch).mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body ?? "{}")),
    );

    expect(bodies.map((body) => body.eventName)).toEqual(
      expect.arrayContaining([
        "target_momentum_entry_viewed",
        "target_job_input_focused",
        "target_job_pasted",
        "target_score_started_from_momentum",
        "target_auto_score_started",
      ]),
    );
    expect(bodies[0].properties).toEqual(
      expect.objectContaining({
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: null,
      }),
    );
  });

  it("accepts studio_auto_generation_started with the instant draft payload shape", async () => {
    trackEvent(
      "studio_auto_generation_started",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        generationTarget: "resume_and_cover_letter",
      },
      { userId: "user-1" },
    );

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

    expect(body.eventName).toBe("studio_auto_generation_started");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        generationTarget: "resume_and_cover_letter",
      }),
    );
  });

  it("accepts studio_retry_clicked with the retry payload shape", async () => {
    trackEvent(
      "studio_retry_clicked",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        artifactType: "resume",
        failureCategory: "generation_failed",
      },
      { userId: "user-1" },
    );

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

    expect(body.eventName).toBe("studio_retry_clicked");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        artifactType: "resume",
        failureCategory: "generation_failed",
      }),
    );
  });

  it("accepts studio_resume_downloaded with the download payload shape", async () => {
    trackEvent(
      "studio_resume_downloaded",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        format: "docx",
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("studio_resume_downloaded");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        format: "docx",
      }),
    );
  });

  it("accepts studio_cover_letter_downloaded with the download payload shape", async () => {
    trackEvent(
      "studio_cover_letter_downloaded",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        format: "docx",
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("studio_cover_letter_downloaded");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        format: "docx",
      }),
    );
  });

  it("accepts studio_resume_copied with the copy payload shape", async () => {
    trackEvent(
      "studio_resume_copied",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("studio_resume_copied");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
      }),
    );
  });

  it("accepts studio_cover_letter_copied with the copy payload shape", async () => {
    trackEvent(
      "studio_cover_letter_copied",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("studio_cover_letter_copied");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
      }),
    );
  });

  it("accepts studio_application_ready_viewed with the application payload shape", async () => {
    trackEvent(
      "studio_application_ready_viewed",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        currentStatus: "Ready",
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("accepts studio_application_completed_viewed with the application payload shape", async () => {
    trackEvent(
      "studio_application_completed_viewed",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        currentStatus: "Applied",
        totalApplicationsCount: 3,
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("accepts studio_apply_clicked with the application payload shape", async () => {
    trackEvent(
      "studio_apply_clicked",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        currentStatus: "Ready",
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("accepts studio_next_role_clicked with the application payload shape", async () => {
    trackEvent(
      "studio_next_role_clicked",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        currentStatus: "Applied",
        totalApplicationsCount: 3,
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("accepts application_progress_viewed with the application payload shape", async () => {
    trackEvent(
      "application_progress_viewed",
      {
        source: "studio",
        analysisId: "analysis-1",
        baselineId: "base-1",
        jobId: "job-1",
        score: 84,
        totalApplicationsCount: 3,
        completedApplicationsCount: 3,
        recentActivityCount: 3,
      },
      { userId: "user-1" },
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
