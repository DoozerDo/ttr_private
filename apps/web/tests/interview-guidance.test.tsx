import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import InterviewSessionPage from "@/app/(app)/interviews/[id]/page";
import { mockUseParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("interview guidance sanitization", () => {
  it("renders user-safe guidance without raw metadata chips", async () => {
    mockUseParams.mockReturnValue({ id: "session-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/interviews/session-1/recommended-additions")) {
        return jsonResponse([
          {
            id: "addition-1",
            text: "Add context to this example",
            sources: [{ gapId: "gap-1", questionPrompt: "WHAT CONTEXT SURROUNDED ANY WORK YOU HAVE DONE RELATED TO THIS, IF APPLICABLE?" }],
            status: "proposed",
          },
        ]);
      }
      if (url.includes("/api/interviews/session-1/accepted-additions")) {
        return jsonResponse([]);
      }
      if (url.includes("/api/interviews/session-1")) {
        return jsonResponse({
          id: "session-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-1",
          jobId: "job-1",
          status: "open",
          gapList: [
            {
              gapId: "gap-1",
              domain: "experience",
              jdExcerpt: "Category: Context",
              baselineExcerpt: "Gap 2668f0de-3886-447f-a592-d5c556ba5391",
              confidence: "medium",
            },
          ],
          questions: [
            {
              gapId: "gap-1",
              category: "Context",
              prompt:
                "WHAT CONTEXT SURROUNDED ANY WORK YOU HAVE DONE RELATED TO THIS, IF APPLICABLE?",
              jdReference: "Category: Context",
            },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }
      return jsonResponse({}, 404);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<InterviewSessionPage />);

    await waitFor(() => {
      expect(screen.getByText("Interview questions and evidence")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Add context to this example").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Category:/i)).toBeNull();
    expect(screen.queryByText(/Domain:/i)).toBeNull();
    expect(screen.queryByText(/Confidence:/i)).toBeNull();
    expect(screen.queryByText(/Gap 2668f0de-3886-447f-a592-d5c556ba5391/i)).toBeNull();
    expect(screen.queryByText(/Built from gap/i)).toBeNull();
  });
});
