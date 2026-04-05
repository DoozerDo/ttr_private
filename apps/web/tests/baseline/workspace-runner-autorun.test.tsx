import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { WorkspaceRunner } from "@/app/(app)/baseline/_components/WorkspaceRunner";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody =
    typeof body === "string"
      ? body
      : body === undefined
        ? ""
        : JSON.stringify(body);

  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
  } as Response;
}

describe("WorkspaceRunner autorun lifecycle", () => {
  it(
    "runs once per pair, stops after a failed autorun, lets explicit retry run, and autoruns for a new pair",
    async () => {
    const originalFetch = globalThis.fetch;
    const runCallCounts: Record<string, number> = {};
    const recordedPairs: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/analysis/run")) {
        const payload = init?.body ? JSON.parse(init.body as string) : {};
        const pairKey = `${payload.baselineId}:${payload.jobId}`;
        runCallCounts[pairKey] = (runCallCounts[pairKey] ?? 0) + 1;
        recordedPairs.push(pairKey);
        if (pairKey === "base-b:job-b" && runCallCounts[pairKey] === 1) {
          return Promise.resolve(createResponse({ message: "general failure" }, false, 500));
        }
        if (pairKey === "base-b:job-b") {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-2",
              baselineId: "base-b",
              jobId: "job-b",
              score: 75,
            }),
          );
        }
        if (pairKey === "base-c:job-c") {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-3",
              baselineId: "base-c",
              jobId: "job-c",
              score: 92,
            }),
          );
        }
        return Promise.resolve(
          createResponse({
            assessmentId: "assessment-1",
            baselineId: "base-a",
            jobId: "job-a",
            score: 85,
          }),
        );
      }

      return Promise.resolve(createResponse({}));
    });
    (globalThis.fetch as typeof window.fetch) = fetchMock as typeof window.fetch;

    try {
      const { rerender } = render(<WorkspaceRunner baselineId="base-a" jobId="job-a" />);
      const waitOptions = { timeout: 10000 };

      await waitFor(() => expect(screen.getByText("Strong Match")).toBeInTheDocument(), waitOptions);
      expect(recordedPairs[0]).toBe("base-a:job-a");

      await act(async () => {
        rerender(<WorkspaceRunner baselineId="base-b" jobId="job-b" />);
      });

      await waitFor(() => expect(screen.getByText("Scoring failed")).toBeInTheDocument(), waitOptions);
      await act(async () => Promise.resolve());
      expect(recordedPairs.filter((pair) => pair === "base-b:job-b").length).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "Retry scoring" }));

      await waitFor(() => expect(screen.getByText("Competitive Match")).toBeInTheDocument(), waitOptions);
      expect(recordedPairs.filter((pair) => pair === "base-b:job-b").length).toBe(2);

      await act(async () => {
        rerender(<WorkspaceRunner baselineId="base-c" jobId="job-c" />);
      });

      await waitFor(() => expect(screen.getByText("Primary readiness")).toBeInTheDocument(), waitOptions);
      expect(recordedPairs.filter((pair) => pair === "base-c:job-c").length).toBe(1);
      expect(recordedPairs.at(-1)).toBe("base-c:job-c");
    } finally {
      (globalThis.fetch as typeof window.fetch) = originalFetch;
    }
  },
  20000);
});
