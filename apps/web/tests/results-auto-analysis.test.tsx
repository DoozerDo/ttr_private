import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import {
  mockRouterReplace,
  overrideSearchParams,
  setFetchImplementation,
} from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results auto analysis loading", () => {
  it("fails cleanly when no baselineId is provided", async () => {
    overrideSearchParams({ jobId: "job-1" });
    setFetchImplementation(vi.fn(async () => jsonResponse({}, 200)) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("No compatibility analysis yet")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Load Compatibility Analysis" })).toBeDisabled();
  });

  it("creates analysis on missing latest and navigates with explicit assessmentId", async () => {
    overrideSearchParams({ jobId: "job-1", baselineId: "base-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return jsonResponse({ message: "not found" }, 404);
      }
      if (url.includes("/api/analysis/run")) {
        return jsonResponse({ assessmentId: "assessment-new-1" }, 200);
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/analysis/run",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ jobId: "job-1", baselineId: "base-1" }),
        }),
      );
    });

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/results?assessmentId=assessment-new-1",
      );
    });
  });

  it("fails cleanly when hydrated analysis is missing a baselineId", async () => {
    overrideSearchParams({ assessmentId: "assessment-bad" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-bad")) {
        return jsonResponse({ assessmentId: "assessment-bad", jobId: "job-1" }, 200);
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("This result is no longer linked to an active resume.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry Compatibility Analysis" })).toBeInTheDocument();
  });

  it("uses existing latest assessment without creating duplicate analysis", async () => {
    overrideSearchParams({ jobId: "job-2", baselineId: "base-2" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/job/job-2/baseline/base-2/latest")) {
        return jsonResponse({ assessmentId: "assessment-existing-1" }, 200);
      }
      if (url.includes("/api/analysis/run")) {
        return jsonResponse({ assessmentId: "should-not-run" }, 200);
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("This result is no longer linked to an active resume.")).toBeInTheDocument();
    });

    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/analysis/run")),
    ).toBe(false);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
