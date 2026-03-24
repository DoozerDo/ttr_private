import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { listBaselines } from "@/lib/baselines";
import { listJobs } from "@/lib/jobsClient";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockRouterPush, mockRouterReplace, overrideSearchParams, setFetchImplementation } from "./setup";

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
  const stringBody =
    typeof body === "string"
      ? body
      : body === undefined
        ? ""
        : JSON.stringify(body);

  return {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") {
          return "application/json";
        }
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
}

describe("Studio page UX", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("hydrates Studio from Results analysisId and shows the ready banner", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
      jobId: "job-2",
      baselineId: "base-2",
      baselineVersionId: "base-version-2",
    });
    vi.mocked(listJobs).mockResolvedValueOnce([
      {
        id: "job-1",
        company: "Acme",
        title: "Director of Support",
        archivedAt: null,
        isArchived: false,
      },
      {
        id: "job-2",
        company: "Orbit",
        title: "Head of Customer Operations",
        archivedAt: null,
        isArchived: false,
      },
    ]);
    vi.mocked(listBaselines).mockResolvedValueOnce([
      {
        id: "base-1",
        originalFilename: "Leadership Resume",
        version: 1,
      },
      {
        id: "base-2",
        originalFilename: "Platform Resume",
        version: 2,
      },
    ]);
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            score: 84,
            jobId: "job-2",
            baselineId: "base-2",
            baselineVersionId: "base-version-2",
            company: "Orbit",
            jobTitle: "Head of Customer Operations",
            supportingSignals: ["Incident Management", "Cross Functional Coordination"],
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-results-ready-banner")).toBeInTheDocument();
    });

    expect(screen.getByText("Studio ready")).toBeInTheDocument();
    expect(screen.getByText("Context loaded")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Generation readiness: READY")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Generation is ready for this scored analysis context."),
    ).toBeInTheDocument();
    expect(screen.getByText("Verification Coverage: STRONG")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-verification-issues")).not.toBeInTheDocument();
    expect(screen.getByText("Orbit — Head of Customer Operations")).toBeInTheDocument();
    expect(screen.getByText(/Using resume/i)).toHaveTextContent("Using resume Platform Resume");
    expect(fetchMock).toHaveBeenCalledWith("/api/analysis/fit-assessments/analysis-2", {
      cache: "no-store",
    });
  });

  it("renders the same limited readiness wording used in Results context", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 93,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            compliance_flags: [{ code: "limited_personalization", severity: "warn" }],
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [
              {
                code: "personalization_limitation",
                message:
                  "This role scored highly, but document generation is currently limited by verification constraints.",
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [
              {
                code: "personalization_limitation",
                message:
                  "This role scored highly, but document generation is currently limited by verification constraints.",
              },
            ],
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: LIMITED")).toBeInTheDocument();
    });
    expect(screen.getByText("Verification Coverage: PARTIAL")).toBeInTheDocument();
    const readinessCard = screen.getByTestId("studio-generation-readiness");
    expect(within(readinessCard).getByText("Generation readiness: LIMITED")).toBeInTheDocument();
  });

  it("renders blocked technology claim with specific claim text and next step", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 95,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 1,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Salesforce Service Cloud administration"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce Service Cloud administration".',
                evidence: [{ generated: "Salesforce Service Cloud administration" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.getByText("Verification Coverage: WEAK")).toBeInTheDocument();
    const issuesPanel = screen.getByTestId("studio-verification-issues");
    expect(
      within(issuesPanel).getByText("Salesforce Service Cloud administration"),
    ).toBeInTheDocument();
    expect(
      within(issuesPanel).getByRole("button", { name: "Remove from targeting" }),
    ).toBeInTheDocument();
    expect(within(issuesPanel).queryByText(/your baseline has issues/i)).not.toBeInTheDocument();
  });

  it("does not show all-supported coverage in top-band blocked state when claim statuses include unverified requirements", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 95,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            scoring_v2: {
              debug: {
                toolingCoverage: {
                  claims: [
                    {
                      key: "leadership-ops",
                      label: "Leadership and support operations",
                      category: "process",
                      sourceType: "job_required",
                      status: "VERIFIED",
                      evidenceRefs: ["support operations"],
                      generationBlocking: false,
                      scoreWeight: 1,
                    },
                    {
                      key: "zendesk-adjacent",
                      label: "Zendesk-adjacent support stack",
                      category: "tooling",
                      sourceType: "job_preferred",
                      status: "INFERRED",
                      evidenceRefs: ["ticketing system"],
                      generationBlocking: false,
                      scoreWeight: 0.4,
                    },
                    {
                      key: "salesforce",
                      label: "Salesforce",
                      category: "platform",
                      sourceType: "job_required",
                      status: "UNVERIFIED",
                      evidenceRefs: [],
                      generationBlocking: true,
                      scoreWeight: 0,
                    },
                  ],
                },
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.getByText(/Verified claims:\s*1 \/ 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Adjacent support \(inferred\):\s*1 · Unverified:\s*1/i)).toBeInTheDocument();
    expect(screen.queryByText(/Verified claims:\s*3 \/ 3/i)).not.toBeInTheDocument();
  });

  it("shows nonzero inferred count for high-fit blocked scenario with adjacent support while keeping verified honest", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            scoring_v2: {
              debug: {
                toolingCoverage: {
                  claims: [
                    {
                      key: "salesforce",
                      label: "Salesforce",
                      category: "platform",
                      sourceType: "job_required",
                      status: "INFERRED",
                      evidenceRefs: ["crm"],
                      generationBlocking: true,
                      scoreWeight: 0.4,
                    },
                    {
                      key: "five9",
                      label: "Five9",
                      category: "platform",
                      sourceType: "job_required",
                      status: "UNVERIFIED",
                      evidenceRefs: [],
                      generationBlocking: true,
                      scoreWeight: 0,
                    },
                  ],
                },
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Five9".',
                evidence: [{ generated: "Five9" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.getByText(/Fit score:\s*94/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified claims:\s*0 \/ 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Adjacent support \(inferred\):\s*1 · Unverified:\s*1/i)).toBeInTheDocument();
    const issuesPanel = screen.getByTestId("studio-verification-issues");
    expect(within(issuesPanel).getByText("Five9")).toBeInTheDocument();
    expect(within(issuesPanel).queryByText("Salesforce")).not.toBeInTheDocument();
    expect(screen.queryByText(/Generation readiness:\s*READY/i)).not.toBeInTheDocument();
  });

  it("does not render stale Salesforce unresolved issues when analysis claims verify Salesforce", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            scoring_v2: {
              debug: {
                toolingCoverage: {
                  claims: [
                    {
                      key: "salesforce",
                      label: "Salesforce",
                      category: "platform",
                      sourceType: "job_required",
                      status: "VERIFIED",
                      evidenceRefs: ["Owned workflows in Salesforce Service Cloud"],
                      generationBlocking: false,
                      scoreWeight: 1,
                    },
                    {
                      key: "five9",
                      label: "Five9",
                      category: "platform",
                      sourceType: "job_required",
                      status: "UNVERIFIED",
                      evidenceRefs: [],
                      generationBlocking: true,
                      scoreWeight: 0,
                    },
                  ],
                },
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Five9".',
                evidence: [{ generated: "Five9" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.getByText(/Verified claims:\s*1 \/ 2/i)).toBeInTheDocument();
    const issuesPanel = screen.getByTestId("studio-verification-issues");
    expect(within(issuesPanel).getByText("Five9")).toBeInTheDocument();
    expect(within(issuesPanel).queryByText("Salesforce")).not.toBeInTheDocument();
  });

  it("uses canonical verification_coverage for both counts and issue cards when claims are unavailable", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 3,
              verifiedClaims: 1,
              inferredClaims: 1,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Five9"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Five9".',
                evidence: [{ generated: "Five9" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.getByText(/Verified claims:\s*1 \/ 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Adjacent support \(inferred\):\s*1 .* Unverified:\s*1/i)).toBeInTheDocument();
    const issuesPanel = screen.getByTestId("studio-verification-issues");
    expect(within(issuesPanel).getByText("Five9")).toBeInTheDocument();
    expect(within(issuesPanel).queryByText("Salesforce")).not.toBeInTheDocument();
  });

  it("does not fall back to stale readiness issues when canonical coverage and claims are absent", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("studio-verification-issues")).not.toBeInTheDocument();
  });

  it("provides a top-level auto-adjust action that narrows targeting and recomputes readiness", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 2,
              unverifiedRequirements: ["Salesforce", "Five9"],
            },
            scoring_v2: {
              debug: {
                toolingCoverage: {
                  claims: [
                    {
                      key: "salesforce",
                      label: "Salesforce",
                      category: "platform",
                      sourceType: "job_required",
                      status: "UNVERIFIED",
                      evidenceRefs: [],
                      generationBlocking: true,
                      scoreWeight: 0,
                    },
                    {
                      key: "five9",
                      label: "Five9",
                      category: "platform",
                      sourceType: "job_required",
                      status: "UNVERIFIED",
                      evidenceRefs: [],
                      generationBlocking: true,
                      scoreWeight: 0,
                    },
                  ],
                },
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Five9".',
                evidence: [{ generated: "Five9" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-auto-adjust-panel")).toBeInTheDocument();
    });
    expect(screen.getByText("Fix this in one step")).toBeInTheDocument();
    expect(
      screen.getByText("These requirements are not verified from your baseline and are limiting generation."),
    ).toBeInTheDocument();
    const oneStepList = screen.getByTestId("studio-one-step-unverified-list");
    expect(within(oneStepList).getByText("- Salesforce")).toBeInTheDocument();
    expect(within(oneStepList).getByText("- Five9")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove unsupported requirements and continue" }));

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: READY")).toBeInTheDocument();
    });
    expect(screen.getByTestId("studio-targeting-adjustment-feedback")).toHaveTextContent(
      /Generation is now fully enabled\./i,
    );
    expect(screen.getByTestId("studio-targeting-adjustment-feedback")).toHaveTextContent(
      /Removed: Salesforce, Five9/i,
    );
    expect(screen.getByText(/Verified claims:\s*0 \/ 2/i)).toBeInTheDocument();
    expect(screen.getByTestId("studio-removed-targeting-list")).toHaveTextContent(
      /Salesforce, Five9/i,
    );
    expect(screen.queryByText("- Salesforce")).not.toBeInTheDocument();
    expect(screen.queryByText("- Five9")).not.toBeInTheDocument();
  });

  it("supports per-issue removal action and updates counts from adjusted targeting", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            scoring_v2: {
              debug: {
                toolingCoverage: {
                  claims: [
                    {
                      key: "salesforce",
                      label: "Salesforce",
                      category: "platform",
                      sourceType: "job_required",
                      status: "UNVERIFIED",
                      evidenceRefs: [],
                      generationBlocking: true,
                      scoreWeight: 0,
                    },
                    {
                      key: "five9",
                      label: "Five9",
                      category: "platform",
                      sourceType: "job_required",
                      status: "UNVERIFIED",
                      evidenceRefs: [],
                      generationBlocking: true,
                      scoreWeight: 0,
                    },
                  ],
                },
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Five9".',
                evidence: [{ generated: "Five9" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-verification-issues")).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByTestId("studio-verification-issues")).getAllByRole("button", { name: "Remove from targeting" })[0]!);

    await waitFor(() => {
      expect(screen.getByText(/Verified claims:\s*0 \/ 1/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    expect(screen.getByTestId("studio-targeting-adjustment-feedback")).toHaveTextContent(
      /Some requirements were removed, but more verified evidence is needed\./i,
    );
  });

  it("renders one-step panel for limited readiness and excludes inferred requirements from blocking list", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 90,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 3,
              verifiedClaims: 1,
              inferredClaims: 1,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Zendesk"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "personalization_limitation", message: "limited" }],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-auto-adjust-panel")).toBeInTheDocument();
    });
    const oneStepList = screen.getByTestId("studio-one-step-unverified-list");
    expect(within(oneStepList).getByText("- Zendesk")).toBeInTheDocument();
    expect(within(oneStepList).queryByText(/Salesforce/i)).not.toBeInTheDocument();
  });

  it("auto-applies exclusions from Results query params and shows immediate confirmation", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      excludedRequirements: "Salesforce",
    });
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 92,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 1,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Salesforce"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: READY")).toBeInTheDocument();
    });
    expect(screen.getByTestId("studio-targeting-adjustment-feedback")).toHaveTextContent(
      /Generation is now enabled\./i,
    );
    expect(screen.getByTestId("studio-targeting-adjustment-feedback")).toHaveTextContent(
      /Removed from targeting: Salesforce/i,
    );
  });

  it("does not render stale missing-baseline issue cards when canonical coverage is absent", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 91,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "baseline_verification_gap", message: "gap" }],
            compliance_flags: [
              {
                code: "missing_baseline_support",
                severity: "warn",
                message: "No support found",
                evidence: [{ generated: "Salesforce Service Cloud administration" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();
    await waitFor(() => {
      expect(screen.getByText("Generation readiness: LIMITED")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("studio-verification-issues")).not.toBeInTheDocument();
  });

  it("does not render stale overreach issue cards when canonical coverage is absent", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 90,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "scope_inflation",
                severity: "block",
                message: 'Unsupported claim "Led global support transformation".',
                evidence: [{ generated: "Led global support transformation" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();
    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("studio-verification-issues")).not.toBeInTheDocument();
  });

  it("shows canonical verification issue cards from unverified requirements", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 95,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 5,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 5,
              unverifiedRequirements: [
                "Salesforce",
                "Five9",
                "Led global org of 200+",
                "revenue-impacting",
                "2022",
              ],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Five9".',
                evidence: [{ generated: "Five9" }],
              },
              {
                code: "scope_inflation",
                severity: "block",
                message: 'Unsupported claim "Led global org of 200+".',
                evidence: [{ generated: "Led global org of 200+" }],
              },
              {
                code: "limited_personalization",
                severity: "warn",
                message: 'Limited claim "revenue-impacting".',
                evidence: [{ generated: "revenue-impacting" }],
              },
              {
                code: "missing_baseline_support",
                severity: "warn",
                message: 'Missing claim "2022".',
                evidence: [{ generated: "2022" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-verification-issues")).toBeInTheDocument();
    });

    const issuesPanel = screen.getByTestId("studio-verification-issues");
    expect(within(issuesPanel).getByText("Five9")).toBeInTheDocument();
    expect(within(issuesPanel).getByText("Led global org of 200+")).toBeInTheDocument();
    expect(within(issuesPanel).getByText("revenue-impacting")).toBeInTheDocument();
    expect(within(issuesPanel).getByText(/Additional verification limitations \(\d+\)/i)).toBeInTheDocument();
  });

  it("uses canonical unverified requirements for cards and excludes unlabeled stale readiness items", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 1,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Salesforce"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [
              {
                code: "missing_baseline_support",
                severity: "warn",
                message: "No source support found",
                evidence: [{ baseline: "source context only" }],
              },
              {
                code: "fictional_technology",
                severity: "block",
                message: 'Unsupported claim "Salesforce".',
                evidence: [{ generated: "Salesforce" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-verification-issues")).toBeInTheDocument();
    });

    const issuesPanel = screen.getByTestId("studio-verification-issues");
    expect(within(issuesPanel).getByText("Salesforce")).toBeInTheDocument();
    expect(within(issuesPanel).getAllByText("Requirement:")).toHaveLength(1);
    expect(within(issuesPanel).queryByText(/No source support found/i)).not.toBeInTheDocument();
    expect(within(issuesPanel).queryByText(/Additional verification limitations \(\d+\)/i)).not.toBeInTheDocument();
  });

  it("uses top-band streamlined generation CTA when score is 90+", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    expect(await screen.findByRole("button", { name: "Generate My Application" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Resume" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Cover Letter" })).not.toBeInTheDocument();
  });

  it("does not render top-band generate CTA when readiness is blocked and shows replacement CTA", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "full_block", message: "blocked" }],
            compliance_flags: [{ code: "fictional_technology", severity: "block" }],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Generate My Application" })).not.toBeInTheDocument();
    const replacement = screen.getByRole("link", { name: "Review Verification Gaps" });
    expect(replacement).toHaveAttribute("href", "/results#advanced-insights");
  });

  it("keeps top-band generate CTA when readiness is limited", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "personalization_limitation", message: "limited" }],
            compliance_flags: [{ code: "limited_personalization", severity: "warn" }],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation readiness: LIMITED")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Generate My Application" })).toBeInTheDocument();
  });

  it("shows guidance when analysisId is missing", async () => {
    overrideSearchParams({});

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Role analysis required")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Select a role from Results to generate documents.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Run a role compatibility analysis first.").length).toBeGreaterThan(0);
  });

  it("renders fit score when a valid analysisId is provided", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
    });
    vi.mocked(listJobs).mockResolvedValueOnce([
      {
        id: "job-2",
        company: "Orbit",
        title: "Head of Customer Operations",
        archivedAt: null,
        isArchived: false,
      },
    ]);
    vi.mocked(listBaselines).mockResolvedValueOnce([
      {
        id: "base-2",
        originalFilename: "Platform Resume",
        version: 2,
      },
    ]);
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            score: 84,
            jobId: "job-2",
            baselineId: "base-2",
            company: "Orbit",
            jobTitle: "Head of Customer Operations",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-results-ready-banner")).toBeInTheDocument();
    });

    expect(screen.getByText("84.0")).toBeInTheDocument();
  });

  it("enables document generation when role analysis is loaded", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
      jobId: "job-2",
      baselineId: "base-2",
      baselineVersionId: "base-version-2",
    });
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            score: 84,
            jobId: "job-2",
            baselineId: "base-2",
            baselineVersionId: "base-version-2",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    const resumeButton = await screen.findByRole("button", { name: "Generate Resume" });
    const coverLetterButton = await screen.findByRole("button", {
      name: "Generate Cover Letter",
    });
    await waitFor(() => {
      expect(resumeButton).toBeEnabled();
      expect(coverLetterButton).toBeEnabled();
    });
  });

  it("shows a concise analysis error when the analysis endpoint returns html", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
    });
    vi.mocked(listJobs).mockResolvedValueOnce([
      {
        id: "job-2",
        company: "Orbit",
        title: "Head of Customer Operations",
        archivedAt: null,
        isArchived: false,
      },
    ]);
    vi.mocked(listBaselines).mockResolvedValueOnce([
      {
        id: "base-2",
        originalFilename: "Platform Resume",
        version: 2,
      },
    ]);
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve({
          ok: false,
          status: 502,
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html" : null),
          },
          json: () => Promise.resolve(null),
          text: () =>
            Promise.resolve(
              "<!doctype html><html><body><h1>Application error</h1></body></html>",
            ),
          blob: () => Promise.resolve(new Blob()),
        });
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Unable to load role analysis")).toBeInTheDocument();
    });

    expect(
      screen.getAllByText(
        "Unable to load role analysis. Please return to Results and reopen the document generator.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Application error/i)).toBeNull();
    expect(screen.queryByText(/<!doctype html>/i)).toBeNull();
  });

  it("renders the Document Generator header", async () => {
    overrideSearchParams({});
    renderStudio();
    expect(screen.getByText("Document Generator")).toBeInTheDocument();
  });

  it("hides internal terms and metadata", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Targeting and Evidence")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Job$/)).toBeNull();
    expect(screen.queryByText(/^Baseline$/)).toBeNull();
    expect(screen.queryByText("Baseline Version ID:")).toBeNull();
    expect(screen.queryByText("Artifact Readiness")).toBeNull();
    expect(screen.queryByText(/Using baseline/i)).toBeNull();
    expect(screen.queryByText(/^Confidence$/)).toBeNull();
  });

  it("shows evidence summary and corrected focus recommendation", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Evidence used for this resume")).toBeInTheDocument();
    });

    expect(screen.getByText("Recommended: Leadership emphasis")).toBeInTheDocument();
    expect(screen.queryByText("Lead narrative")).toBeNull();
    expect(screen.getByText("View full baseline evidence")).toBeInTheDocument();
    expect(screen.getAllByText("Generate Resume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Generate Cover Letter").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Download: DOCX | PDF")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download DOCX" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  });

  it("renders resume preview with stronger hierarchy and preview label after generation", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  summary: "Support leader focused on scalable operations.",
                  competencies: ["Incident Management", "Support Operations"],
                  experience: [
                    {
                      company: "Cat Daddy Games",
                      roleTitle: "Senior Producer",
                      location: "Los Angeles, CA",
                      dateRange: "2020 - Present",
                      bullets: ["Led support operations programs.", "Built escalation workflows."],
                    },
                  ],
                },
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByTestId("resume-preview")).toBeInTheDocument();
    });
    expect(screen.getByText("Preview of tailored resume")).toBeInTheDocument();
    expect(screen.getByText("Alex Candidate")).toBeInTheDocument();
    expect(screen.getByText("Professional Experience")).toBeInTheDocument();
    expect(screen.getByText("Cat Daddy Games")).toBeInTheDocument();
    expect(screen.getByText("Senior Producer | Los Angeles, CA")).toBeInTheDocument();
    expect(screen.getByText("2020 - Present")).toBeInTheDocument();
  });

  it("shows a blocked compliance card without rendering raw JSON payloads", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 78,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume")) {
          return Promise.resolve(
            createResponse({
              status: "compliance_blocked",
              generationStatus: "blocked",
              safeDisplay: {
                title: "Resume blocked by compliance",
                description: "Verification required before this draft can be used.",
                reasons: ["Company reference needs verification"],
              },
              internal: {
                auditId: "audit-raw-123",
                baselineVersionHash: "internal-hash",
                complianceFlags: [{ code: "invented_company" }],
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getAllByText("Resume blocked by compliance").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("audit-raw-123")).toBeNull();
    expect(screen.queryByText(/internal-hash/)).toBeNull();
    expect(screen.queryByText(/\\{\"status\"/)).toBeNull();
  });

  it("enables downloads only after successful generation and keeps blocked documents disabled", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  experience: [
                    {
                      company: "Cat Daddy Games",
                      roleTitle: "Senior Producer",
                      bullets: ["Led support operations programs."],
                    },
                  ],
                },
              },
              safeDisplay: {
                title: "Resume generated successfully",
                description: "Resume ready.",
              },
            }),
          );
        }
        if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "blocked",
              generationStatus: "blocked",
              safeDisplay: {
                title: "Cover letter blocked by compliance",
                description: "Unsupported claims detected.",
                reasons: ["Role or title needs verification"],
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    const sections = screen.getAllByRole("heading", { name: /Generate/i });
    const resumeSection = sections[0]?.closest("section");
    const coverSection = sections[1]?.closest("section");
    if (!resumeSection || !coverSection) {
      throw new Error("Expected resume and cover sections");
    }

    expect(within(resumeSection).queryByRole("button", { name: "Download DOCX" })).toBeNull();
    expect(within(coverSection).queryByRole("button", { name: "Download DOCX" })).toBeNull();

    const resumeGenerateButton = within(resumeSection).getByRole("button", { name: "Generate Resume" });
    await waitFor(() => {
      expect(resumeGenerateButton).toBeEnabled();
    });
    fireEvent.click(resumeGenerateButton);
    await waitFor(() => {
      expect(within(resumeSection).getByText("Downloads are available.")).toBeInTheDocument();
    });
    expect(within(resumeSection).getByRole("button", { name: "Download DOCX" })).toBeEnabled();

    fireEvent.click(within(coverSection).getByRole("button", { name: "Generate Cover Letter" }));
    await waitFor(() => {
      expect(within(coverSection).getAllByText("Cover letter blocked by compliance").length).toBeGreaterThan(0);
    });
    expect(within(coverSection).getByText("Next step")).toBeInTheDocument();
    expect(within(coverSection).getByRole("button", { name: "Download DOCX" })).toBeDisabled();
  });

  it("shows retry UI when cover letter generation fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
          return Promise.reject(new Error("Service unavailable"));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Cover Letter" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Cover Letter" }));

    await waitFor(() => {
      expect(screen.getByText("Cover letter generation failed")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry generation" })).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("supports inline resume editing with save, cancel, export, and regeneration warning", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/") && url.includes("/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 82,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
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
          }),
        );
      }
      if (url.includes("/api/resume/export") && init?.method === "POST") {
        return Promise.resolve(createResponse({}, true, 200));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit Resume" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit Resume" }));
    const bulletEditor = await screen.findByLabelText("Resume bullet 1-1");
    fireEvent.change(bulletEditor, { target: { value: "Led support operations across enterprise customers." } });
    expect(screen.getByText("Unsaved edits")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel edits" }));
    expect(screen.queryByLabelText("Resume bullet 1-1")).toBeNull();
    expect(screen.getByText("Led support operations programs.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Resume" }));
    fireEvent.change(await screen.findByLabelText("Resume bullet 1-1"), {
      target: { value: "Led support operations across enterprise customers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edits" }));

    await waitFor(() => {
      expect(screen.getByText("Led support operations across enterprise customers.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Download DOCX" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/resume/export?format=docx",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const exportCall = fetchMock.mock.calls.find(
      ([url, requestInit]) => url === "/api/resume/export?format=docx" && requestInit?.method === "POST",
    );
    const exportBody = JSON.parse(String(exportCall?.[1]?.body)) as Record<string, unknown>;
    expect(exportBody.editedResume).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));
    expect(confirmSpy).toHaveBeenCalledWith("Regenerating will replace your saved edits for this version.");
    confirmSpy.mockRestore();
  });

  it("shows a resume generation error when API returns non-resume payload", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse(
              {
                error: {
                  code: "RESUME_GENERATION_CONTRACT_MISMATCH",
                  message: "Resume generation returned an unexpected payload shape.",
                },
              },
              false,
              502,
            ),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Additional baseline detail required")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Resume generation returned an unexpected payload shape."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No resume generated yet")).toBeInTheDocument();
  });

  it("reframes insufficient baseline evidence as a guided progression state", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 78,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse(
              {
                message:
                  "Resume could not be generated because no verified baseline evidence could be assembled into role relevant experience bullets.",
              },
              false,
              400,
            ),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(
        screen.getByText("More detail needed to generate a strong resume"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("You're close - a few more details will unlock a strong resume."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add detail to generate resume" })).toBeInTheDocument();
    expect(screen.getByText("Generate a basic draft anyway")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Generate Resume$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add detail to generate resume" }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/baseline?analysisId=analysis-1&jobId=job-1&baselineId=base-1&baselineVersionId=base-version-1",
    );
    expect(
      screen.queryByText("Resume failed due to system error"),
    ).not.toBeInTheDocument();
  });

  it("allows generation in non-production when promotion artifacts are not ready", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/") && url.includes("/versions")) {
        return Promise.resolve(createResponse([]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse({ score: 82, jobId: "job-1", baselineId: "base-1" }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                experience: [],
                education: [],
              },
            },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getAllByText("Generation prerequisites").length).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/resume",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const postCall = fetchMock.mock.calls.find(
      ([url, requestInit]) => url === "/api/resume" && requestInit?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const requestBody = postCall?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    const parsedBody = JSON.parse(requestBody as string) as Record<string, unknown>;
    expect(parsedBody.baselineVersionId).toBeUndefined();
    expect(parsedBody.analysisId).toBe("analysis-1");
  });

  it("supports assessmentId query param as a backward-compatible fallback", async () => {
    overrideSearchParams({ assessmentId: "assessment-legacy" });
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/assessment-legacy")) {
        return Promise.resolve(
          createResponse({
            score: 81,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("81.0")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/analysis/fit-assessments/assessment-legacy", {
      cache: "no-store",
    });
  });

  it("renders evidence expansion form for canonical unverified requirements", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 83,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 1,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Zendesk"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "limited", message: "limited" }] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-evidence-expansion")).toBeInTheDocument();
    });
    expect(screen.getByText("Prove this experience instead")).toBeInTheDocument();
    expect(screen.getByText("Zendesk is not verified")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add supporting experience" }));
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));
    expect(screen.getByText("Please add where you used this and what you did.")).toBeInTheDocument();
  });

  it("submits supporting evidence and triggers recompute orchestration", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 84,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 1,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Zendesk"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "limited", message: "limited" }] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      if (url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH") {
        return Promise.resolve(createResponse({ id: "base-1" }));
      }
      if (url.includes("/api/analysis/run") && init?.method === "POST") {
        return Promise.resolve(createResponse({ assessmentId: "analysis-2", baselineVersionId: "base-version-2" }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Zendesk is not verified")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add supporting experience" }));
    fireEvent.change(screen.getByLabelText("Where did you use this?"), {
      target: { value: "Senior Support Manager at Acme" },
    });
    fireEvent.change(screen.getByLabelText("What did you do with this tool?"), {
      target: { value: "Owned Zendesk workflows, automations, and support analytics." },
    });
    fireEvent.change(screen.getByLabelText("What impact did this have? (optional)"), {
      target: { value: "Reduced first response time by 22%." },
    });
    fireEvent.click(screen.getByLabelText("This is accurate and reflects real experience"));
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, requestInit]) =>
            typeof url === "string" &&
            url.includes("/api/baselines/base-1/strengthening-additions") &&
            requestInit?.method === "PATCH",
        ),
      ).toBe(true);
    });
    expect(mockRouterReplace).toHaveBeenCalledWith(
      "/studio?analysisId=analysis-2&jobId=job-1&baselineId=base-1&baselineVersionId=base-version-2",
    );
  });

  it("allows editing suggested evidence before adding and dismissing suggestions", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 82,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            supportingSignals: ["Managed support workflows"],
            baselineEvidence: "Owned support operations cadence.",
            verification_coverage: {
              totalClaims: 1,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Zendesk"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "limited", message: "limited" }] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      if (url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH") {
        return Promise.resolve(createResponse({ id: "base-1" }));
      }
      if (url.includes("/api/analysis/run") && init?.method === "POST") {
        return Promise.resolve(createResponse({ assessmentId: "analysis-3", baselineVersionId: "base-version-3" }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Suggested evidence:")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Suggested evidence:")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add supporting experience" }));
    fireEvent.change(screen.getByLabelText("Where did you use this?"), {
      target: { value: "Support Operations Manager" },
    });
    fireEvent.change(screen.getByLabelText("What did you do with this tool?"), {
      target: { value: "Edited custom workflow description." },
    });
    fireEvent.click(screen.getByLabelText("This is accurate and reflects real experience"));
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, requestInit]) =>
          typeof url === "string" &&
          url.includes("/api/baselines/base-1/strengthening-additions") &&
          requestInit?.method === "PATCH",
      );
      expect(call).toBeDefined();
      const parsed = JSON.parse((call?.[1]?.body as string) ?? "{}") as { rawText?: string };
      expect(parsed.rawText).toContain("Edited custom workflow description.");
    });
  });

  it("shows outcome guidance from past applications", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 89,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.includes("/api/resume/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
        }
        if (url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
        }
        if (url.includes("/api/applications/insights")) {
          return Promise.resolve(
            createResponse([
              {
                type: "warning",
                message: "You applied to roles where Zendesk was unverified and did not receive interviews yet.",
              },
            ]),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Based on your history")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Roles like this perform better when all support tools are verified."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Zendesk was unverified/i)).toBeInTheDocument();
  });

  it("captures opportunity snapshot when tracking an application", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/") && url.includes("/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 92,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              unverifiedRequirements: ["Zendesk"],
              verifiedRequirements: ["Salesforce"],
              inferredRequirements: ["Service Cloud"],
              supportedRequirements: ["Salesforce", "Service Cloud"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            trackerEntryId: "app-123",
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Summary",
                competencies: [],
                experience: [],
              },
            },
          }),
        );
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            content: "Cover letter",
          }),
        );
      }
      if (url.includes("/api/applications/app-123") && init?.method === "PATCH") {
        return Promise.resolve(createResponse({ id: "app-123" }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate My Application" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate My Application" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Track Application" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Track Application" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, requestInit]) =>
          typeof url === "string" &&
          url.includes("/api/applications/app-123") &&
          requestInit?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const payload = JSON.parse((patchCall?.[1]?.body as string) ?? "{}") as {
        analysisId?: string;
        verificationCoverageSnapshot?: { unverifiedRequirements?: string[] };
      };
      expect(payload.analysisId).toBe("analysis-1");
      expect(payload.verificationCoverageSnapshot?.unverifiedRequirements).toEqual(["Zendesk"]);
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/job-tracker");
  });
});
