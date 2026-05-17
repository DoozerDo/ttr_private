import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

vi.mock("@/lib/artifactConfidence", async () => {
  const actual = await vi.importActual<typeof import("@/lib/artifactConfidence")>("@/lib/artifactConfidence");
  return {
    ...actual,
    buildArtifactQualityModel: () => ({
      confidence: "LOW",
      artifactScore: 0.12,
      missingEvidenceCount: 6,
      improvableClaims: [
        { text: "Unverified leadership claim", artifactType: "resume" },
        { text: "Unverified impact claim", artifactType: "cover_letter" },
      ],
    }),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

describe("studio low-quality preview gating", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gates LOW quality drafts below the generate-now threshold behind excerpt + disclosure", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return jsonResponse({
          assessmentId: "analysis-1",
          scoring_v2: { score: 79 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          verification_coverage: { totalClaims: 2, verifiedClaims: 2, inferredClaims: 0, unverifiedClaims: 0 },
        });
      }
      if (url.includes("/api/resume/readiness")) return jsonResponse({ status: "ready", reasons: [], compliance_flags: [] });
      if (url.includes("/api/cover-letters/readiness")) return jsonResponse({ status: "ready", reasons: [], compliance_flags: [] });
      if (url.includes("/api/studio/artifacts")) {
        return jsonResponse({
          status: "COMPLETED",
          baselineId: "base-1",
          jobId: "job-1",
          baselineVersionId: "base-version-1",
          resume: { status: "COMPLETED", responseBody: { status: "success", preview: { resume: { heading: { name: "Alex Candidate" } } } } },
          coverLetter: { status: "COMPLETED", responseBody: { status: "success", preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Body"] } } } },
        });
      }
      if (url.includes("/api/jobs")) return jsonResponse([{ id: "job-1", company: "Acme", title: "Director of Support", archivedAt: null, isArchived: false }]);
      if (url.includes("/api/baselines")) return jsonResponse([{ id: "base-1", originalFilename: "Leadership Resume", version: 1 }]);
      if (url.includes("/api/applications")) return jsonResponse([]);
      if (url.includes("/api/opportunities")) return jsonResponse([]);
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-decision-panel")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Strong output: you can use this now with confidence/i)).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId("studio-low-quality-resume-preview-main")).toBeInTheDocument();
      expect(screen.getByTestId("studio-low-quality-cover-preview-main")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("studio-low-quality-resume-view-full-main"));
    await waitFor(() => {
      expect(screen.queryByTestId("studio-low-quality-resume-preview-main")).toBeNull();
    });
  });

  it("does not gate LOW-confidence artifacts at score >= 80 (generate now lane)", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return jsonResponse({
          assessmentId: "analysis-1",
          scoring_v2: { score: 84 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          verification_coverage: {
            totalClaims: 2,
            verifiedClaims: 2,
            inferredClaims: 0,
            unverifiedClaims: 0,
            unverifiedRequirements: ["Python", "Snowflake"],
          },
        });
      }
      if (url.includes("/api/resume/readiness")) return jsonResponse({ status: "blocked", reasons: [{ code: "full_block", message: "Unverified Python" }], compliance_flags: [] });
      if (url.includes("/api/cover-letters/readiness")) return jsonResponse({ status: "blocked", reasons: [{ code: "full_block", message: "Unverified Snowflake" }], compliance_flags: [] });
      if (url.includes("/api/studio/artifacts")) {
        return jsonResponse({
          status: "COMPLETED",
          baselineId: "base-1",
          jobId: "job-1",
          baselineVersionId: "base-version-1",
          resume: { status: "COMPLETED", responseBody: { status: "success", preview: { resume: { heading: { name: "Alex Candidate" } } } } },
          coverLetter: { status: "COMPLETED", responseBody: { status: "success", preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Body"] } } } },
        });
      }
      if (url.includes("/api/jobs")) return jsonResponse([{ id: "job-1", company: "Acme", title: "Director of Support", archivedAt: null, isArchived: false }]);
      if (url.includes("/api/baselines")) return jsonResponse([{ id: "base-1", originalFilename: "Leadership Resume", version: 1 }]);
      if (url.includes("/api/applications")) return jsonResponse([]);
      if (url.includes("/api/opportunities")) return jsonResponse([]);
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    renderStudio();

    await screen.findByTestId("studio-generation-readiness");
    await screen.findByTestId("studio-optional-evidence-details");

    expect(screen.queryByText(/needs another pass/i)).toBeNull();
    expect(screen.queryByText(/draft \(low quality\)/i)).toBeNull();
    expect(screen.queryByTestId("studio-decision-panel")).toBeNull();

    expect(screen.queryByTestId("studio-low-quality-resume-preview-main")).toBeNull();
    expect(screen.queryByTestId("studio-low-quality-cover-preview-main")).toBeNull();
    expect(screen.queryByText(/View full draft anyway/i)).toBeNull();

    // Verification CTAs should not be part of the primary visible flow at score >= 80.
    expect(screen.queryAllByRole("button", { name: /verify/i }).length).toBe(0);
    expect(screen.queryAllByRole("link", { name: /verify/i }).length).toBe(0);
    expect(screen.getByTestId("studio-optional-evidence-details")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-optional-evidence-content")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-optional-evidence-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("studio-optional-evidence-content")).toBeInTheDocument();
      expect(screen.getByTestId("studio-optional-evidence-cards")).toBeInTheDocument();
    });
    const cards = within(screen.getByTestId("studio-optional-evidence-cards"));
    expect(cards.getByText(/\bPython\b/i)).toBeInTheDocument();
    expect(cards.getByText(/\bSnowflake\b/i)).toBeInTheDocument();
    expect(cards.getAllByRole("link", { name: /verify this/i }).length).toBeGreaterThan(0);
  });
});
