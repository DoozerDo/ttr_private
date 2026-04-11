import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import InterviewSessionPage from "@/app/(app)/interviews/[id]/page";
import { FALLBACK_RENDERED_TEXT } from "@/lib/renderedText";
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

  it("replaces malformed interview output with a fallback instead of rendering tokens", async () => {
    mockUseParams.mockReturnValue({ id: "session-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/interviews/session-1/recommended-additions")) {
        return jsonResponse([
          {
            id: "addition-1",
            text: "{{broken addition}}",
            sources: [{ gapId: "gap-1", questionPrompt: "${missing}" }],
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
              jdExcerpt: "{{broken gap}}",
              baselineExcerpt: "2 + 2 = 4",
              confidence: "medium",
            },
          ],
          questions: [
            {
              gapId: "gap-1",
              category: "Context",
              prompt: "${broken prompt}",
              jdReference: "Category: Context",
            },
          ],
          responses: ["\u0000partial response"],
          expandedFitAssessment: {
            originalScore: 72,
            expandedScore: 81,
            delta: 9,
            originalVerdict: "{{original verdict}}",
            expandedVerdict: "${expanded verdict}",
          },
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
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes(FALLBACK_RENDERED_TEXT) ?? false)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/\{\{broken addition\}\}|\$\{broken prompt\}|\{\{original verdict\}\}/i)).toBeNull();
  });

  it("preserves answers and exit links when expanded fit compute fails", async () => {
    mockUseParams.mockReturnValue({ id: "session-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/interviews/session-1/recommended-additions")) {
        return jsonResponse([
          {
            id: "addition-1",
            text: "Add context to this example",
            sources: [{ gapId: "gap-1" }],
            status: "proposed",
          },
        ]);
      }
      if (url.includes("/api/interviews/session-1/accepted-additions")) {
        return jsonResponse([
          {
            id: "accepted-1",
            interviewId: "session-1",
            gapId: "gap-1",
            category: null,
            domain: null,
            suggestion: "Led a migration for three teams.",
            status: "ACCEPTED",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]);
      }
      if (url.includes("/api/interviews/session-1") && init?.method === "PATCH") {
        return jsonResponse({
          id: "session-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-1",
          jobId: "job-1",
          status: "open",
          responses: ["Led a migration for three teams."],
          gapList: [
            {
              gapId: "gap-1",
              domain: "experience",
              jdExcerpt: "Team leadership scope",
              baselineExcerpt: "Lead a migration",
              confidence: "medium",
            },
          ],
          questions: [
            {
              gapId: "gap-1",
              category: "Context",
              prompt: "What did you own?",
              jdReference: "Team leadership scope",
            },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }
      if (url.includes("/api/interviews/session-1/compute-expanded-fit") && init?.method === "POST") {
        return jsonResponse({
          status: "error",
          code: "computation_timeout",
          message: "This is taking longer than expected. Please try again.",
          retryable: true,
          nextAction: "retry_compute",
        });
      }
      if (url.includes("/api/interviews/session-1") && (!init?.method || init.method === "GET")) {
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
              jdExcerpt: "Team leadership scope",
              baselineExcerpt: "Lead a migration",
              confidence: "medium",
            },
          ],
          questions: [
            {
              gapId: "gap-1",
              category: "Context",
              prompt: "What did you own?",
              jdReference: "Team leadership scope",
            },
          ],
          responses: [],
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

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Led a migration for three teams." } });
    fireEvent.click(screen.getByRole("button", { name: /Save responses/i }));

    await waitFor(() => {
      expect(screen.getByText(/Responses saved/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Compute expanded fit now/i }));

    await waitFor(() => {
      expect(screen.getByText(/This is taking longer than expected/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox")).toHaveValue("Led a migration for three teams.");
    expect(screen.getByRole("link", { name: /Back to Results/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Baseline/i })).toBeInTheDocument();
  });

  it("deduplicates repeated expanded fit compute clicks for the same session", async () => {
    mockUseParams.mockReturnValue({ id: "session-1" });

    let resolveCompute!: (value: Response) => void;
    const computePromise = new Promise<Response>((resolve) => {
      resolveCompute = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/interviews/session-1/recommended-additions")) {
        return jsonResponse([
          {
            id: "addition-1",
            text: "Add context to this example",
            sources: [{ gapId: "gap-1" }],
            status: "proposed",
          },
        ]);
      }
      if (url.includes("/api/interviews/session-1/accepted-additions")) {
        return jsonResponse([
          {
            id: "accepted-1",
            interviewId: "session-1",
            gapId: "gap-1",
            category: null,
            domain: null,
            suggestion: "Led a migration for three teams.",
            status: "ACCEPTED",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]);
      }
      if (url.includes("/api/interviews/session-1") && (!init?.method || init.method === "GET")) {
        return jsonResponse({
          id: "session-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-1",
          jobId: "job-1",
          status: "open",
          responses: ["Led a migration for three teams."],
          acceptedAdditionIds: ["accepted-1"],
          gapList: [
            {
              gapId: "gap-1",
              domain: "experience",
              jdExcerpt: "Team leadership scope",
              baselineExcerpt: "Lead a migration",
              confidence: "medium",
            },
          ],
          questions: [
            {
              gapId: "gap-1",
              category: "Context",
              prompt: "What did you own?",
              jdReference: "Team leadership scope",
            },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }
      if (url.includes("/api/interviews/session-1/compute-expanded-fit") && init?.method === "POST") {
        return computePromise;
      }
      return jsonResponse({}, 404);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<InterviewSessionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Compute expanded fit now/i })).toBeEnabled();
    });

    const button = screen.getByRole("button", { name: /Compute expanded fit now/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/compute-expanded-fit")).length,
    ).toBe(1);

    await act(async () => {
      resolveCompute(
        jsonResponse({
          status: "success",
          code: "expanded_fit_ready",
          message: "Expanded fit is ready.",
          retryable: false,
          nextAction: "review_results",
          payload: {
            id: "session-1",
            baselineId: "baseline-1",
            baselineVersionId: "baseline-version-1",
            jobId: "job-1",
            status: "open",
            responses: ["Led a migration for three teams."],
            acceptedAdditionIds: ["accepted-1"],
            gapList: [],
            questions: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            expandedFitAssessment: {
              originalScore: 74,
              expandedScore: 82,
              delta: 8,
            },
          },
          runId: "run-1",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Expanded score: 82/i)).toBeInTheDocument();
    });
  });
});
