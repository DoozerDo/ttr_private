import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import ResultsPage from "@/app/(app)/results/page";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(score: number) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
      return jsonResponse({
        assessmentId: "analysis-current",
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        score,
        strengths: ["Incident management", "SLA ownership"],
      });
    }
    if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
      return jsonResponse([
        {
          assessmentId: "analysis-current",
          score,
          strengths: ["Incident management", "SLA ownership"],
        },
      ]);
    }
    if (url.includes("/api/baselines/base-1/versions")) {
      return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
    }
    if (url.includes("/api/analysis/history")) {
      return jsonResponse({
        recentAnalyses: [],
        alignmentPattern: { strongestAlignmentRoles: [], totalAnalyses: 0, averageScore: 0 },
        badges: [],
        generatedAt: new Date().toISOString(),
      });
    }
    if (url.includes("/api/resume/readiness")) {
      return jsonResponse({ status: "ready", reasons: [] });
    }
    if (url.includes("/api/cover-letters/readiness")) {
      return jsonResponse({ status: "ready", reasons: [] });
    }
    if (url.includes("/api/opportunities") && init?.method === "POST") {
      return jsonResponse({ id: "opp-1" });
    }
    return jsonResponse({});
  });
}

describe("results gating", () => {
  it("shows the blocked decision and one primary CTA when evidence is missing", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch(75);
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("You need verified evidence to proceed.")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("results-hero-primary-cta")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Apply to this role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save this opportunity" })).toBeNull();
  });

  it("hides Studio and Apply actions below the threshold and shows only Fit Review", async () => {
    overrideSearchParams({ assessmentId: "analysis-current", locked: "1" });
    const fetchMock = installFetch(69);
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("You need verified evidence to proceed.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "OPEN STUDIO" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply to this role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save this opportunity" })).toBeNull();
    expect(screen.getByRole("link", { name: "Start Fit Review" })).toBeInTheDocument();
  });
});
