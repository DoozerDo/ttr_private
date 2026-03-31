import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import ResolveGapsPage from "@/app/(app)/resolve-gaps/page";
import { mockRouterPush, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolve gaps recovery flow", () => {
  it("uses consistent evidence-first language and preserves context back to results", async () => {
    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    };
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    overrideSearchParams({
      jobId: "job-1",
      baselineId: "baseline-1",
      analysisId: "analysis-blocked",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-blocked")) {
        return jsonResponse({
          assessmentId: "analysis-blocked",
          jobId: "job-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-1",
          verification_coverage: {
            unverifiedRequirements: ["Missing verified evidence"],
          },
        });
      }
      if (url === "/api/interview-records" && init?.method === "POST") {
        return jsonResponse({ id: "gap-session-1" });
      }
      return jsonResponse({}, 404);
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResolveGapsPage />);

    await waitFor(() => {
      expect(screen.getByText("Evidence Queue")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Evidence Review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unlock Progress" })).toBeInTheDocument();
    expect(screen.getByText("Add verified evidence to unblock generation and refresh the role score.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Evidence" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Updated Results" }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/results?jobId=job-1&baselineId=baseline-1&assessmentId=analysis-blocked&analysisId=analysis-blocked&baselineVersionId=baseline-version-1",
    );
  });
});
