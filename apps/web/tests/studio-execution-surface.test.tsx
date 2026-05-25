import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { listBaselines } from "@/lib/baselines";
import * as generationAuthority from "@/lib/generationAuthority";
import { listJobs } from "@/lib/jobsClient";
import * as studioTrustGate from "@/lib/studioTrustGate";
import * as generationProductReadiness from "@/lib/generationProductReadiness";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "./setup";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [
    { id: "job-1", company: "Acme", title: "Director of Support", archivedAt: null, isArchived: false },
  ]),
}));

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => [{ id: "base-1", originalFilename: "Leadership Resume", version: 1 }]),
  };
});

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => payload,
    blob: async () => new Blob([payload], { type: "application/json" }),
  };
}

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

describe("Studio execution surface", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(generationProductReadiness, "buildGenerationProductReadiness").mockReturnValue({
      generation_readiness: { canGenerate: true, canExport: false, reasonsBlocked: [] },
      state: "ALLOWED",
      confidence: "LOW",
      needsVerification: false,
      tier: "generation_allowed",
      canOpenStudio: true,
      generationMode: "verified",
    });
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("renders READY hero and unified materials flow", async () => {
    vi.spyOn(generationAuthority, "getGenerationAuthorityState").mockReturnValue("READY");
    vi.spyOn(studioTrustGate, "evaluateStudioTrustGate").mockReturnValue({
      allowed: true,
      reason: null,
      baselineStatusLabel: "verified",
      roleAlignmentLabel: "strong match",
    });

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          score: 88,
          scoring_v2: { score: 88 },
          scoringV2: { score: 88 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          supportingSignals: ["Owned support operations cadence"],
          baselineEvidence: "Reduced escalations by 22% through workflow redesign.",
        });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [] });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });
    expect(screen.getByText(/Your application materials/i)).toBeInTheDocument();
    expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^resume$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cover letter$/i })).toBeInTheDocument();
  });

  it("renders BLOCKED hero with remediation-first action", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          score: 91,
          scoring_v2: { score: 91 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
        });
      }
      if (url.includes("/api/resume/readiness")) {
        return createResponse({ status: "blocked", reasons: [{ code: "full_block", message: "blocked" }] });
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [] });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });

    // Blocked readiness should not surface export-ready materials; user should see the constrained generation shell.
    expect(screen.getByTestId("studio-resume-missing")).toBeInTheDocument();
    expect(screen.getByTestId("studio-cover-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-evidence-allowed-panel")).toBeNull();
  });

  it("suppresses generation surfaces when fit is below threshold and routes to Resolve Gaps", async () => {
    vi.spyOn(generationProductReadiness, "buildGenerationProductReadiness").mockReturnValue({
      generation_readiness: { canGenerate: false, canExport: false, reasonsBlocked: ["compatibility_score_below_80"] },
      state: "BLOCKED",
      confidence: "LOW",
      needsVerification: false,
      tier: "generation_blocked",
      canOpenStudio: true,
      generationMode: "verified",
    });

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          score: 79,
          scoring_v2: { score: 79 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          readinessStatus: "limited",
        });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        // Low fit score should not be paired with a fully-ready generation readiness in the canonical decision model.
        return createResponse({
          status: "limited",
          blocked: false,
          reasonCodes: ["compatibility_score_below_80"],
          reasons: [],
          compliance_flags: [],
        });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^resume$/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Review fit gaps/i).length).toBeGreaterThan(0);
  });

  it("demotes advanced controls with optional labels", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          score: 82,
          scoring_v2: { score: 82 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
        });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [] });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Adjust positioning (optional)")).toBeInTheDocument();
    });
  });
});
