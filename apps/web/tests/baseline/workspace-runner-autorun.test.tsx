import { act, render, screen, waitFor } from "@testing-library/react";
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("WorkspaceRunner autorun lifecycle", () => {
  it("restarts analysis once when the active pair changes during scoring", async () => {
    const originalFetch = globalThis.fetch;
    const runCallCounts: Record<string, number> = {};
    const staleRun = createDeferred<Response>();
    const retryRun = createDeferred<Response>();

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.includes("/api/analysis/run")) {
        return Promise.resolve(createResponse({}));
      }

      const payload = init?.body ? JSON.parse(init.body as string) : {};
      const pairKey = `${payload.baselineId}:${payload.jobId}`;
      runCallCounts[pairKey] = (runCallCounts[pairKey] ?? 0) + 1;

      if (pairKey === "base-a:job-a") {
        return staleRun.promise;
      }

      if (pairKey === "base-b:job-b") {
        return retryRun.promise;
      }

      return Promise.resolve(
        createResponse({
          assessmentId: "assessment-default",
          baselineId: payload.baselineId,
          jobId: payload.jobId,
          score: 80,
        }),
      );
    });

    (globalThis.fetch as typeof window.fetch) = fetchMock as typeof window.fetch;

    try {
      const { rerender } = render(<WorkspaceRunner baselineId="base-a" jobId="job-a" />);

      await waitFor(() => expect(runCallCounts["base-a:job-a"]).toBe(1), { timeout: 5000 });

      await act(async () => {
        rerender(<WorkspaceRunner baselineId="base-b" jobId="job-b" />);
      });

      await act(async () => {
        staleRun.resolve(
          createResponse(
            {
              status: "stale_request_ignored",
              message: "The analysis inputs changed while this request was running.",
              retryable: true,
              nextAction: "retry_later",
            },
            false,
            409,
          ),
        );
      });

      await waitFor(() => expect(screen.getByText("Updating your score")).toBeInTheDocument(), {
        timeout: 5000,
      });
      await waitFor(() => expect(runCallCounts["base-b:job-b"]).toBe(1), { timeout: 5000 });

      await act(async () => {
        retryRun.resolve(
          createResponse({
            assessmentId: "assessment-2",
            baselineId: "base-b",
            jobId: "job-b",
            score: 75,
          }),
        );
      });

      await waitFor(() => expect(screen.getByText("Competitive Match")).toBeInTheDocument(), {
        timeout: 5000,
      });
      expect(runCallCounts["base-a:job-a"]).toBe(1);
      expect(runCallCounts["base-b:job-b"]).toBe(1);
      expect(screen.queryByText("Scoring failed")).not.toBeInTheDocument();
    } finally {
      (globalThis.fetch as typeof window.fetch) = originalFetch;
    }
  }, 20000);

  it("shows a soft interruption state without auto-retrying when the current selection is incomplete", async () => {
    const originalFetch = globalThis.fetch;
    const runCallCounts: Record<string, number> = {};
    const staleRun = createDeferred<Response>();

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.includes("/api/analysis/run")) {
        return Promise.resolve(createResponse({}));
      }

      const payload = init?.body ? JSON.parse(init.body as string) : {};
      const pairKey = `${payload.baselineId}:${payload.jobId}`;
      runCallCounts[pairKey] = (runCallCounts[pairKey] ?? 0) + 1;

      if (pairKey === "base-a:job-a") {
        return staleRun.promise;
      }

      return Promise.resolve(
        createResponse({
          assessmentId: "assessment-default",
          baselineId: payload.baselineId,
          jobId: payload.jobId,
          score: 80,
        }),
      );
    });

    (globalThis.fetch as typeof window.fetch) = fetchMock as typeof window.fetch;

    try {
      const { rerender } = render(<WorkspaceRunner baselineId="base-a" jobId="job-a" />);

      await waitFor(() => expect(runCallCounts["base-a:job-a"]).toBe(1), { timeout: 5000 });

      await act(async () => {
        rerender(<WorkspaceRunner baselineId="base-b" jobId={null} />);
      });

      await act(async () => {
        staleRun.resolve(
          createResponse(
            {
              status: "stale_request_ignored",
              message: "The analysis inputs changed while this request was running.",
              retryable: true,
              nextAction: "retry_later",
            },
            false,
            409,
          ),
        );
      });

      await waitFor(() => expect(screen.getByText("Analysis restarted due to changes")).toBeInTheDocument(), {
        timeout: 5000,
      });
      expect(
        screen.getByText(
          "You updated your baseline or job while scoring was in progress. We stopped the earlier run to keep your result accurate.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Analyze current selection" })).toBeDisabled();
      expect(runCallCounts["base-a:job-a"]).toBe(1);
      expect(runCallCounts["base-b:job-b"] ?? 0).toBe(0);
    } finally {
      (globalThis.fetch as typeof window.fetch) = originalFetch;
    }
  }, 20000);

  it("keeps true scoring failures as a hard error state", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/analysis/run")) {
        return Promise.resolve(createResponse({ message: "general failure" }, false, 500));
      }
      return Promise.resolve(createResponse({}));
    });

    (globalThis.fetch as typeof window.fetch) = fetchMock as typeof window.fetch;

    try {
      render(<WorkspaceRunner baselineId="base-a" jobId="job-a" />);

      await waitFor(() => expect(screen.getByText("Scoring failed")).toBeInTheDocument(), {
        timeout: 15000,
      });
      expect(screen.getByRole("button", { name: "Retry scoring" })).toBeInTheDocument();
    } finally {
      (globalThis.fetch as typeof window.fetch) = originalFetch;
    }
  }, 20000);
});
