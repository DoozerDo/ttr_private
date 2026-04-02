import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BaselineStudioHome } from "@/app/(app)/baseline/BaselineStudioHome";
import { mockRouterPush, setFetchImplementation } from "@/tests/setup";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Baseline analyze entrypoint", () => {
  it("keeps the canonical Baseline analysis CTA in baseline UX and does not redirect to /analyze", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: {
            latestAssessmentId: "assessment-1",
            latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          },
        });
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: {
              latestAssessmentId: "assessment-1",
              latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
              latestFitScore: 82,
              hasCompletedAssessment: true,
            },
          },
        ]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse({
          id: "base-1",
          originalFilename: "resume.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ACTIVE",
          sections: [{ id: "s1", title: "Summary", content: "Analyzed", order: 1 }],
          latestAssessmentSummary: {
            latestAssessmentId: "assessment-1",
            latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          },
        });
      }
      return createJsonResponse({});
    });

    setFetchImplementation(
      fetchMock as any,
    );

    render(
      <BaselineStudioHome
        baselines={[
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: {
              latestAssessmentId: "assessment-1",
              latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
              latestFitScore: 82,
              hasCompletedAssessment: true,
            },
          } as never,
        ]}
      />,
    );

    expect(await screen.findByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" }));
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/analyze"));
  });

  it("uses baseline readiness analysis from hero canonical CTA", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          },
        });
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: {
              latestAssessmentId: "assessment-1",
              latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
              latestFitScore: 82,
              hasCompletedAssessment: true,
            },
          },
        ]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse({
          id: "base-1",
          originalFilename: "resume.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ACTIVE",
          sections: [{ id: "s1", title: "Summary", content: "Analyzed", order: 1 }],
          latestAssessmentSummary: {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: null,
            latestFitScore: null,
            hasCompletedAssessment: false,
          },
        });
      }
      return createJsonResponse({});
    });

    setFetchImplementation(fetchMock as any);

    render(
      <BaselineStudioHome
        baselines={[
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: {
              latestAssessmentId: "assessment-1",
              latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
              latestFitScore: 82,
              hasCompletedAssessment: true,
            },
          } as never,
        ]}
      />,
    );

    expect(await screen.findByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" }));
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/analyze"));
  });

  it("card canonical CTA runs baseline readiness analysis without requiring a job", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          },
        });
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: {
              latestAssessmentId: "assessment-1",
              latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
              latestFitScore: 82,
              hasCompletedAssessment: true,
            },
          },
        ]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse({
          id: "base-1",
          originalFilename: "resume.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ACTIVE",
          sections: [{ id: "s1", title: "Summary", content: "Analyzed", order: 1 }],
          latestAssessmentSummary: {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: null,
            latestFitScore: null,
            hasCompletedAssessment: false,
          },
        });
      }
      return createJsonResponse({});
    });

    setFetchImplementation(fetchMock as any);

    render(
      <BaselineStudioHome
        baselines={[
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: {
              latestAssessmentId: "assessment-1",
              latestAssessmentCreatedAt: "2026-03-25T00:01:00.000Z",
              latestFitScore: 82,
              hasCompletedAssessment: true,
            },
          } as never,
        ]}
      />,
    );

    expect(await screen.findByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" }));
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/analyze"));
  });
});
