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
        return Promise.resolve(
          createResponse({
            status: "blocked",
            blocked: true,
            reasonCodes: ["unsupported_target_requirements"],
            reasons: [{ code: "unsupported_target_requirements", message: "Unsupported requirements present." }],
            compliance_flags: [],
          }),
        );
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

  it("CTA removal persists targeting before any generation dispatch", async () => {
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
        return Promise.resolve(
          createResponse({
            status: "blocked",
            blocked: true,
            reasonCodes: ["unsupported_target_requirements"],
            reasons: [{ code: "unsupported_target_requirements", message: "Unsupported requirements present." }],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/opportunities") && method === "POST") {
        callOrder.push("opportunities");
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const exclusions = body.excludedRequirements ?? body.excludedTargetingLabels ?? null;
        const nextExclusions = Array.isArray(exclusions)
          ? exclusions
          : typeof exclusions === "string"
            ? exclusions.split(",").map((value) => value.trim()).filter(Boolean)
            : null;
        if (nextExclusions) persistedExcludedRequirements = nextExclusions;
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
    }, { timeout: 5000 });
    expect(persistedExcludedRequirements).not.toBeNull();
    expect(persistedExcludedRequirements).toEqual(
      expect.arrayContaining(["Amazon Web Services (AWS)", "amazon web services (aws)"]),
    );

    // If generation dispatch happens from this CTA under the current contract, it must happen
    // only after targeting persistence completes.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });
    const opportunitiesIndex = callOrder.indexOf("opportunities");
    const resumeGenerateIndex = callOrder.indexOf("resume_generate");
    const coverGenerateIndex = callOrder.indexOf("cover_generate");
    if (resumeGenerateIndex !== -1) {
      expect(opportunitiesIndex).toBeLessThan(resumeGenerateIndex);
    }
    if (coverGenerateIndex !== -1) {
      expect(opportunitiesIndex).toBeLessThan(coverGenerateIndex);
    }

    // User-facing confirmation that targeting adjustments were saved and authority moved forward.
    await waitFor(() => {
      expect(screen.getByTestId("studio-targeting-adjustment-feedback")).toBeInTheDocument();
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });

    // Studio continues artifact polling, but should not treat missing artifacts as completed.
    expect(artifactsFetchCount).toBeGreaterThan(0);
  }, 20000);
});
