import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockRouterPush, mockRouterReplace, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [
    {
      id: "job-1",
      company: "Acme",
      title: "Director of Support",
      archivedAt: null,
      isArchived: false,
    },
  ]),
}));

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => [
      {
        id: "base-1",
        originalFilename: "Leadership Resume",
        version: 1,
      },
    ]),
  };
});

function renderStudio() {
  return render(
    <EntitlementsProvider
      entitlements={{
        id: "u-1",
        email: "test@example.com",
        subscriptionTier: "PRO",
        role: "user",
        entitlements: null,
      }}
    >
      <StudioPage />
    </EntitlementsProvider>,
  );
}

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500, textOverride?: string) {
  const stringBody = textOverride ?? (typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body));
  return {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
}

describe("Studio post-unlock outcome shell", () => {
  it("shows unlocked_ready and generates on primary action", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-2",
      postUnlock: "1",
      priorScore: "78",
      priorReadiness: "blocked",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-2",
            scoring_v2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { resume: { heading: { name: "Alex Candidate", contactLine: "alex@example.com" }, experience: [] } },
          }),
        );
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Dear Hiring Team,"] } },
          }),
        );
      }

      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    expect(await screen.findByTestId("studio-post-unlock-shell")).toBeInTheDocument();
    expect(screen.getByText("You’re unlocked. Generate your documents.")).toBeInTheDocument();
    expect(screen.getByTestId("studio-post-unlock-delta")).toHaveTextContent("78");
    expect(screen.getByTestId("studio-post-unlock-delta")).toHaveTextContent("82");

    expect(screen.queryByTestId("studio-generation-readiness")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-post-unlock-primary"));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input?.url ?? "";
          return url.endsWith("/api/resume") && init?.method === "POST";
        }),
      ).toBe(true);
    });
  });

  it("shows improved_still_blocked and routes to evidence on primary CTA", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-3",
      postUnlock: "1",
      priorScore: "76",
      priorReadiness: "blocked",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-3")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-3",
            scoring_v2: { score: 79 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: ["Salesforce Service Cloud administration"] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    expect(await screen.findByText("You made progress, but one blocker remains.")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-generation-readiness")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-post-unlock-primary"));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalled();
    });
    const pushedHref = String(mockRouterPush.mock.calls.at(-1)?.[0] ?? "");
    expect(pushedHref).toContain("/fit-review");
  });

  it("shows no_material_change and retries reanalysis from secondary CTA", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-4",
      postUnlock: "1",
      priorScore: "77",
      priorReadiness: "blocked",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-4")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-4",
            scoring_v2: { score: 77 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: ["Missing verified evidence"] },
          }),
        );
      }
      if (url === "/api/analysis/run" && init?.method === "POST") {
        return Promise.resolve(createResponse({ assessmentId: "analysis-5", baselineVersionId: "base-version-2" }));
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    expect(await screen.findByText("That update didn’t change your readiness yet.")).toBeInTheDocument();
    expect(screen.getByTestId("studio-post-unlock-secondary")).toHaveTextContent("Try re-evaluating again");

    fireEvent.click(screen.getByTestId("studio-post-unlock-secondary"));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalled());
    const replacedHref = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(replacedHref).toContain("postUnlock=1");
    expect(replacedHref).toContain("priorScore=77");
  });

  it("shows reanalysis_failed when analysis hydration fails and supports retry", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-bad",
      postUnlock: "1",
      priorScore: "78",
      priorReadiness: "blocked",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-bad")) {
        return Promise.resolve(createResponse({ error: "nope" }, false, 500, "Unable to load"));
      }
      if (url === "/api/analysis/run" && init?.method === "POST") {
        return Promise.resolve(createResponse({ assessmentId: "analysis-6", baselineVersionId: "base-version-2" }));
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    expect(await screen.findByText("Re-evaluation failed.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-post-unlock-primary"));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalled());
    const replacedHref = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(replacedHref).toContain("postUnlock=1");
  });
});

