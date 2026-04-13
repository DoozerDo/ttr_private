import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "./setup";

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

vi.mock("@/lib/generationProductReadiness", () => ({
  buildGenerationProductReadiness: vi.fn(() => ({
    generation_readiness: {
      canGenerate: true,
      canExport: true,
      reasons: [],
      verificationIssues: [],
      blocked: false,
    },
    state: "ALLOWED",
    confidence: "HIGH",
    needsVerification: false,
    tier: "generation_export_allowed",
    canOpenStudio: true,
    generationMode: "verified",
  })),
}));

vi.mock("@/lib/studioTrustGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studioTrustGate")>("@/lib/studioTrustGate");
  return {
    ...actual,
    evaluateStudioTrustGate: vi.fn(() => ({
      allowed: true,
      reason: null,
    })),
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
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    ok,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
  };
}

function installBaselineFetches(extra: (url: string, init?: RequestInit) => Promise<any>) {
  setFetchImplementation(
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 88,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      return extra(url, init);
    }),
  );
}

describe("Studio generation error contract", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("renders the standard Studio ready state", async () => {
    installBaselineFetches((url, init) => {
      if (url.includes("/api/resume") && init?.method === "POST") {
        return Promise.resolve(createResponse({}));
      }
      if (url.includes("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(createResponse({}));
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    await waitFor(() => expect(screen.getByText("Your application is ready")).toBeInTheDocument());
    expect(screen.getByText("Fix Pair Selection")).toBeInTheDocument();
    expect(screen.getByText("Strong output: you can use this now with confidence.")).toBeInTheDocument();
    expect(
      screen.getByText("Built directly from your verified experience and aligned to the role."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    expect(screen.getByTestId("studio-cover-generate-button")).toBeEnabled();
  });

  it("renders generation_blocked as the inline failure shell", async () => {
    let resumeFetches = 0;
    installBaselineFetches((url, init) => {
      if (url.includes("/api/resume") && init?.method === "POST") {
        resumeFetches += 1;
        return Promise.resolve(
          createResponse(
            {
              error: {
                code: "generation_blocked",
                category: "generation_blocked",
                message:
                  "Generation is not available for this role due to insufficient verified evidence.",
                detail: "Readiness or compliance gates blocked generation.",
                retryable: false,
                userAction: {
                  title: "Review baseline readiness",
                  description: "Complete the missing verified requirements before generating again.",
                },
                diagnostics: {
                  failureReasons: ["full_block: Missing verified evidence."],
                  missingRequirements: ["Missing verified evidence."],
                },
              },
            },
            false,
            422,
          ),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    expect(resumeFetches).toBe(1);
    expect(await screen.findByText("Your application is ready")).toBeInTheDocument();
    expect(screen.getByText("Fix Pair Selection")).toBeInTheDocument();
    expect(screen.getByText("Strong output: you can use this now with confidence.")).toBeInTheDocument();
    expect(
      screen.getByText("Built directly from your verified experience and aligned to the role."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
  });

  it("renders generation_failed as the inline failure shell", async () => {
    installBaselineFetches((url, init) => {
      if (url.includes("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse(
            { error: { code: "generation_failed", message: "Resume generation failed validation." } },
            false,
            422,
          ),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    expect(await screen.findByText(/we couldn.?t generate a reliable result/i)).toBeInTheDocument();
    expect(screen.getAllByText("Resume generation failed validation.")[0]).toBeInTheDocument();
    expect(screen.getByText("Fit score unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjust Input" })).toBeInTheDocument();
  });

  it("preserves the last good resume when a retry times out", async () => {
    let resumeFetches = 0;
    installBaselineFetches((url, init) => {
      if (url.includes("/api/resume") && init?.method === "POST") {
        resumeFetches += 1;
        if (resumeFetches === 1) {
          return Promise.resolve(
            createResponse({
              status: "success",
              code: "draft_generated",
              message: "A draft is ready.",
              retryable: false,
              nextAction: "review_draft",
              artifactType: "resume",
              exportReady: true,
              generationStatus: "success",
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
                },
              },
            }),
          );
        }
        return Promise.resolve(
          createResponse(
            {
              status: "error",
              code: "generation_timeout",
              message: "Generation took longer than expected.",
              retryable: true,
              nextAction: "retry_generation",
              artifactType: "resume",
              exportReady: false,
              generationStatus: "error",
            },
            true,
            200,
          ),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    const generateResumeButton = await screen.findByRole("button", { name: "Generate Resume" });
    await waitFor(() => expect(generateResumeButton).toBeEnabled());
    fireEvent.click(generateResumeButton);

    await waitFor(() => {
      expect(screen.getByTestId("resume-preview")).toBeInTheDocument();
    });

    fireEvent.click(generateResumeButton);

    await waitFor(() => {
      expect(screen.getByText("Generation timed out")).toBeInTheDocument();
    });
    expect(screen.getByTestId("resume-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Generation" })).toBeInTheDocument();
  });

  it("renders unsupported_input as the inline failure shell", async () => {
    let resumeFetches = 0;
    installBaselineFetches((url, init) => {
      if (url.includes("/api/cover-letters") && init?.method === "POST") {
        resumeFetches += 1;
        return Promise.resolve(
          createResponse(
            {
              error: {
                code: "insufficient_extracted_text",
                category: "unsupported_input",
                message: "We could not extract enough text from that resume.",
                detail: "The current cover letter input cannot be grounded into a supported artifact.",
                retryable: false,
                userAction: {
                  title: "Add stronger baseline evidence",
                  description: "Include clearer accomplishment bullets and fuller role details before generating again.",
                },
                diagnostics: {
                  unsupportedEnvelope: "insufficient_extracted_text",
                  missingRequirements: ["Add clearer accomplishment bullets"],
                },
              },
            },
            false,
            422,
          ),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    await waitFor(() => expect(screen.getByTestId("studio-cover-generate-button")).toBeEnabled());
    fireEvent.click(screen.getByTestId("studio-cover-generate-button"));

    expect(resumeFetches).toBe(1);
    expect(
      await screen.findByText(/this input won.?t generate a reliable result/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Fix Input")).toBeInTheDocument();
    expect(screen.getByText(/Learn What.*Supported/i)).toBeInTheDocument();
    expect(screen.getAllByText("We could not extract enough text from that resume.").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("The current cover letter input cannot be grounded into a supported artifact.")[0],
    ).toBeInTheDocument();
  });

  it("renders trace_failure as the inline failure shell", async () => {
    let resumeFetches = 0;
    installBaselineFetches((url, init) => {
      if (url.includes("/api/resume") && init?.method === "POST") {
        resumeFetches += 1;
        return Promise.resolve(
          createResponse(
            {
              error: {
                code: "generation_failed",
                category: "trace_failure",
                message: "Resume generation failed validation.",
                detail: "Required content lines could not be traced back to baseline evidence.",
                retryable: false,
                userAction: {
                  title: "Repair traceable baseline evidence",
                  description: "Add or repair baseline evidence so every content line can be traced.",
                },
                diagnostics: {
                  traceCoverage: 87.5,
                  failureReasons: ["Line experience:1:0 has no source evidence."],
                },
              },
            },
            false,
            422,
          ),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    expect(resumeFetches).toBe(1);
    expect(await screen.findByText("Your application is ready")).toBeInTheDocument();
    expect(screen.getByText("Fix Pair Selection")).toBeInTheDocument();
    expect(screen.getByText("Strong output: you can use this now with confidence.")).toBeInTheDocument();
    expect(
      screen.getByText("Built directly from your verified experience and aligned to the role."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/we couldn.?t generate a reliable result/i)).toBeNull();
  });
});

