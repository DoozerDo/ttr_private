import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import { BaselineStudioHome } from "@/app/(app)/baseline/BaselineStudioHome";
import ResultsPage from "@/app/(app)/results/page";
import StudioPage from "@/app/(app)/studio/page";
import TargetPage from "@/app/(app)/target/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import {
  mockRouterReplace,
  overrideSearchParams,
  setFetchImplementation,
} from "./setup";

const trackEventMock = vi.fn();

vi.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

let activeScenario: SyntheticJourneyScenario | null = null;

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => activeScenario?.jobs ?? []),
}));

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual<typeof import("@/lib/baselines")>("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => activeScenario?.studioBaselines ?? []),
  };
});

type BaselineSummary = {
  latestAssessmentId: string | null;
  latestAssessmentCreatedAt: string | null;
  latestFitScore: number | null;
  hasCompletedAssessment: boolean;
};

type BaselineDto = {
  id: string;
  userId: string;
  version: number;
  versionNumber: number;
  isActive: boolean;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  hash: string | null;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  latestAssessmentSummary?: BaselineSummary | null;
  sections?: Array<{
    id: string;
    baselineId: string;
    sectionType: string;
    title: string;
    content: string;
    includePolicy: "always";
    order: number;
    createdAt: string;
    updatedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type JobDto = {
  id: string;
  company: string;
  title: string;
  archivedAt: string | null;
  isArchived: boolean;
};

type ReadinessPayload = {
  status: "ready" | "limited" | "blocked";
  reasons: Array<{ code: string; message: string }>;
  compliance_flags: Array<{ code: string; severity: "warn" | "block"; message: string }>;
};

type AssessmentFixture = {
  assessmentId: string;
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  score: number;
  companyName: string;
  jobTitle: string;
  summary: string;
  scoreConfidence: "high" | "medium" | "low";
  scorePresentationMode: "normal" | "caution" | "fix_first";
  verificationCoverage: {
    totalClaims: number;
    verifiedClaims: number;
    inferredClaims: number;
    unverifiedClaims: number;
    unverifiedRequirements: string[];
    verifiedRequirements: string[];
    supportedRequirements: string[];
  };
  scoringVersion: string;
  resumeReadiness: ReadinessPayload;
  coverReadiness: ReadinessPayload;
  missingBaselineEvidenceIssue: boolean;
  archivedBaselineId?: string | null;
  scoring_v2?: {
    score?: number | null;
    debug?: {
      toolingCoverage?: {
        claims?: unknown;
      };
    };
  };
  verification_coverage?: {
    totalClaims?: number | null;
    verifiedClaims?: number | null;
    inferredClaims?: number | null;
    unverifiedClaims?: number | null;
    verifiedRequirements?: string[] | null;
    inferredRequirements?: string[] | null;
    supportedRequirements?: string[] | null;
    unverifiedRequirements?: string[] | null;
  };
};

type StageExpectation = {
  readinessText: string;
  scoreText: string;
  ctaLabel: string;
  ctaHref: string | null;
  actionType: string;
  analyticsEvent: string;
  analyticsPayload: Record<string, unknown>;
  ctaKind?: "link" | "button";
};

type SyntheticJourneyScenario = {
  name: string;
  baselineStage: {
    baselineId: string;
    expected: StageExpectation;
    uploadFileName?: string;
    assertBaselineSection?: boolean;
  };
  targetStage: {
    baselineId: string;
    jobId: string;
    expected: StageExpectation;
  };
  resultsStage: {
    assessmentId?: string;
    baselineId: string;
    jobId: string;
    expected: StageExpectation;
    loadMode: "assessment" | "pair";
    freshAssessmentId?: string;
    shouldRecompute?: boolean;
  };
  studioStage?: {
    assessmentId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    expected: StageExpectation;
  };
  baselines: BaselineDto[];
  studioBaselines: Array<Pick<BaselineDto, "id" | "originalFilename" | "version">>;
  jobs: JobDto[];
  targetAssessment: AssessmentFixture;
  resultsAssessment: AssessmentFixture;
  studioAssessment: AssessmentFixture;
  uploadAssessment?: AssessmentFixture;
  persistedAssessment?: AssessmentFixture;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createBaseline(input: {
  id: string;
  createdAt: string;
  status?: "ACTIVE" | "ARCHIVED";
  archivedAt?: string | null;
  originalFilename?: string;
  latestAssessmentId?: string | null;
  latestAssessmentCreatedAt?: string | null;
  latestFitScore?: number | null;
}): BaselineDto {
  const latestAssessmentSummary =
    input.latestAssessmentId || typeof input.latestFitScore === "number"
      ? {
          latestAssessmentId: input.latestAssessmentId ?? null,
          latestAssessmentCreatedAt: input.latestAssessmentCreatedAt ?? input.createdAt,
          latestFitScore: input.latestFitScore ?? null,
          hasCompletedAssessment: Boolean(input.latestAssessmentId),
        }
      : null;

  return {
    id: input.id,
    userId: "user-1",
    version: 1,
    versionNumber: 1,
    isActive: input.status !== "ARCHIVED",
    originalFilename: input.originalFilename ?? `${input.id}.pdf`,
    mimeType: "application/pdf",
    storagePath: `/tmp/${input.id}`,
    hash: null,
    status: input.status ?? "ACTIVE",
    archivedAt: input.archivedAt ?? null,
    latestAssessmentSummary,
    sections: [
      {
        id: `${input.id}-section-1`,
        baselineId: input.id,
        sectionType: "EXPERIENCE",
        title: "Experience",
        content: "Led support operations, escalations, and cross-functional execution.",
        includePolicy: "always",
        order: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      {
        id: `${input.id}-section-2`,
        baselineId: input.id,
        sectionType: "SUMMARY",
        title: "Summary",
        content: "Customer operations leadership with strong evidence coverage.",
        includePolicy: "always",
        order: 1,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    ],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function buildReadinessPayload(
  status: ReadinessPayload["status"],
  options?: {
    missingBaselineEvidence?: boolean;
    note?: string;
  },
): ReadinessPayload {
  const message =
    options?.note ??
    (status === "blocked"
      ? "Generation is blocked until stronger evidence is available."
      : status === "limited"
        ? "Generation is usable, but evidence is still partial."
        : "Generation is ready.");

  return {
    status,
    reasons:
      status === "ready"
        ? []
        : [{ code: status === "blocked" ? "full_block" : "personalization_limitation", message }],
    compliance_flags: options?.missingBaselineEvidence
      ? [
          {
            code: "missing_baseline_evidence",
            severity: status === "blocked" ? "block" : "warn",
            message: "Missing verified evidence for generation.",
          },
        ]
      : [],
  };
}

function buildAnalyticsPayload(event: string, payload: Record<string, unknown>) {
  return { event, ...payload };
}

function createStageAssessment(input: {
  assessmentId: string;
  baselineId: string;
  jobId: string;
  baselineVersionId: string;
  score: number;
  companyName: string;
  jobTitle: string;
  scoreConfidence?: "high" | "medium" | "low";
  scorePresentationMode?: "normal" | "caution" | "fix_first";
  readinessStatus?: "ready" | "limited" | "blocked";
  missingBaselineEvidence?: boolean;
  unverifiedRequirements?: string[];
  verifiedRequirements?: string[];
  supportedRequirements?: string[];
  inferredClaims?: number;
  verifiedClaims?: number;
  archivedBaselineId?: string | null;
}): AssessmentFixture {
  const scoreConfidence = input.scoreConfidence ?? (input.score >= 80 ? "high" : "medium");
  const scorePresentationMode = input.scorePresentationMode ?? (input.score < 70 ? "fix_first" : "normal");
  const readinessStatus = input.readinessStatus ?? (input.score < 70 ? "blocked" : "ready");
  const unverifiedRequirements = input.unverifiedRequirements ?? [];

  return {
    assessmentId: input.assessmentId,
    baselineId: input.baselineId,
    baselineVersionId: input.baselineVersionId,
    jobId: input.jobId,
    score: input.score,
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    summary: `${input.jobTitle} fit summary for ${input.companyName}.`,
    scoreConfidence,
    scorePresentationMode,
    verificationCoverage: {
      totalClaims: 3,
      verifiedClaims: input.verifiedClaims ?? Math.max(0, 3 - unverifiedRequirements.length),
      inferredClaims: input.inferredClaims ?? 0,
      unverifiedClaims: unverifiedRequirements.length,
      unverifiedRequirements,
      verifiedRequirements: input.verifiedRequirements ?? ["Leadership", "Operations"],
      supportedRequirements: input.supportedRequirements ?? ["Leadership", "Operations"],
    },
    scoringVersion: "scoring_contract_v1",
    resumeReadiness: buildReadinessPayload(readinessStatus, {
      missingBaselineEvidence: Boolean(input.missingBaselineEvidence),
    }),
    coverReadiness: buildReadinessPayload(readinessStatus, {
      missingBaselineEvidence: Boolean(input.missingBaselineEvidence),
    }),
    missingBaselineEvidenceIssue: Boolean(input.missingBaselineEvidence),
    archivedBaselineId: input.archivedBaselineId ?? null,
    scoring_v2: {
      score: input.score,
      debug: {
        toolingCoverage: {
          claims: {
            verifiedClaims: input.verifiedClaims ?? Math.max(0, 3 - unverifiedRequirements.length),
            inferredClaims: input.inferredClaims ?? 0,
            unverifiedClaims: unverifiedRequirements.length,
          },
        },
      },
    },
    verification_coverage: {
      totalClaims: 3,
      verifiedClaims: input.verifiedClaims ?? Math.max(0, 3 - unverifiedRequirements.length),
      inferredClaims: input.inferredClaims ?? 0,
      unverifiedClaims: unverifiedRequirements.length,
      verifiedRequirements: input.verifiedRequirements ?? ["Leadership", "Operations"],
      inferredRequirements: [],
      supportedRequirements: input.supportedRequirements ?? ["Leadership", "Operations"],
      unverifiedRequirements,
    },
  };
}

function buildStageExpectation(input: StageExpectation): StageExpectation {
  return input;
}

function createScenarioBackend(scenario: SyntheticJourneyScenario) {
  const state = {
    baselines: [...scenario.baselines],
    assessmentsById: new Map<string, AssessmentFixture>([
      [scenario.targetAssessment.assessmentId, scenario.targetAssessment],
      [scenario.resultsAssessment.assessmentId, scenario.resultsAssessment],
      [scenario.studioAssessment.assessmentId, scenario.studioAssessment],
      ...(scenario.persistedAssessment
        ? [[scenario.persistedAssessment.assessmentId, scenario.persistedAssessment] as const]
        : []),
      ...(scenario.uploadAssessment
        ? [[scenario.uploadAssessment.assessmentId, scenario.uploadAssessment] as const]
        : []),
    ]),
    analysisRunCalls: 0,
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const parsed = new URL(String(input), "http://localhost:3000");
    const { pathname } = parsed;
    const method = (init?.method ?? "GET").toUpperCase();

    if (pathname === "/api/analysis/history" && method === "GET") {
      return jsonResponse([]);
    }

    if (pathname === "/api/baselines" && method === "GET") {
      return jsonResponse(state.baselines);
    }

    if (pathname === "/api/baselines" && method === "POST") {
      const uploadedAssessment = scenario.uploadAssessment ?? scenario.targetAssessment;
      const uploadedBaseline = createBaseline({
        id: uploadedAssessment.baselineId,
        createdAt: "2026-04-08T23:57:52.649Z",
        originalFilename: scenario.baselineStage.uploadFileName ?? `${uploadedAssessment.baselineId}.pdf`,
        latestAssessmentId: null,
        latestAssessmentCreatedAt: null,
        latestFitScore: null,
      });
      state.baselines = [uploadedBaseline, ...state.baselines.filter((baseline) => baseline.id !== uploadedBaseline.id)];
      return jsonResponse(uploadedBaseline);
    }

    if (pathname.startsWith("/api/baselines/") && pathname.endsWith("/analyze") && method === "POST") {
      const baselineId = pathname.split("/")[3];
      const nextAssessment = scenario.uploadAssessment ?? scenario.targetAssessment;
      const nextBaseline = createBaseline({
        id: baselineId,
        createdAt: "2026-04-08T23:57:52.649Z",
        originalFilename: scenario.baselineStage.uploadFileName ?? `${baselineId}.pdf`,
        latestAssessmentId: nextAssessment.assessmentId,
        latestAssessmentCreatedAt: "2026-04-08T23:57:52.649Z",
        latestFitScore: nextAssessment.score,
      });
      state.baselines = state.baselines.map((baseline) => (baseline.id === baselineId ? nextBaseline : baseline));
      return jsonResponse(nextBaseline);
    }

    if (pathname.startsWith("/api/baselines/") && pathname.endsWith("/archive") && method === "PATCH") {
      const baselineId = pathname.split("/")[3];
      state.baselines = state.baselines.map((baseline) =>
        baseline.id === baselineId
          ? {
              ...baseline,
              status: "ARCHIVED",
              isActive: false,
              archivedAt: "2026-04-08T23:57:52.649Z",
            }
          : baseline,
      );
      return jsonResponse(state.baselines.find((baseline) => baseline.id === baselineId) ?? {}, 200);
    }

    if (pathname.startsWith("/api/baselines/") && pathname.endsWith("/versions") && method === "GET") {
      const baselineId = pathname.split("/")[3];
      return jsonResponse([{ id: `${baselineId}-v1`, versionNumber: 1, fileHash: `${baselineId}-hash` }]);
    }

    if (pathname.startsWith("/api/baselines/") && method === "GET") {
      const baselineId = pathname.split("/")[3];
      const baseline = state.baselines.find((item) => item.id === baselineId);
      if (!baseline) return jsonResponse({ error: "Baseline not found" }, 404);
      return jsonResponse(baseline);
    }

    if (pathname === "/api/jobs" && method === "GET") {
      return jsonResponse(scenario.jobs);
    }

    if (pathname === "/api/analysis/fit-assessments" && method === "GET") {
      const baselineId = parsed.searchParams.get("baselineId");
      const assessment =
        scenario.persistedAssessment && baselineId === scenario.persistedAssessment.baselineId
          ? scenario.persistedAssessment
          : scenario.targetAssessment;
      return jsonResponse([createStageAssessment(assessment)]);
    }

    if (pathname.startsWith("/api/analysis/fit-assessments/") && method === "GET") {
      const assessmentId = pathname.split("/")[4];
      const assessment = state.assessmentsById.get(assessmentId);
      if (!assessment) return jsonResponse({ error: "Assessment not found" }, 404);
      return jsonResponse(createStageAssessment(assessment));
    }

    if (pathname.startsWith("/api/analysis/job/") && pathname.endsWith("/latest") && method === "GET") {
      if (scenario.resultsStage.shouldRecompute) {
        return jsonResponse({ error: "stale persisted assessment" }, 404);
      }
      const segments = pathname.split("/");
      const jobId = segments[4];
      const baselineId = segments[6];
      const assessment = scenario.resultsAssessment;
      if (assessment.jobId !== jobId || assessment.baselineId !== baselineId) {
        return jsonResponse({ error: "Assessment not found" }, 404);
      }
      return jsonResponse(createStageAssessment(assessment));
    }

    if (pathname === "/api/analysis/run" && method === "POST") {
      state.analysisRunCalls += 1;
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        baselineId?: string;
        jobId?: string;
      };
      const baselineId = body.baselineId ?? scenario.targetAssessment.baselineId;
      const jobId = body.jobId ?? scenario.targetAssessment.jobId;
      const nextAssessment =
        scenario.resultsStage.shouldRecompute && scenario.resultsStage.freshAssessmentId
          ? state.assessmentsById.get(scenario.resultsStage.freshAssessmentId) ?? scenario.resultsAssessment
          : scenario.targetAssessment;
      const assessment = {
        ...nextAssessment,
        baselineId,
        jobId,
      };
      state.assessmentsById.set(assessment.assessmentId, assessment);
      return jsonResponse(createStageAssessment(assessment));
    }

    if (pathname === "/api/resume/readiness" && method === "GET") {
      return jsonResponse(scenario.studioAssessment.resumeReadiness);
    }

    if (pathname === "/api/cover-letters/readiness" && method === "GET") {
      return jsonResponse(scenario.studioAssessment.coverReadiness);
    }

    if (pathname === "/api/users/me/last-assessment" && method === "GET") {
      return jsonResponse(null);
    }

    return jsonResponse({});
  });

  return { fetchMock, state };
}

function renderStudioShell() {
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

function expectAnalyticsEvent(eventName: string, expectedPayload: Record<string, unknown>) {
  const call = trackEventMock.mock.calls.find(([name]) => name === eventName);
  expect(call, `Expected analytics event ${eventName}`).toBeTruthy();
  const payload =
    expectedPayload && typeof expectedPayload === "object" && "event" in expectedPayload
      ? (({ event: _event, ...rest }) => rest)(expectedPayload as Record<string, unknown>)
      : expectedPayload;
  expect(call?.[1]).toEqual(expect.objectContaining(payload));
}

function expectTextLink(label: string, href: string) {
  const link = screen.getByRole("link", { name: label });
  expect(link).toHaveAttribute("href", href);
  return link;
}

function getActiveBaselineSection() {
  const heading = screen.getByRole("heading", { name: "Your baseline" });
  const section = heading.closest("section");
  expect(section).toBeTruthy();
  return within(section as HTMLElement);
}

function toSafeRegex(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

async function renderTargetStage(scenario: SyntheticJourneyScenario) {
  overrideSearchParams({
    baselineId: scenario.targetStage.baselineId,
    jobId: scenario.targetStage.jobId,
  });
  const element = await TargetPage({
    searchParams: {
      baselineId: scenario.targetStage.baselineId,
      jobId: scenario.targetStage.jobId,
    },
  });
  render(element);
}

function renderResultsStageWithAssessmentId(assessmentId: string) {
  overrideSearchParams({
    assessmentId,
    analysisId: assessmentId,
  });
  render(<ResultsPage />);
}

function renderResultsStageWithPair(jobId: string, baselineId: string) {
  overrideSearchParams({ jobId, baselineId });
  render(<ResultsPage />);
}

async function renderStudioStage(searchParams: Record<string, string>) {
  overrideSearchParams(searchParams);
  renderStudioShell();
}

const scenarios: SyntheticJourneyScenario[] = [
  {
    name: "new user happy path",
    baselineStage: {
      baselineId: "base-new-1",
      uploadFileName: "jane-resume.pdf",
      assertBaselineSection: false,
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 86%",
        ctaLabel: "Upload Another Resume",
        ctaHref: null,
        ctaKind: "button",
        actionType: "upload_resume",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-new-1",
          readinessState: "NOT_ANALYZED",
          latestAssessmentId: null,
          latestFitScore: null,
          dataSource: "fresh",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-new-1",
      jobId: "job-new-1",
      expected: buildStageExpectation({
        readinessText: "Generation Ready",
        scoreText: "86",
        ctaLabel: "Open Studio",
        ctaHref: "/studio?analysisId=assessment-new-1&jobId=job-new-1&baselineId=base-new-1&baselineVersionId=base-new-1-v1",
        actionType: "open_studio_generate",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "READY",
          score: 86,
          label: "Open Studio",
          href: "/studio?analysisId=assessment-new-1&jobId=job-new-1&baselineId=base-new-1&baselineVersionId=base-new-1-v1",
          actionType: "open_studio_generate",
        }),
      }),
    },
    resultsStage: {
      assessmentId: "assessment-new-1",
      baselineId: "base-new-1",
      jobId: "job-new-1",
      loadMode: "assessment",
      expected: buildStageExpectation({
        readinessText: "Competitive fit. Not ready to generate yet.",
        scoreText: "86",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-new-1&analysisId=assessment-new-1&assessmentId=assessment-new-1&baselineId=base-new-1&baselineVersionId=base-new-1-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "MID",
          readinessStatus: "blocked",
        }),
      }),
    },
    studioStage: {
      assessmentId: "assessment-new-1",
      baselineId: "base-new-1",
      jobId: "job-new-1",
      baselineVersionId: "base-new-1-v1",
      expected: buildStageExpectation({
        readinessText: "Ready to generate",
        scoreText: "Fit score 86",
        ctaLabel: "Add to Opportunities",
        ctaHref: "/job-tracker",
        actionType: "studio_with_save",
        analyticsEvent: "studio_generation_state_viewed",
        analyticsPayload: buildAnalyticsPayload("studio_generation_state_viewed", {
          state: "READY",
          score: 86,
          blockerCount: 0,
        }),
      }),
    },
    baselines: [],
    studioBaselines: [{ id: "base-new-1", originalFilename: "jane-resume.pdf", version: 1 }],
    jobs: [
      { id: "job-new-1", company: "Acme", title: "Director of Support", archivedAt: null, isArchived: false },
    ],
    uploadAssessment: createStageAssessment({
      assessmentId: "assessment-new-1",
      baselineId: "base-new-1",
      jobId: "job-new-1",
      baselineVersionId: "base-new-1-v1",
      score: 86,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "ready",
    }),
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-new-1",
      baselineId: "base-new-1",
      jobId: "job-new-1",
      baselineVersionId: "base-new-1-v1",
      score: 86,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "ready",
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-new-1",
      baselineId: "base-new-1",
      jobId: "job-new-1",
      baselineVersionId: "base-new-1-v1",
      score: 86,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "ready",
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-new-1",
      baselineId: "base-new-1",
      jobId: "job-new-1",
      baselineVersionId: "base-new-1-v1",
      score: 86,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "ready",
    }),
  },
  {
    name: "returning user",
    baselineStage: {
      baselineId: "base-return-1",
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 82%",
        ctaLabel: "Target a role",
        ctaHref: "/target?baselineId=base-return-1",
        actionType: "target_role",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-return-1",
          readinessState: "READY",
          latestAssessmentId: "assessment-return-1",
          latestFitScore: 82,
          dataSource: "persisted",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-return-1",
      jobId: "job-return-1",
      expected: buildStageExpectation({
        readinessText: "Generation Ready",
        scoreText: "82",
        ctaLabel: "Open Studio",
        ctaHref: "/studio?analysisId=assessment-return-1&jobId=job-return-1&baselineId=base-return-1&baselineVersionId=base-return-1-v1",
        actionType: "open_studio_generate",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "READY",
          score: 82,
          label: "Open Studio",
          href: "/studio?analysisId=assessment-return-1&jobId=job-return-1&baselineId=base-return-1&baselineVersionId=base-return-1-v1",
          actionType: "open_studio_generate",
        }),
      }),
    },
    resultsStage: {
      assessmentId: "assessment-return-1",
      baselineId: "base-return-1",
      jobId: "job-return-1",
      loadMode: "assessment",
      expected: buildStageExpectation({
        readinessText: "Competitive fit. Not ready to generate yet.",
        scoreText: "82",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-return-1&analysisId=assessment-return-1&assessmentId=assessment-return-1&baselineId=base-return-1&baselineVersionId=base-return-1-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "MID",
          readinessStatus: "blocked",
        }),
      }),
    },
    studioStage: {
      assessmentId: "assessment-return-1",
      baselineId: "base-return-1",
      jobId: "job-return-1",
      baselineVersionId: "base-return-1-v1",
      expected: buildStageExpectation({
        readinessText: "Ready to generate",
        scoreText: "Fit score 82",
        ctaLabel: "Review Results",
        ctaHref: "/results?jobId=job-return-1&analysisId=assessment-return-1&baselineId=base-return-1",
        actionType: "studio",
        analyticsEvent: "studio_generation_state_viewed",
        analyticsPayload: buildAnalyticsPayload("studio_generation_state_viewed", {
          state: "READY",
          score: 82,
          blockerCount: 0,
        }),
      }),
    },
    baselines: [
      createBaseline({
        id: "base-return-1",
        createdAt: "2026-04-01T12:00:00.000Z",
        latestAssessmentId: "assessment-return-1",
        latestAssessmentCreatedAt: "2026-04-08T23:57:52.649Z",
        latestFitScore: 82,
      }),
    ],
    studioBaselines: [{ id: "base-return-1", originalFilename: "returning-resume.pdf", version: 1 }],
    jobs: [{ id: "job-return-1", company: "Acme", title: "Head of Customer Operations", archivedAt: null, isArchived: false }],
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-return-1",
      baselineId: "base-return-1",
      jobId: "job-return-1",
      baselineVersionId: "base-return-1-v1",
      score: 82,
      companyName: "Acme",
      jobTitle: "Head of Customer Operations",
      readinessStatus: "ready",
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-return-1",
      baselineId: "base-return-1",
      jobId: "job-return-1",
      baselineVersionId: "base-return-1-v1",
      score: 82,
      companyName: "Acme",
      jobTitle: "Head of Customer Operations",
      readinessStatus: "ready",
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-return-1",
      baselineId: "base-return-1",
      jobId: "job-return-1",
      baselineVersionId: "base-return-1-v1",
      score: 82,
      companyName: "Acme",
      jobTitle: "Head of Customer Operations",
      readinessStatus: "ready",
    }),
  },
  {
    name: "low score path",
    baselineStage: {
      baselineId: "base-low-1",
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 54%",
        ctaLabel: "Target a role",
        ctaHref: "/target?baselineId=base-low-1",
        actionType: "target_role",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-low-1",
          readinessState: "READY",
          latestAssessmentId: "assessment-low-1",
          latestFitScore: 54,
          dataSource: "persisted",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-low-1",
      jobId: "job-low-1",
      expected: buildStageExpectation({
        readinessText: "Fit Review Needed",
        scoreText: "54",
        ctaLabel: "Start Fit Review",
        ctaHref: "/resolve-gaps?jobId=job-low-1&baselineId=base-low-1&analysisId=assessment-low-1&baselineVersionId=base-low-1-v1",
        actionType: "resolve_gaps",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "BLOCKED",
          score: 54,
          label: "Start Fit Review",
          href: "/resolve-gaps?jobId=job-low-1&baselineId=base-low-1&analysisId=assessment-low-1&baselineVersionId=base-low-1-v1",
          actionType: "resolve_gaps",
        }),
      }),
    },
    resultsStage: {
      assessmentId: "assessment-low-1",
      baselineId: "base-low-1",
      jobId: "job-low-1",
      loadMode: "assessment",
      expected: buildStageExpectation({
        readinessText: "We may be underestimating your fit.",
        // Results shows the low-confidence warning copy before the verdict card.
        // The canonical blocked headline is the warning banner rather than the old placeholder string.
        scoreText: "54",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-low-1&analysisId=assessment-low-1&assessmentId=assessment-low-1&baselineId=base-low-1&baselineVersionId=base-low-1-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "LOW",
          readinessStatus: "blocked",
        }),
      }),
    },
    baselines: [
      createBaseline({
        id: "base-low-1",
        createdAt: "2026-04-01T12:00:00.000Z",
        latestAssessmentId: "assessment-low-1",
        latestAssessmentCreatedAt: "2026-04-08T23:57:52.649Z",
        latestFitScore: 54,
      }),
    ],
    studioBaselines: [{ id: "base-low-1", originalFilename: "low-score-resume.pdf", version: 1 }],
    jobs: [{ id: "job-low-1", company: "Acme", title: "CX Strategy Lead", archivedAt: null, isArchived: false }],
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-low-1",
      baselineId: "base-low-1",
      jobId: "job-low-1",
      baselineVersionId: "base-low-1-v1",
      score: 54,
      companyName: "Acme",
      jobTitle: "CX Strategy Lead",
      readinessStatus: "blocked",
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-low-1",
      baselineId: "base-low-1",
      jobId: "job-low-1",
      baselineVersionId: "base-low-1-v1",
      score: 54,
      companyName: "Acme",
      jobTitle: "CX Strategy Lead",
      readinessStatus: "blocked",
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-low-1",
      baselineId: "base-low-1",
      jobId: "job-low-1",
      baselineVersionId: "base-low-1-v1",
      score: 54,
      companyName: "Acme",
      jobTitle: "CX Strategy Lead",
      readinessStatus: "blocked",
    }),
  },
  {
    name: "high score but trust-gated",
    baselineStage: {
      baselineId: "base-trust-1",
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 84%",
        ctaLabel: "Target a role",
        ctaHref: "/target?baselineId=base-trust-1",
        actionType: "target_role",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-trust-1",
          readinessState: "READY",
          latestAssessmentId: "assessment-trust-1",
          latestFitScore: 84,
          dataSource: "persisted",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-trust-1",
      jobId: "job-trust-1",
      expected: buildStageExpectation({
        readinessText: "Generation Ready",
        scoreText: "84",
        ctaLabel: "Open Studio",
        ctaHref: "/studio?analysisId=assessment-trust-1&jobId=job-trust-1&baselineId=base-trust-1&baselineVersionId=base-trust-1-v1",
        actionType: "open_studio_generate",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "READY",
          score: 84,
          label: "Open Studio",
          href: "/studio?analysisId=assessment-trust-1&jobId=job-trust-1&baselineId=base-trust-1&baselineVersionId=base-trust-1-v1",
          actionType: "open_studio_generate",
        }),
      }),
    },
    resultsStage: {
      assessmentId: "assessment-trust-1",
      baselineId: "base-trust-1",
      jobId: "job-trust-1",
      loadMode: "assessment",
      expected: buildStageExpectation({
        readinessText: "Competitive fit. Not ready to generate yet.",
        scoreText: "84",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-trust-1&analysisId=assessment-trust-1&assessmentId=assessment-trust-1&baselineId=base-trust-1&baselineVersionId=base-trust-1-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "MID",
          readinessStatus: "blocked",
        }),
      }),
    },
    studioStage: {
      assessmentId: "assessment-trust-1",
      baselineId: "base-trust-1",
      jobId: "job-trust-1",
      baselineVersionId: "base-trust-1-v1",
      expected: buildStageExpectation({
        readinessText: "Ready to generate",
        scoreText: "Fit score 84",
        ctaLabel: "Review Results",
        ctaHref: "/results?jobId=job-trust-1&analysisId=assessment-trust-1&baselineId=base-trust-1",
        actionType: "studio",
        analyticsEvent: "studio_generation_state_viewed",
        analyticsPayload: buildAnalyticsPayload("studio_generation_state_viewed", {
          state: "READY",
          score: 84,
          blockerCount: 0,
        }),
      }),
    },
    baselines: [
      createBaseline({
        id: "base-trust-1",
        createdAt: "2026-04-01T12:00:00.000Z",
        latestAssessmentId: "assessment-trust-1",
        latestAssessmentCreatedAt: "2026-04-08T23:57:52.649Z",
        latestFitScore: 84,
      }),
    ],
    studioBaselines: [{ id: "base-trust-1", originalFilename: "trust-gated.pdf", version: 1 }],
    jobs: [{ id: "job-trust-1", company: "Acme", title: "Director of Support", archivedAt: null, isArchived: false }],
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-trust-1",
      baselineId: "base-trust-1",
      jobId: "job-trust-1",
      baselineVersionId: "base-trust-1-v1",
      score: 84,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "limited",
      missingBaselineEvidence: true,
      unverifiedRequirements: ["missing verified evidence"],
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-trust-1",
      baselineId: "base-trust-1",
      jobId: "job-trust-1",
      baselineVersionId: "base-trust-1-v1",
      score: 84,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "limited",
      missingBaselineEvidence: true,
      unverifiedRequirements: ["missing verified evidence"],
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-trust-1",
      baselineId: "base-trust-1",
      jobId: "job-trust-1",
      baselineVersionId: "base-trust-1-v1",
      score: 84,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "limited",
      missingBaselineEvidence: true,
      unverifiedRequirements: ["missing verified evidence"],
    }),
  },
  {
    name: "stale persisted result recomputes",
    baselineStage: {
      baselineId: "base-stale-1",
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 75%",
        ctaLabel: "Target a role",
        ctaHref: "/target?baselineId=base-stale-1",
        actionType: "target_role",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-stale-1",
          readinessState: "READY",
          latestAssessmentId: "assessment-stale-persisted",
          latestFitScore: 75,
          dataSource: "persisted",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-stale-1",
      jobId: "job-stale-1",
      expected: buildStageExpectation({
        readinessText: "Generation Ready",
        scoreText: "81",
        ctaLabel: "Open Studio",
        ctaHref: "/studio?analysisId=assessment-stale-fresh&jobId=job-stale-1&baselineId=base-stale-1&baselineVersionId=base-stale-1-v1",
        actionType: "open_studio_generate",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "READY",
          score: 81,
          label: "Open Studio",
          href: "/studio?analysisId=assessment-stale-fresh&jobId=job-stale-1&baselineId=base-stale-1&baselineVersionId=base-stale-1-v1",
          actionType: "open_studio_generate",
        }),
      }),
    },
    resultsStage: {
      baselineId: "base-stale-1",
      jobId: "job-stale-1",
      loadMode: "pair",
      freshAssessmentId: "assessment-stale-fresh",
      shouldRecompute: true,
      expected: buildStageExpectation({
        readinessText: "Competitive fit. Not ready to generate yet.",
        scoreText: "81",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-stale-1&analysisId=assessment-stale-fresh&assessmentId=assessment-stale-fresh&baselineId=base-stale-1&baselineVersionId=base-stale-1-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "MID",
          readinessStatus: "blocked",
        }),
      }),
    },
    studioStage: {
      assessmentId: "assessment-stale-fresh",
      baselineId: "base-stale-1",
      jobId: "job-stale-1",
      baselineVersionId: "base-stale-1-v1",
      expected: buildStageExpectation({
        readinessText: "Ready to generate",
        scoreText: "Fit score 81",
        ctaLabel: "Review Results",
        ctaHref: "/results?jobId=job-stale-1&analysisId=assessment-stale-fresh&baselineId=base-stale-1",
        actionType: "studio",
        analyticsEvent: "studio_generation_state_viewed",
        analyticsPayload: buildAnalyticsPayload("studio_generation_state_viewed", {
          state: "READY",
          score: 81,
          blockerCount: 0,
        }),
      }),
    },
    baselines: [
      createBaseline({
        id: "base-stale-1",
        createdAt: "2026-04-01T12:00:00.000Z",
        latestAssessmentId: "assessment-stale-persisted",
        latestAssessmentCreatedAt: "2026-04-01T12:00:00.000Z",
        latestFitScore: 75,
      }),
    ],
    studioBaselines: [{ id: "base-stale-1", originalFilename: "stale.pdf", version: 1 }],
    jobs: [{ id: "job-stale-1", company: "Acme", title: "Senior Support Ops Manager", archivedAt: null, isArchived: false }],
    persistedAssessment: createStageAssessment({
      assessmentId: "assessment-stale-persisted",
      baselineId: "base-stale-1",
      jobId: "job-stale-1",
      baselineVersionId: "base-stale-1-v0",
      score: 75,
      companyName: "Acme",
      jobTitle: "Senior Support Ops Manager",
      readinessStatus: "ready",
    }),
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-stale-fresh",
      baselineId: "base-stale-1",
      jobId: "job-stale-1",
      baselineVersionId: "base-stale-1-v1",
      score: 81,
      companyName: "Acme",
      jobTitle: "Senior Support Ops Manager",
      readinessStatus: "ready",
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-stale-fresh",
      baselineId: "base-stale-1",
      jobId: "job-stale-1",
      baselineVersionId: "base-stale-1-v1",
      score: 81,
      companyName: "Acme",
      jobTitle: "Senior Support Ops Manager",
      readinessStatus: "ready",
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-stale-fresh",
      baselineId: "base-stale-1",
      jobId: "job-stale-1",
      baselineVersionId: "base-stale-1-v1",
      score: 81,
      companyName: "Acme",
      jobTitle: "Senior Support Ops Manager",
      readinessStatus: "ready",
    }),
  },
  {
    name: "archived baseline never selected",
    baselineStage: {
      baselineId: "base-archived-active-1",
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 83%",
        ctaLabel: "Target a role",
        ctaHref: "/target?baselineId=base-archived-active-1",
        actionType: "target_role",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-archived-active-1",
          readinessState: "READY",
          latestAssessmentId: "assessment-archived-active-1",
          latestFitScore: 83,
          dataSource: "persisted",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-archived-active-1",
      jobId: "job-archived-1",
      expected: buildStageExpectation({
        readinessText: "Generation Ready",
        scoreText: "83",
        ctaLabel: "Open Studio",
        ctaHref: "/studio?analysisId=assessment-archived-active-1&jobId=job-archived-1&baselineId=base-archived-active-1&baselineVersionId=base-archived-active-1-v1",
        actionType: "open_studio_generate",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "READY",
          score: 83,
          label: "Open Studio",
          href: "/studio?analysisId=assessment-archived-active-1&jobId=job-archived-1&baselineId=base-archived-active-1&baselineVersionId=base-archived-active-1-v1",
          actionType: "open_studio_generate",
        }),
      }),
    },
    resultsStage: {
      assessmentId: "assessment-archived-active-1",
      baselineId: "base-archived-active-1",
      jobId: "job-archived-1",
      loadMode: "assessment",
      expected: buildStageExpectation({
        readinessText: "Competitive fit. Not ready to generate yet.",
        scoreText: "83",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-archived-1&analysisId=assessment-archived-active-1&assessmentId=assessment-archived-active-1&baselineId=base-archived-active-1&baselineVersionId=base-archived-active-1-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "MID",
          readinessStatus: "blocked",
        }),
      }),
    },
    studioStage: {
      assessmentId: "assessment-archived-active-1",
      baselineId: "base-archived-active-1",
      jobId: "job-archived-1",
      baselineVersionId: "base-archived-active-1-v1",
      expected: buildStageExpectation({
        readinessText: "Ready to generate",
        scoreText: "Fit score 83",
        ctaLabel: "Review Results",
        ctaHref: "/results?jobId=job-archived-1&analysisId=assessment-archived-active-1&baselineId=base-archived-active-1",
        actionType: "studio",
        analyticsEvent: "studio_generation_state_viewed",
        analyticsPayload: buildAnalyticsPayload("studio_generation_state_viewed", {
          state: "READY",
          score: 83,
          blockerCount: 0,
        }),
      }),
    },
    baselines: [
      createBaseline({
        id: "base-archived-active-1",
        createdAt: "2026-04-03T12:00:00.000Z",
        latestAssessmentId: "assessment-archived-active-1",
        latestAssessmentCreatedAt: "2026-04-08T23:57:52.649Z",
        latestFitScore: 83,
      }),
      createBaseline({
        id: "base-archived-archived-1",
        createdAt: "2026-03-01T12:00:00.000Z",
        status: "ARCHIVED",
        archivedAt: "2026-04-01T12:00:00.000Z",
        latestAssessmentId: "assessment-archived-archived-1",
        latestAssessmentCreatedAt: "2026-03-10T12:00:00.000Z",
        latestFitScore: 61,
      }),
    ],
    studioBaselines: [
      { id: "base-archived-active-1", originalFilename: "active.pdf", version: 1 },
      { id: "base-archived-archived-1", originalFilename: "archived.pdf", version: 1 },
    ],
    jobs: [{ id: "job-archived-1", company: "Acme", title: "Support Ops Lead", archivedAt: null, isArchived: false }],
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-archived-active-1",
      baselineId: "base-archived-active-1",
      jobId: "job-archived-1",
      baselineVersionId: "base-archived-active-1-v1",
      score: 83,
      companyName: "Acme",
      jobTitle: "Support Ops Lead",
      readinessStatus: "ready",
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-archived-active-1",
      baselineId: "base-archived-active-1",
      jobId: "job-archived-1",
      baselineVersionId: "base-archived-active-1-v1",
      score: 83,
      companyName: "Acme",
      jobTitle: "Support Ops Lead",
      readinessStatus: "ready",
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-archived-active-1",
      baselineId: "base-archived-active-1",
      jobId: "job-archived-1",
      baselineVersionId: "base-archived-active-1-v1",
      score: 83,
      companyName: "Acme",
      jobTitle: "Support Ops Lead",
      readinessStatus: "ready",
    }),
  },
  {
    name: "multiple baselines stay consistent",
    baselineStage: {
      baselineId: "base-multi-2",
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 88%",
        ctaLabel: "Target a role",
        ctaHref: "/target?baselineId=base-multi-2",
        actionType: "target_role",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-multi-2",
          readinessState: "READY",
          latestAssessmentId: "assessment-multi-2",
          latestFitScore: 88,
          dataSource: "persisted",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-multi-2",
      jobId: "job-multi-1",
      expected: buildStageExpectation({
        readinessText: "Generation Ready",
        scoreText: "88",
        ctaLabel: "Open Studio",
        ctaHref: "/studio?analysisId=assessment-multi-2&jobId=job-multi-1&baselineId=base-multi-2&baselineVersionId=base-multi-2-v1",
        actionType: "open_studio_generate",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "READY",
          score: 88,
          label: "Open Studio",
          href: "/studio?analysisId=assessment-multi-2&jobId=job-multi-1&baselineId=base-multi-2&baselineVersionId=base-multi-2-v1",
          actionType: "open_studio_generate",
        }),
      }),
    },
    resultsStage: {
      assessmentId: "assessment-multi-2",
      baselineId: "base-multi-2",
      jobId: "job-multi-1",
      loadMode: "assessment",
      expected: buildStageExpectation({
        readinessText: "Competitive fit. Not ready to generate yet.",
        scoreText: "88",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-multi-1&analysisId=assessment-multi-2&assessmentId=assessment-multi-2&baselineId=base-multi-2&baselineVersionId=base-multi-2-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "MID",
          readinessStatus: "blocked",
        }),
      }),
    },
    studioStage: {
      assessmentId: "assessment-multi-2",
      baselineId: "base-multi-2",
      jobId: "job-multi-1",
      baselineVersionId: "base-multi-2-v1",
      expected: buildStageExpectation({
        readinessText: "Ready to generate",
        scoreText: "Fit score 88",
        ctaLabel: "Add to Opportunities",
        ctaHref: "/job-tracker",
        actionType: "studio_with_save",
        analyticsEvent: "studio_generation_state_viewed",
        analyticsPayload: buildAnalyticsPayload("studio_generation_state_viewed", {
          state: "READY",
          score: 88,
          blockerCount: 0,
        }),
      }),
    },
    baselines: [
      createBaseline({
        id: "base-multi-1",
        createdAt: "2026-04-01T12:00:00.000Z",
        latestAssessmentId: "assessment-multi-1",
        latestAssessmentCreatedAt: "2026-04-06T12:00:00.000Z",
        latestFitScore: 73,
      }),
      createBaseline({
        id: "base-multi-2",
        createdAt: "2026-04-03T12:00:00.000Z",
        latestAssessmentId: "assessment-multi-2",
        latestAssessmentCreatedAt: "2026-04-08T23:57:52.649Z",
        latestFitScore: 88,
      }),
    ],
    studioBaselines: [
      { id: "base-multi-1", originalFilename: "older.pdf", version: 1 },
      { id: "base-multi-2", originalFilename: "newest.pdf", version: 1 },
    ],
    jobs: [{ id: "job-multi-1", company: "Acme", title: "VP of Customer Ops", archivedAt: null, isArchived: false }],
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-multi-2",
      baselineId: "base-multi-2",
      jobId: "job-multi-1",
      baselineVersionId: "base-multi-2-v1",
      score: 88,
      companyName: "Acme",
      jobTitle: "VP of Customer Ops",
      readinessStatus: "ready",
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-multi-2",
      baselineId: "base-multi-2",
      jobId: "job-multi-1",
      baselineVersionId: "base-multi-2-v1",
      score: 88,
      companyName: "Acme",
      jobTitle: "VP of Customer Ops",
      readinessStatus: "ready",
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-multi-2",
      baselineId: "base-multi-2",
      jobId: "job-multi-1",
      baselineVersionId: "base-multi-2-v1",
      score: 88,
      companyName: "Acme",
      jobTitle: "VP of Customer Ops",
      readinessStatus: "ready",
    }),
  },
  {
    name: "James scenario",
    baselineStage: {
      baselineId: "base-james-1",
      expected: buildStageExpectation({
        readinessText: "Ready for targeting",
        scoreText: "Role fit score: 19%",
        ctaLabel: "Target a role",
        ctaHref: "/target?baselineId=base-james-1",
        actionType: "target_role",
        analyticsEvent: "baseline_readiness_viewed",
        analyticsPayload: buildAnalyticsPayload("baseline_readiness_viewed", {
          source: "baseline",
          baselineId: "base-james-1",
          readinessState: "READY",
          latestAssessmentId: "assessment-james-1",
          latestFitScore: 19,
          dataSource: "persisted",
        }),
      }),
    },
    targetStage: {
      baselineId: "base-james-1",
      jobId: "job-james-1",
      expected: buildStageExpectation({
        readinessText: "Fit Review Needed",
        scoreText: "19",
        ctaLabel: "Start Fit Review",
        ctaHref: "/resolve-gaps?jobId=job-james-1&baselineId=base-james-1&analysisId=assessment-james-1&baselineVersionId=base-james-1-v1",
        actionType: "resolve_gaps",
        analyticsEvent: "target_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("target_cta_clicked", {
          state: "BLOCKED",
          score: 19,
          label: "Start Fit Review",
          href: "/resolve-gaps?jobId=job-james-1&baselineId=base-james-1&analysisId=assessment-james-1&baselineVersionId=base-james-1-v1",
          actionType: "resolve_gaps",
        }),
      }),
    },
    resultsStage: {
      assessmentId: "assessment-james-1",
      baselineId: "base-james-1",
      jobId: "job-james-1",
      loadMode: "assessment",
      expected: buildStageExpectation({
        readinessText: "We may be underestimating your fit.",
        scoreText: "19",
        ctaLabel: "Start Fit Review",
        ctaHref: "/fit-review?jobId=job-james-1&analysisId=assessment-james-1&assessmentId=assessment-james-1&baselineId=base-james-1&baselineVersionId=base-james-1-v1",
        actionType: "fit_review",
        analyticsEvent: "results_primary_cta_clicked",
        analyticsPayload: buildAnalyticsPayload("results_primary_cta_clicked", {
          source: "results",
          intentState: "none",
          action: "verify_examples",
          scoreBucket: "LOW",
          readinessStatus: "blocked",
        }),
      }),
    },
    baselines: [
      createBaseline({
        id: "base-james-1",
        createdAt: "2026-04-01T12:00:00.000Z",
        latestAssessmentId: "assessment-james-1",
        latestAssessmentCreatedAt: "2026-04-08T23:57:52.649Z",
        latestFitScore: 19,
      }),
    ],
    studioBaselines: [{ id: "base-james-1", originalFilename: "james.pdf", version: 1 }],
    jobs: [{ id: "job-james-1", company: "Acme", title: "Director of Support", archivedAt: null, isArchived: false }],
    targetAssessment: createStageAssessment({
      assessmentId: "assessment-james-1",
      baselineId: "base-james-1",
      jobId: "job-james-1",
      baselineVersionId: "base-james-1-v1",
      score: 19,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "blocked",
    }),
    resultsAssessment: createStageAssessment({
      assessmentId: "assessment-james-1",
      baselineId: "base-james-1",
      jobId: "job-james-1",
      baselineVersionId: "base-james-1-v1",
      score: 19,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "blocked",
    }),
    studioAssessment: createStageAssessment({
      assessmentId: "assessment-james-1",
      baselineId: "base-james-1",
      jobId: "job-james-1",
      baselineVersionId: "base-james-1-v1",
      score: 19,
      companyName: "Acme",
      jobTitle: "Director of Support",
      readinessStatus: "blocked",
    }),
  },
];

describe("synthetic core-loop journeys", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    mockRouterReplace.mockClear();
    activeScenario = null;
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      activeScenario = scenario;
      const backend = createScenarioBackend(scenario);
      setFetchImplementation(backend.fetchMock as unknown as typeof fetch);

      if (scenario.baselineStage.uploadFileName) {
        const { container } = render(<BaselineStudioHome baselines={scenario.baselines} />);
        await screen.findByText("Upload your resume to get started");
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
        expect(fileInput).toBeTruthy();
        const uploadedFile = new File(["resume"], scenario.baselineStage.uploadFileName, {
          type: "application/pdf",
        });
        fireEvent.change(fileInput as HTMLInputElement, { target: { files: [uploadedFile] } });
        await waitFor(() => {
          const uploadSurface = screen.getByTestId("baseline-upload-surface");
          within(uploadSurface).getByRole("button", {
            name: /upload another resume/i,
          });
        });
        expect(screen.queryByRole("link", { name: /upload another resume/i })).toBeNull();
      } else {
        render(<BaselineStudioHome baselines={scenario.baselines} />);
        await waitFor(() => {
          const links = screen.getAllByRole("link", {
            name: new RegExp(scenario.baselineStage.expected.ctaLabel, "i"),
          });
          expect(links.some((link) => link.getAttribute("href") === scenario.baselineStage.expected.ctaHref)).toBe(true);
        });
      }

      let activeBaselineSection: ReturnType<typeof within> | null = null;
      if (scenario.baselineStage.assertBaselineSection !== false) {
        activeBaselineSection = getActiveBaselineSection();
        expect(activeBaselineSection.getByText(scenario.baselineStage.expected.readinessText)).toBeInTheDocument();
        expect(activeBaselineSection.getByText(toSafeRegex(scenario.baselineStage.expected.scoreText))).toBeInTheDocument();
      }
      if (scenario.baselineStage.assertBaselineSection !== false) {
        expectAnalyticsEvent(
          scenario.baselineStage.expected.analyticsEvent,
          scenario.baselineStage.expected.analyticsPayload,
        );
      }
      const baselineActionTypeByLabel: Record<string, string> = {
        "Target a role": "target_role",
        "View Latest Results": "view_results",
        "Upload Another Resume": "upload_resume",
      };
      expect(baselineActionTypeByLabel[scenario.baselineStage.expected.ctaLabel]).toBe(
        scenario.baselineStage.expected.actionType,
      );
      if (scenario.baselineStage.expected.ctaKind === "button") {
        const uploadSurface = screen.getByTestId("baseline-upload-surface");
        expect(
          within(uploadSurface).getByRole("button", {
            name: /upload another resume/i,
          }),
        ).toBeInTheDocument();
      } else {
        expect(activeBaselineSection).toBeTruthy();
        expect(
          activeBaselineSection!
            .getAllByRole("link", {
              name: new RegExp(scenario.baselineStage.expected.ctaLabel, "i"),
            })
            .some((link) => link.getAttribute("href") === scenario.baselineStage.expected.ctaHref),
        ).toBe(true);
      }

      cleanup();
      trackEventMock.mockClear();

      await renderTargetStage(scenario);
      fireEvent.click(screen.getByRole("button", { name: /run compatibility score/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: scenario.targetStage.expected.ctaLabel }),
        ).toHaveAttribute("href", scenario.targetStage.expected.ctaHref);
      });
      await screen.findByText(scenario.targetStage.expected.readinessText, {}, { timeout: 6000 });
      await screen.findByText(toSafeRegex(scenario.targetStage.expected.scoreText), {}, { timeout: 6000 });
      fireEvent.click(screen.getByRole("link", { name: scenario.targetStage.expected.ctaLabel }));
      expectAnalyticsEvent(
        scenario.targetStage.expected.analyticsEvent,
        scenario.targetStage.expected.analyticsPayload,
      );

      cleanup();
      trackEventMock.mockClear();

      if (scenario.resultsStage.loadMode === "assessment") {
        renderResultsStageWithAssessmentId(
          scenario.resultsStage.assessmentId ?? scenario.resultsAssessment.assessmentId,
        );
      } else {
        renderResultsStageWithPair(scenario.resultsStage.jobId, scenario.resultsStage.baselineId);
        await waitFor(() => {
          expect(mockRouterReplace).toHaveBeenCalled();
        });
        const replacement = mockRouterReplace.mock.calls.at(-1)?.[0] as string | undefined;
        expect(replacement).toContain(`assessmentId=${scenario.resultsStage.freshAssessmentId}`);
        expect(replacement).toContain(`analysisId=${scenario.resultsStage.freshAssessmentId}`);
        if (scenario.resultsStage.freshAssessmentId) {
          cleanup();
          renderResultsStageWithAssessmentId(scenario.resultsStage.freshAssessmentId);
        }
      }

      await waitFor(() => {
        expect(screen.getByTestId("results-score-verdict-card")).toBeInTheDocument();
      });
      expect(
        screen.getAllByText(scenario.resultsStage.expected.readinessText).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(toSafeRegex(scenario.resultsStage.expected.scoreText)).length,
      ).toBeGreaterThan(0);
      const resultsCta = screen.getByTestId("results-hero-primary-cta");
      expect(resultsCta).toHaveAttribute("href", scenario.resultsStage.expected.ctaHref);
      expect(resultsCta).toHaveTextContent(scenario.resultsStage.expected.ctaLabel);
      fireEvent.click(resultsCta);
      expectAnalyticsEvent(
        scenario.resultsStage.expected.analyticsEvent,
        scenario.resultsStage.expected.analyticsPayload,
      );

      cleanup();
      trackEventMock.mockClear();

      if (scenario.studioStage) {
        activeScenario = scenario;
        await renderStudioStage({
          analysisId: scenario.studioStage.assessmentId,
          assessmentId: scenario.studioStage.assessmentId,
          jobId: scenario.studioStage.jobId,
          baselineId: scenario.studioStage.baselineId,
          baselineVersionId: scenario.studioStage.baselineVersionId,
        });

        await waitFor(() => {
          expect(screen.getByText(scenario.studioStage!.expected.readinessText)).toBeInTheDocument();
        });
        expect(screen.getAllByText(toSafeRegex(scenario.studioStage.expected.scoreText)).length).toBeGreaterThan(0);
        const studioLink = screen.getByRole("link", { name: scenario.studioStage.expected.ctaLabel });
        expect(studioLink).toHaveAttribute("href", scenario.studioStage.expected.ctaHref);
        const studioActionTypeByLabel: Record<string, string> = {
          "Add to Opportunities": "studio_with_save",
          "Review Results": "studio",
          "Start Fit Review": "fit_review",
        };
        expect(studioActionTypeByLabel[scenario.studioStage.expected.ctaLabel]).toBe(
          scenario.studioStage.expected.actionType,
        );
        await waitFor(() => {
          expectAnalyticsEvent(
            scenario.studioStage!.expected.analyticsEvent,
            scenario.studioStage!.expected.analyticsPayload,
          );
        });
      }

      if (scenario.name === "stale persisted result recomputes") {
        expect(backend.state.analysisRunCalls).toBeGreaterThan(0);
      }
    });
  }
});
