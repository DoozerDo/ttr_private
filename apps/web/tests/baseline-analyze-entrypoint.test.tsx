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
  it("keeps ANALYZE in baseline UX and does not redirect to /analyze", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
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
              latestAssessmentId: null,
              latestAssessmentCreatedAt: null,
              latestFitScore: null,
              hasCompletedAssessment: false,
            },
          } as never,
        ]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "ANALYZE" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/baselines/base-1"),
        expect.any(Object),
      );
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/analyze"));
  });
});
