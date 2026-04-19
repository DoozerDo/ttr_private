import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import StudioPage from "@/app/(app)/studio/page";
import { overrideSearchParams, setFetchImplementation } from "./setup";
import { EntitlementsProvider } from "@/src/lib/entitlements";

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
  it("blocked state never renders draft-in-progress hero messaging", async () => {
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
          scoring_v2: { score: 40 },
          verification_coverage: { missingBaselineEvidenceIssue: true },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
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

    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument());
    expect(screen.queryByText(/We are generating your application draft now/i)).toBeNull();
    expect(screen.queryByText(/Building your draft/i)).toBeNull();
  });

  it("bounds evidence text so raw baseline blobs do not render in full", async () => {
    const longEvidence = Array.from({ length: 520 }, () => "A").join("");
    const expectedPrefix = longEvidence.slice(0, 240);

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
        throw new Error(`[test] Unhandled POST ${url}`);
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-evidence-allowed-panel")).toBeInTheDocument());
    expect(screen.queryByText(longEvidence)).toBeNull();
    const evidencePanel = screen.getByTestId("studio-evidence-allowed-panel");
    expect(
      Array.from(evidencePanel.querySelectorAll("p")).some((node) =>
        (node.textContent ?? "").startsWith(expectedPrefix),
      ),
    ).toBe(true);
  });

  it("suppresses placeholder requirement labels before rendering", async () => {
    const { normalizeUserFacingRequirementLabel } = await import("@/lib/generationReadiness");
    expect(normalizeUserFacingRequirementLabel("next")).toBeNull();
  });

  it("failed page state can coexist with one failed artifact while the other remains reviewable", async () => {
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
          baselineVersionHash: "hash-1",
          jobFingerprint: "job-fingerprint-1",
          generationContractVersion: "studio-artifacts-v1",
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
        throw new Error(`[test] Unhandled POST ${url}`);
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("studio-instant-resume-panel")).toBeInTheDocument());
    expect(screen.queryByText("Document generation needs attention")).toBeNull();
    expect(screen.queryByText(/We are generating your application draft now/i)).toBeNull();
    expect(screen.queryByText(/Generation blocked/i)).toBeNull();
  });
});
