import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BaselineStudioHome } from "@/app/(app)/baseline/BaselineStudioHome";
import { mockRouterPush, setFetchImplementation } from "@/tests/setup";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

  function buildAnalyzedBaselineSummary(latestAssessmentId: string | null) {
    return {
      latestAssessmentId,
      latestAssessmentCreatedAt: latestAssessmentId ? "2026-03-25T00:01:00.000Z" : null,
      latestFitScore: latestAssessmentId ? 82 : null,
      hasCompletedAssessment: Boolean(latestAssessmentId),
    };
  }

  function withTargetCapability<T extends { capability?: unknown }>(baseline: T): T {
    return {
      ...baseline,
      capability: { ...(baseline.capability as any), targetReady: true },
    };
  }

  describe("Baseline analyze entrypoint", () => {
  it("keeps the canonical baseline CTA in baseline UX and does not redirect to /analyze", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
        });
      }
       if (url.includes("/api/baselines?includeArchived=true")) {
         return createJsonResponse([
           withTargetCapability({
             id: "base-1",
             originalFilename: "resume.pdf",
             createdAt: "2026-01-01T00:00:00.000Z",
             status: "ACTIVE",
             latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
           }),
         ]);
       }
       if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(
          withTargetCapability({
          id: "base-1",
          originalFilename: "resume.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ACTIVE",
          sections: [{ id: "s1", title: "Summary", content: "Analyzed", order: 1 }],
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }),
        );
       }
      return createJsonResponse({});
    });

    setFetchImplementation(fetchMock as any);

    render(
      <BaselineStudioHome
        baselines={[
          withTargetCapability({
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }) as never,
        ]}
      />,
    );

    expect(await screen.findByRole("button", { name: /target a role/i })).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/analyze"));
  });

  it("uses baseline readiness analysis from the hero CTA without falling back to /analyze", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
        });
      }
       if (url.includes("/api/baselines?includeArchived=true")) {
         return createJsonResponse([
           withTargetCapability({
             id: "base-1",
             originalFilename: "resume.pdf",
             createdAt: "2026-01-01T00:00:00.000Z",
             status: "ACTIVE",
             latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
           }),
         ]);
       }
       if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(
          withTargetCapability({
          id: "base-1",
          originalFilename: "resume.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ACTIVE",
          sections: [{ id: "s1", title: "Summary", content: "Analyzed", order: 1 }],
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }),
        );
       }
      return createJsonResponse({});
    });

    setFetchImplementation(fetchMock as any);

    render(
      <BaselineStudioHome
        baselines={[
          withTargetCapability({
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }) as never,
        ]}
      />,
    );

    expect(await screen.findByRole("button", { name: /target a role/i })).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/analyze"));
  });

  it("card canonical CTA resolves baseline readiness without requiring a job", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
        });
      }
       if (url.includes("/api/baselines?includeArchived=true")) {
         return createJsonResponse([
           withTargetCapability({
             id: "base-1",
             originalFilename: "resume.pdf",
             createdAt: "2026-01-01T00:00:00.000Z",
             status: "ACTIVE",
             latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
           }),
         ]);
       }
       if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(
          withTargetCapability({
          id: "base-1",
          originalFilename: "resume.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ACTIVE",
          sections: [{ id: "s1", title: "Summary", content: "Analyzed", order: 1 }],
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }),
        );
       }
      return createJsonResponse({});
    });

    setFetchImplementation(fetchMock as any);

    render(
      <BaselineStudioHome
        baselines={[
          withTargetCapability({
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }) as never,
        ]}
      />,
    );

    expect(await screen.findByRole("button", { name: /target a role/i })).toBeInTheDocument();
  });

  it("shows the Target CTA when analyze returns latestAssessmentId", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
        });
      }
       if (url.includes("/api/baselines?includeArchived=true")) {
         return createJsonResponse([
           withTargetCapability({
             id: "base-1",
             originalFilename: "resume.pdf",
             createdAt: "2026-01-01T00:00:00.000Z",
             status: "ACTIVE",
             latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
           }),
         ]);
       }
       if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(
          withTargetCapability({
          id: "base-1",
          originalFilename: "resume.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ACTIVE",
          sections: [{ id: "s1", title: "Summary", content: "Analyzed", order: 1 }],
          latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }),
        );
       }
      return createJsonResponse({});
    });

    setFetchImplementation(fetchMock as any);

    render(
      <BaselineStudioHome
        baselines={[
          withTargetCapability({
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: buildAnalyzedBaselineSummary("assessment-1"),
          }) as never,
        ]}
      />,
    );

    expect(await screen.findByRole("button", { name: /target a role/i })).toBeInTheDocument();
  });
});
