import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";
import * as generationProductReadiness from "@/lib/generationProductReadiness";

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

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody = typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body);
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

function rawFetchUrl(input: RequestInfo): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input instanceof Request
        ? input.url
        : typeof input === "object" && input && "url" in input
          ? String((input as { url?: unknown }).url ?? "")
          : String(input ?? "");
}

function fitAssessment(score: number, unverifiedRequirements: string[] = []) {
  return {
    assessmentId: "analysis-1",
    scoring_v2: { score },
    scoringV2: { score },
    score,
    jobId: "job-1",
    baselineId: "base-1",
    baselineVersionId: "base-version-1",
    company: "Acme",
    title: "Director of Support",
    verification_coverage: { unverifiedRequirements },
  };
}

function resumeSuccess() {
  return {
    status: "success",
    generationStatus: "success",
    exportReady: true,
    exports: { docx: true, pdf: true },
    preview: {
      resume: {
        heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
        summary: "Support leader focused on scalable operations.",
        experience: [],
      },
    },
  };
}

function coverSuccess() {
  return {
    status: "success",
    generationStatus: "success",
    exportReady: true,
    exports: { docx: true, pdf: true },
    preview: { coverLetter: { paragraphs: ["Dear Hiring Team,"] } },
  };
}

describe("Studio generation lifecycle stabilization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    vi.spyOn(generationProductReadiness, "buildGenerationProductReadiness").mockReturnValue({
      generation_readiness: { canGenerate: true, canExport: false, reasonsBlocked: [] },
      state: "ALLOWED",
      confidence: "LOW",
      needsVerification: false,
      tier: "generation_allowed",
      canOpenStudio: true,
      generationMode: "verified",
    } as any);
  });

  it("ready_to_generate renders 'Ready to generate' (not 'Ready to review')", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = rawFetchUrl(input);
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(fitAssessment(84)));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", blocked: false, reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(createResponse({ resume: null, coverLetter: null }));
      }
      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    await screen.findByTestId("studio-resume-missing", {}, { timeout: 15000 });
    expect(screen.getByText("Ready to generate resume")).toBeInTheDocument();
    expect(screen.queryByText(/ready to review/i)).toBeNull();
  }, 15000);

  it("CTA removal persists targeting before dispatch; success + missing persisted artifact shows syncing; exhausted refresh yields retryable failure copy; retry clears stale flags", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
    });

    const callOrder: string[] = [];
    let artifactsFetchCount = 0;
    let persistedExcludedRequirements: string[] | null = null;

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = rawFetchUrl(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        // Deterministic normalization case: "aws" is normalized upstream into
        // "Amazon Web Services (AWS)" and Studio persists both the normalized and
        // lowercased ("raw"/matching) variants for exclusion.
        return Promise.resolve(createResponse(fitAssessment(84, ["aws"])));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", blocked: false, reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/opportunities") && method === "POST") {
        callOrder.push("opportunities");
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        persistedExcludedRequirements = Array.isArray(body.excludedRequirements)
          ? body.excludedRequirements
          : null;
        return Promise.resolve(createResponse({ status: "SAVED", updatedAt: new Date().toISOString() }));
      }
      if (url.endsWith("/api/resume") && method === "POST") {
        callOrder.push("resume_generate");
        return Promise.resolve(createResponse(resumeSuccess()));
      }
      if (url.endsWith("/api/cover-letters") && method === "POST") {
        callOrder.push("cover_generate");
        return Promise.resolve(createResponse(coverSuccess()));
      }
      if (url.includes("/api/studio/artifacts")) {
        callOrder.push("artifacts");
        artifactsFetchCount += 1;
        // Never becomes visible: force poll exhaustion.
        return Promise.resolve(createResponse({ resume: null, coverLetter: null }));
      }
      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    const cta = await screen.findByRole("button", { name: "Remove unsupported requirements and continue" }, {}, { timeout: 15000 });
    fireEvent.click(cta);

    await waitFor(() => {
      expect(callOrder).toContain("opportunities");
      expect(callOrder).toContain("resume_generate");
      expect(callOrder).toContain("cover_generate");
    }, { timeout: 5000 });
    expect(persistedExcludedRequirements).not.toBeNull();
    expect(persistedExcludedRequirements).toEqual(
      expect.arrayContaining(["Amazon Web Services (AWS)", "amazon web services (aws)"]),
    );
    expect(callOrder.indexOf("opportunities")).toBeLessThan(callOrder.indexOf("resume_generate"));
    expect(callOrder.indexOf("opportunities")).toBeLessThan(callOrder.indexOf("cover_generate"));

    // Syncing visible during refresh window.
    await waitFor(() => {
      expect(screen.getByTestId("studio-resume-missing")).toHaveTextContent("Syncing generated resume...");
      expect(screen.getByTestId("studio-cover-missing")).toHaveTextContent("Syncing generated cover letter...");
    });

    const exhaustedCopy =
      "Generation completed, but the saved document could not be loaded. Retry refresh or regenerate.";
    await waitFor(() => {
      expect(screen.getAllByText(exhaustedCopy).length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    // Retry should clear stale state and enter generating again.
    const retryButtons = screen.queryAllByRole("button", { name: /retry generation/i });
    if (retryButtons.length > 0) {
      fireEvent.click(retryButtons[0]);
    } else {
      fireEvent.click(screen.getByTestId("studio-generate-resume-button"));
    }
    await waitFor(() => {
      expect(screen.getByTestId("studio-resume-generating")).toBeInTheDocument();
    });

    expect(artifactsFetchCount).toBeGreaterThanOrEqual(4);
  }, 20000);
});
