import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import StudioPage from "@/app/(app)/studio/page";
import { overrideSearchParams, setFetchImplementation } from "./setup";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import * as generationProductReadiness from "@/lib/generationProductReadiness";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

function renderStudio() {
  render(
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

describe("Studio truth alignment", () => {
  function removeStudioArtifactSnapshot() {
    try {
      const key = "ttr:studio-artifacts:v2:job-1:base-1:analysis-1";
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.removeItem === "function") {
        window.localStorage.removeItem(key);
      }
    } catch {
      // best effort
    }
  }

  it("blocked state never renders draft-in-progress hero messaging", async () => {
    removeStudioArtifactSnapshot();
    vi.spyOn(generationProductReadiness, "buildGenerationProductReadiness").mockReturnValue({
      generation_readiness: { canGenerate: true, canExport: false, reasonsBlocked: [] },
      state: "ALLOWED",
      confidence: "LOW",
      needsVerification: false,
      tier: "generation_allowed",
      canOpenStudio: false,
      generationMode: "verified",
    });
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchCalls: Array<{ url: string; method: string }> = [];
    const customFetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push({ url, method: String(init?.method ?? "GET").toUpperCase() });

      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          scoring_v2: { score: 40 },
          verification_coverage: { missingBaselineEvidenceIssue: true },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
        });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return createResponse({
          status: "blocked",
          reasons: [{ code: "low_fit", message: "blocked" }],
          compliance_flags: [],
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createResponse({ id: "base-1", originalFilename: "Resume.pdf", sections: [] });
      }
      if (url.includes("/api/baselines")) {
        return createResponse([{ id: "base-1", originalFilename: "Resume.pdf", status: "ACTIVE", isActive: true }]);
      }
      if (url.includes("/api/jobs")) {
        return createResponse([{ id: "job-1", company: "Acme", title: "Director of Support" }]);
      }
      if (url.includes("/api/analytics/event")) {
        return createResponse({ ok: true });
      }
      // Any other fetches return empty ok JSON
      if (init?.method === "POST") return createResponse({ ok: true });
      return createResponse({});
    });
    setFetchImplementation(customFetch as unknown as typeof fetch);

    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument());
    expect(screen.queryByText(/We are generating your application draft now/i)).toBeNull();
    expect(screen.queryByText(/Building your draft/i)).toBeNull();
  });

  it("bounds evidence text so raw baseline blobs do not render in full", async () => {
    removeStudioArtifactSnapshot();
    const longEvidence = Array.from({ length: 520 }, () => "A").join("");
    const expectedPrefix = longEvidence.slice(0, 240);
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

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          scoring_v2: { score: 90 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          supportingSignals: [longEvidence],
          verification_coverage: { totalClaims: 2, verifiedClaims: 2, inferredClaims: 0, unverifiedClaims: 0 },
        });
      }
      if (url.includes("/api/resume")) {
        return createResponse({
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Support leader focused on scalable operations.",
              experience: [
                {
                  company: "Cat Daddy Games",
                  roleTitle: "Senior Producer",
                  location: "Los Angeles, CA",
                  dateRange: "2020 - Present",
                  bullets: ["Led support operations programs."],
                },
              ],
              education: [{ degree: "BA", institution: "State University", location: "Remote" }],
              competencies: ["Customer strategy", "Operational leadership"],
            },
          },
        });
      }
      if (url.includes("/api/cover-letters")) {
        return createResponse({
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            coverLetter: {
              paragraphs: [
                "Dear Hiring Team,",
                "I bring verified leadership and operational experience aligned to this role.",
                "Sincerely,",
                "Alex Candidate",
              ],
            },
          },
        });
      }
      if (url.includes("/api/resume/readiness")) {
        return createResponse({ status: "ready", reasons: [], compliance_flags: [] });
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [], compliance_flags: [] });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createResponse({ id: "base-1", originalFilename: "Resume.pdf", sections: [] });
      }
      if (url.includes("/api/baselines")) {
        return createResponse([{ id: "base-1", originalFilename: "Resume.pdf", status: "ACTIVE", isActive: true }]);
      }
      if (url.includes("/api/jobs")) {
        return createResponse([{ id: "job-1", company: "Acme", title: "Director of Support" }]);
      }
      if (url.includes("/api/analytics/event")) {
        return createResponse({ ok: true });
      }
      if (init?.method === "POST") {
        return createResponse({ ok: true });
      }
      return createResponse({});
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    renderStudio();

    // Evidence can render in different surfaces; contract is that we never render full raw blobs.
    await waitFor(() => {
      expect(document.querySelector("#studio-fit-reasoning")).toBeTruthy();
    });
    expect(screen.queryByText(longEvidence)).toBeNull();
    const fitReasoning = document.querySelector("#studio-fit-reasoning");
    expect(
      Array.from(fitReasoning?.querySelectorAll("p") ?? []).some((node) =>
        (node.textContent ?? "").startsWith(expectedPrefix),
      ),
    ).toBe(true);
  });

  it("suppresses placeholder requirement labels before rendering", async () => {
    const { normalizeUserFacingRequirementLabel } = await import("@/lib/generationReadiness");
    expect(normalizeUserFacingRequirementLabel("next")).toBeNull();
  });

  it("failed page state can coexist with one failed artifact while the other remains reviewable", async () => {
    removeStudioArtifactSnapshot();
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

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          scoring_v2: { score: 90 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          verification_coverage: { totalClaims: 2, verifiedClaims: 2, inferredClaims: 0, unverifiedClaims: 0 },
        });
      }
      if (url.includes("/api/resume/readiness")) {
        return createResponse({ status: "ready", reasons: [], compliance_flags: [] });
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [], compliance_flags: [] });
      }
      if (url.includes("/api/studio/artifacts")) {
        return createResponse({
          status: "COMPLETED",
          baselineId: "base-1",
          jobId: "job-1",
          baselineVersionId: "base-version-1",
          artifactReadiness: "ready",
          baselineVersionHash: "hash-1",
          jobFingerprint: "job-fingerprint-1",
          generationContractVersion: "studio-artifacts-v1",
          resumeResult: { generationState: "completed", exportReady: true },
          coverLetterResult: { generationState: "failed", exportReady: false },
          resume: {
            status: "COMPLETED",
            inputsHash: "resume-hash",
            responseBody: {
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  summary: "Support leader focused on scalable operations.",
                  experience: [
                    {
                      company: "Cat Daddy Games",
                      roleTitle: "Senior Producer",
                      bullets: ["Led support operations programs."],
                    },
                  ],
                  education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                  competencies: ["Customer strategy", "Operational leadership"],
                },
              },
            },
            content: "resume-content",
            failureCode: null,
            failureMessage: null,
            startedAt: null,
            completedAt: new Date().toISOString(),
            failedAt: null,
            metadata: { auditId: "audit-1" },
          },
          coverLetter: {
            status: "FAILED",
            inputsHash: "cover-hash",
            responseBody: null,
            content: null,
            failureCode: "cover_validation_failed",
            failureMessage: "Cover letter generation did not return a usable document.",
            startedAt: null,
            completedAt: null,
            failedAt: new Date().toISOString(),
            metadata: { auditId: "audit-2" },
          },
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createResponse({ id: "base-1", originalFilename: "Resume.pdf", sections: [] });
      }
      if (url.includes("/api/baselines")) {
        return createResponse([{ id: "base-1", originalFilename: "Resume.pdf", status: "ACTIVE", isActive: true }]);
      }
      if (url.includes("/api/jobs")) {
        return createResponse([{ id: "job-1", company: "Acme", title: "Director of Support" }]);
      }
      if (url.includes("/api/analytics/event")) {
        return createResponse({ ok: true });
      }
      if (init?.method === "POST") {
        return createResponse({ ok: true });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument());
    expect(screen.queryByText("Document generation needs attention")).toBeNull();
    expect(screen.queryByText(/We are generating your application draft now/i)).toBeNull();
    expect(screen.queryByText(/Generation blocked/i)).toBeNull();
  });

  it("prefers a successful cover-letter response body over a stale failed persisted result", async () => {
    removeStudioArtifactSnapshot();
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

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({
          assessmentId: "analysis-1",
          scoring_v2: { score: 90 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          verification_coverage: { totalClaims: 2, verifiedClaims: 2, inferredClaims: 0, unverifiedClaims: 0 },
        });
      }
      if (url.includes("/api/resume/readiness")) {
        return createResponse({ status: "ready", reasons: [], compliance_flags: [] });
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [], compliance_flags: [] });
      }
      if (url.includes("/api/studio/artifacts")) {
        return createResponse({
          status: "completed",
          baselineId: "base-1",
          jobId: "job-1",
          baselineVersionId: "base-version-1",
          assessmentScore: 90,
          generationContractVersion: "studio-artifacts-v1",
          resumeResult: {
            artifactType: "resume",
            status: "success",
            generationStatus: "success",
            generationState: "generated_usable",
            qualityStatus: "pass",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Support leader focused on scalable operations.",
                experience: [
                  {
                    company: "Cat Daddy Games",
                    roleTitle: "Senior Producer",
                    bullets: ["Led support operations programs."],
                  },
                ],
              },
            },
          },
          coverLetterResult: {
            artifactType: "cover_letter",
            generationState: "generated_needs_correction",
            qualityStatus: "failed",
            preview: {
              paragraphs: [
                "Dear Hiring Team at Acme,",
                "I am excited to apply for the Director of Support role at Acme because I have led customer operations, built measurable service improvements, and partnered with engineering and product teams to reduce customer pain. My background includes scaling support programs, coaching managers, and turning ambiguous operational problems into clear plans that improve response times, retention, and team confidence. I would bring that same steady execution to this role, with a focus on pragmatic systems, strong communication, and outcomes that matter to customers and the business.",
              ],
            },
            correctionReasons: [{ code: "needs_correction", message: "needs_correction", severity: "warning" }],
            exportReady: false,
            exports: { docx: false, pdf: false },
            actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
          },
          resume: {
            status: "COMPLETED",
            artifactId: "resume-good-1",
            usableCurrent: true,
            inputsHash: true,
            responseBody: {
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  summary: "Support leader focused on scalable operations.",
                  experience: [
                    {
                      company: "Cat Daddy Games",
                      roleTitle: "Senior Producer",
                      bullets: ["Led support operations programs."],
                    },
                  ],
                },
              },
            },
            content: "Resume",
            failureCode: null,
            failureMessage: null,
            completedAt: new Date().toISOString(),
            failedAt: null,
            metadata: { auditId: "resume-audit-1" },
          },
          coverLetter: {
            status: "FAILED",
            artifactId: "cover-good-1",
            usableCurrent: true,
            inputsHash: true,
            responseBody: {
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                coverLetter: {
                  paragraphs: [
                    "Dear Hiring Team at Acme,",
                    "I am excited to apply for the Director of Support role at Acme because I have led customer operations, built measurable service improvements, and partnered with engineering and product teams to reduce customer pain. My background includes scaling support programs, coaching managers, and turning ambiguous operational problems into clear plans that improve response times, retention, and team confidence. I would bring that same steady execution to this role, with a focus on pragmatic systems, strong communication, and outcomes that matter to customers and the business.",
                  ],
                },
              },
            },
            content: "Dear Hiring Team at Acme, ...",
            failureCode: "stale_failed_cover_letter",
            failureMessage: "stale failure record should not win over successful response body",
            completedAt: new Date().toISOString(),
            failedAt: null,
            metadata: { auditId: "cover-audit-1" },
          },
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createResponse({ id: "base-1", originalFilename: "Resume.pdf", sections: [] });
      }
      if (url.includes("/api/baselines")) {
        return createResponse([{ id: "base-1", originalFilename: "Resume.pdf", status: "ACTIVE", isActive: true }]);
      }
      if (url.includes("/api/jobs")) {
        return createResponse([{ id: "job-1", company: "Acme", title: "Director of Support" }]);
      }
      if (url.includes("/api/analytics/event")) {
        return createResponse({ ok: true });
      }
      if (init?.method === "POST") {
        return createResponse({ ok: true });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"studioArtifactPairStatus\": \"completed\"");
      expect(raw).toContain("\"hasCoverLetterArtifactPersisted\": true");
      expect(raw).toContain("\"hasResumeArtifactPersisted\": true");
      expect(raw).toContain("\"hasAnyArtifactPersisted\": true");
      expect(raw).not.toContain("\"studioArtifactPairStatus\": \"failed\"");
    }, { timeout: 15000 });

    expect(screen.getByTestId("studio-resume-ready-panel")).toBeInTheDocument();
    expect(screen.getByTestId("studio-cover-ready-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-resume-generated-unusable")).toBeNull();
    expect(screen.queryByTestId("studio-cover-generated-unusable")).toBeNull();
    expect(screen.queryByTestId("studio-cover-correction-panel")).toBeNull();
    expect(screen.queryByText(/Resume draft needs edits/i)).toBeNull();
    expect(screen.queryByText(/Cover letter generated successfully/i)).toBeInTheDocument();
  }, 15000);
});
