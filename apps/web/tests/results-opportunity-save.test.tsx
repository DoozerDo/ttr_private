import { render, waitFor } from "@testing-library/react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach } from "vitest";
import ResultsPage from "@/app/(app)/results/page";
import { getGenerationCompletionStorageKey } from "@/lib/nextAction";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results opportunity persistence", () => {
  beforeEach(() => {
    let cache: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => (key in cache ? cache[key] : null),
        setItem: (key: string, value: string) => {
          cache[key] = value;
        },
        removeItem: (key: string) => {
          delete cache[key];
        },
        clear: () => {
          cache = {};
        },
      },
    });
  });

  it("does not surface opportunity-save CTAs while Studio is blocked for evidence", async () => {
    overrideSearchParams({ assessmentId: "analysis-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return jsonResponse({
          assessmentId: "analysis-1",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 74,
          companyName: "Acme",
          jobTitle: "Support Director",
          strengths: ["Incident management"],
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 3,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Leadership", "Operations"],
            unverifiedRequirements: [],
          },
        });
      }
      if (url.includes("/api/analysis/history")) {
        return jsonResponse({
          recentAnalyses: [],
          alignmentPattern: {
            strongestAlignmentRoles: [],
            totalAnalyses: 0,
            averageScore: 0,
          },
          badges: [],
          generatedAt: new Date().toISOString(),
        });
      }
      if (url.includes("/api/opportunities") && init?.method === "POST") {
        return jsonResponse({ id: "opp-1" });
      }
      if (url.endsWith("/api/opportunities") && !init?.method) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/resume/readiness") && init?.method === "POST") {
        return jsonResponse({ status: "limited", reasons: [] });
      }
      if (url.endsWith("/api/cover-letters/readiness") && init?.method === "POST") {
        return jsonResponse({ status: "limited", reasons: [] });
      }
      return jsonResponse({});
    });

    const generationKey = getGenerationCompletionStorageKey("job-1", "base-1");
    window.localStorage.setItem(generationKey, "true");
    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    expect(await screen.findByTestId("results-score-verdict-card")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save this opportunity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply to this role" })).toBeNull();

    const postCall = fetchMock.mock.calls.find(
      ([url, requestInit]) =>
        String(url).includes("/api/opportunities") &&
        requestInit?.method === "POST",
    );
    expect(postCall).toBeUndefined();
  });

  it("does not auto-upgrade opportunities without an explicit user action", async () => {
    overrideSearchParams({ assessmentId: "analysis-2" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return jsonResponse({
          assessmentId: "analysis-2",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-2",
          score: 74,
          companyName: "Acme",
          jobTitle: "Support Director",
          strengths: ["SLA operations"],
        });
      }
      if (url.includes("/api/analysis/history")) {
        return jsonResponse({
          recentAnalyses: [],
          alignmentPattern: { strongestAlignmentRoles: [], totalAnalyses: 0, averageScore: 0 },
          badges: [],
          generatedAt: new Date().toISOString(),
        });
      }
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([
          { assessmentId: "analysis-2", score: 74, strengths: ["SLA operations"] },
          { assessmentId: "analysis-1", score: 62, strengths: ["Stakeholder updates"] },
        ]);
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-2", versionNumber: 2 }]);
      }
      if (url.includes("/api/opportunities") && init?.method === "POST") {
        return jsonResponse({ id: "opp-new" });
      }
      if (url.endsWith("/api/opportunities") && !init?.method) {
        return jsonResponse([
          {
            id: "opp-1",
            jobId: "job-1",
            baselineId: "base-1",
            status: "improving_fit",
          },
        ]);
      }
      if (url.includes("/api/opportunities/opp-1") && init?.method === "PATCH") {
        return jsonResponse({ ok: true });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({
          status: "ready",
          blocked: false,
          reasonCodes: [],
          reasons: [],
          badgeLabel: "READY",
          summary: "Ready.",
          verificationIssues: [],
        });
      }
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await screen.findByTestId("results-score-verdict-card");
    const patchCall = fetchMock.mock.calls.find(
      ([url, requestInit]) =>
        String(url).includes("/api/opportunities/opp-1") &&
        requestInit?.method === "PATCH",
    );
    expect(patchCall).toBeUndefined();
  });
});
