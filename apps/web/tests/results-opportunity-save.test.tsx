import { render, waitFor } from "@testing-library/react";
import ResultsPage from "@/app/(app)/results/page";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results opportunity persistence", () => {
  it("creates an opportunity after loading analysis and assigns ready_to_apply logic by score", async () => {
    overrideSearchParams({ assessmentId: "analysis-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return jsonResponse({
          assessmentId: "analysis-1",
          jobId: "job-1",
          baselineId: "base-1",
          score: 82,
          companyName: "Acme",
          jobTitle: "Support Director",
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
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, requestInit]) =>
          String(url).includes("/api/opportunities") &&
          requestInit?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall?.[1]?.body as string) ?? "{}") as Record<string, unknown>;
      expect(body.score).toBe(82);
    });
  });

  it("upgrades opportunity to ready_to_apply after improved re-analysis crosses 70", async () => {
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
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, requestInit]) =>
          String(url).includes("/api/opportunities/opp-1") &&
          requestInit?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
    });
  });
});
