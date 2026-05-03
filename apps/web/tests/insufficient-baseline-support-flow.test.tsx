import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FitReviewClient from "@/app/(app)/fit-review/FitReviewClient";
import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

const trackEventMock = vi.fn();
const resolveStudioNextMoveMock = vi.hoisted(() => vi.fn());
const getCanonicalNextActionMock = vi.hoisted(() => vi.fn());
const buildGenerationProductReadinessMock = vi.hoisted(() => vi.fn());
const evaluateStudioTrustGateMock = vi.hoisted(() => vi.fn());
var actualGetCanonicalNextAction: typeof import("@/lib/nextAction").getCanonicalNextAction | null = null;
var actualBuildGenerationProductReadiness:
  | typeof import("@/lib/generationProductReadiness").buildGenerationProductReadiness
  | null = null;
var actualEvaluateStudioTrustGate: typeof import("@/lib/studioTrustGate").evaluateStudioTrustGate | null = null;

vi.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));
vi.mock("@/lib/nextAction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nextAction")>("@/lib/nextAction");
  actualGetCanonicalNextAction = actual.getCanonicalNextAction;
  getCanonicalNextActionMock.mockImplementation(actual.getCanonicalNextAction);
  return {
    ...actual,
    getCanonicalNextAction: getCanonicalNextActionMock,
  };
});
vi.mock("@/src/lib/studio/nextMove", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/studio/nextMove")>(
    "@/src/lib/studio/nextMove",
  );
  resolveStudioNextMoveMock.mockImplementation(actual.resolveStudioNextMove);
  return {
    ...actual,
    resolveStudioNextMove: resolveStudioNextMoveMock,
  };
});
vi.mock("@/lib/generationProductReadiness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generationProductReadiness")>(
    "@/lib/generationProductReadiness",
  );
  actualBuildGenerationProductReadiness = actual.buildGenerationProductReadiness;
  buildGenerationProductReadinessMock.mockImplementation(actual.buildGenerationProductReadiness);
  return {
    ...actual,
    buildGenerationProductReadiness: buildGenerationProductReadinessMock,
  };
});
vi.mock("@/lib/studioTrustGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studioTrustGate")>(
    "@/lib/studioTrustGate",
  );
  actualEvaluateStudioTrustGate = actual.evaluateStudioTrustGate;
  evaluateStudioTrustGateMock.mockImplementation(actual.evaluateStudioTrustGate);
  return {
    ...actual,
    evaluateStudioTrustGate: evaluateStudioTrustGateMock,
  };
});
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

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  const response = {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
  return {
    ...response,
    clone: () => ({ ...response }),
  };
}

const CAP_MESSAGE =
  "Score capped because the verified baseline does not show enough support for this role scope.";

const penalty = {
  code: "insufficient_baseline_support",
  points: 0,
  reason:
    "Score capped below strong-apply territory due to insufficient baseline evidence (baseline_recall=11.2% responsibility_overlap=38.7% required_tool_coverage=9.5%).",
};

describe("insufficient_baseline_support flows into Fit Review and Studio", () => {
  it("renders the capped-score warning in Fit Review and Studio", async () => {
    overrideSearchParams({ jobId: "job-1", analysisId: "analysis-1", baselineId: "base-1" });

    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";

        if (url.includes("/api/analysis/job/job-1/latest")) {
          return Promise.resolve(
            createResponse({
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              assessmentId: "analysis-1",
              verdict: "consider",
              summary: "Some keyword match, but evidence is too thin for the full scope.",
              scoring_v2: {
                score: 79,
                rubric: {
                  penalties: [penalty],
                },
              },
            }),
          );
        }

        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              company: "Acme",
              title: "Director of Support",
              scoring_v2: {
                score: 79,
                rubric: {
                  penalties: [penalty],
                },
              },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 0,
                inferredClaims: 1,
                unverifiedClaims: 2,
                unverifiedRequirements: ["Salesforce"],
              },
            }),
          );
        }

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }

        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "missing",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              resume: null,
              coverLetter: null,
            }),
          );
        }

        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(
            createResponse({ status: "limited", reasons: ["readiness_pending"], compliance_flags: [] }),
          );
        }

        return Promise.resolve(createResponse({}, false, 404));
      }),
    );

    render(<FitReviewClient />);

    const fitWarning = await screen.findByTestId("fit-review-score-cap-warning");
    expect(fitWarning).toBeInTheDocument();
    expect(within(fitWarning).getByText(CAP_MESSAGE)).toBeInTheDocument();
    expect(fitWarning).toHaveTextContent("Baseline recall: 11.2%");
    expect(fitWarning).toHaveTextContent("Responsibility overlap: 38.7%");
    expect(fitWarning).toHaveTextContent("Required tool coverage: 9.5%");

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

    await waitFor(() => {
      expect(screen.getByTestId("studio-score-cap-warning")).toBeInTheDocument();
    });
    const studioWarning = screen.getByTestId("studio-score-cap-warning");
    expect(within(studioWarning).getByText(CAP_MESSAGE)).toBeInTheDocument();
    expect(studioWarning).toHaveTextContent("Baseline recall: 11.2%");
    expect(studioWarning).toHaveTextContent("Responsibility overlap: 38.7%");
    expect(studioWarning).toHaveTextContent("Required tool coverage: 9.5%");
  });
});
