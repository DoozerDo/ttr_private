import type { DecisionFlowDataSource } from "@/lib/decisionFlowDebug";
import type { GenerationReadiness } from "@/lib/generationReadiness";
import {
  getGenerationAuthorityState,
} from "@/lib/generationAuthority";
import {
  buildGenerationProductReadiness,
  type GenerationProductReadiness,
} from "@/lib/generationProductReadiness";
import {
  resolveCanonicalState,
  type AnalysisTargetPair,
  type CanonicalDecisionResult,
  type CanonicalSurface,
} from "@/lib/canonicalDecision";
import { isDocumentGenerationUnlocked, isMomentumGenerationAllowed } from "@/lib/documentGenerationGate";
import {
  assertCanonicalRouteHref,
  getFitReviewHref,
  getResultsHref,
  getStudioHref,
} from "@/src/navigation/routes";

export type ProductDecisionScorePresentationMode = "normal" | "caution" | "fix_first";

export type ProductDecisionRouteContext = {
  assessmentId?: string | null;
  analysisId?: string | null;
  baselineId?: string | null;
  jobId?: string | null;
  baselineVersionId?: string | null;
  highlightClaim?: string | null;
  locked?: boolean | number | string | null;
  fromUnlock?: boolean;
};

export type ProductDecisionState = {
  surface: CanonicalSurface;
  score: number | null;
  scorePresentationMode: ProductDecisionScorePresentationMode;
  likelyUnderestimatedFit: boolean;
  generationReadiness: GenerationReadiness;
  decisionGenerationReadiness: GenerationReadiness;
  renderedGenerationReadiness: GenerationReadiness;
  productReadiness: GenerationProductReadiness;
  canonicalDecision: CanonicalDecisionResult;
  fitReviewHref: string;
  resultsHref: string;
  studioHref: string;
  canGenerateDocuments: boolean;
  canOpenStudio: boolean;
  pairKey: string | null;
  dataSource: DecisionFlowDataSource;
  persistedAssessmentId: string | null;
};

export type BuildProductDecisionStateInput = {
  surface: CanonicalSurface;
  baselineId: string | null;
  jobId: string | null;
  score: number | null;
  generationReadiness: GenerationReadiness;
  hasCanonicalAssessment: boolean;
  hasRequiredContext: boolean;
  isPro: boolean;
  canGenerateDocuments?: boolean;
  opportunityAlreadySaved?: boolean;
  forceFitReview?: boolean;
  analysisAssessmentId?: string | null;
  analysisBaselineId?: string | null;
  analysisJobId?: string | null;
  analysisBaselineVersionId?: string | null;
  scorePresentationModeCandidates?: Array<ProductDecisionScorePresentationMode | null | undefined>;
  likelyUnderestimatedFit?: boolean | null;
  routeContext?: ProductDecisionRouteContext;
  scoreCandidates?: Array<{ source: string; value: number | null }>;
  analysisCandidates?: Array<{ source: string; value: AnalysisTargetPair | null | undefined }>;
  dataSource?: DecisionFlowDataSource;
  persistedAssessmentId?: string | null;
};

function resolveScorePresentationMode(
  score: number | null,
  candidates?: Array<ProductDecisionScorePresentationMode | null | undefined>,
): ProductDecisionScorePresentationMode {
  for (const candidate of candidates ?? []) {
    if (candidate === "normal" || candidate === "caution" || candidate === "fix_first") {
      return candidate;
    }
  }
  if (typeof score === "number" && Number.isFinite(score) && score < 65) {
    return "fix_first";
  }
  return "normal";
}

function normalizeGenerationReadinessForResults(
  surface: CanonicalSurface,
  score: number | null,
  readiness: GenerationReadiness,
): GenerationReadiness {
  if (surface !== "results") {
    return readiness;
  }

  if (isMomentumGenerationAllowed(score) && readiness.status !== "ready") {
    return {
      ...readiness,
      status: "ready",
      blocked: false,
      badgeLabel: "READY",
      summary: "You’re ready to generate. Strengthen these areas to improve results.",
    };
  }

  if (typeof score === "number" && score < 70 && readiness.status === "ready") {
    return {
      ...readiness,
      status: "blocked",
      blocked: true,
      badgeLabel: "BLOCKED",
      summary: "Complete Fit Review to clarify the evidence gaps below.",
    };
  }

  return readiness;
}

function normalizeRouteContext(
  input: BuildProductDecisionStateInput,
): ProductDecisionRouteContext {
  return input.routeContext ?? {
    assessmentId: input.analysisAssessmentId ?? null,
    analysisId: input.analysisAssessmentId ?? null,
    baselineId: input.baselineId,
    jobId: input.jobId,
    baselineVersionId: input.analysisBaselineVersionId ?? null,
  };
}

function buildCanonicalRoutes(
  surface: CanonicalSurface,
  input: BuildProductDecisionStateInput,
): {
  fitReviewHref: string;
  resultsHref: string;
  studioHref: string;
} {
  const routeContext = normalizeRouteContext(input);
  const fitReviewHref = assertCanonicalRouteHref({
    kind: "fit_review",
    href: getFitReviewHref({
      jobId: routeContext.jobId ?? input.jobId,
      baselineId: routeContext.baselineId ?? input.baselineId,
      baselineVersionId: routeContext.baselineVersionId ?? null,
      assessmentId: routeContext.assessmentId ?? input.analysisAssessmentId ?? null,
      analysisId: routeContext.analysisId ?? input.analysisAssessmentId ?? null,
      highlightClaim: routeContext.highlightClaim ?? null,
      locked: routeContext.locked ?? null,
    }),
    canonicalHref: getFitReviewHref({
      jobId: routeContext.jobId ?? input.jobId,
      baselineId: routeContext.baselineId ?? input.baselineId,
      baselineVersionId: routeContext.baselineVersionId ?? null,
      assessmentId: routeContext.assessmentId ?? input.analysisAssessmentId ?? null,
      analysisId: routeContext.analysisId ?? input.analysisAssessmentId ?? null,
      highlightClaim: routeContext.highlightClaim ?? null,
      locked: routeContext.locked ?? null,
    }),
    state: isDocumentGenerationUnlocked(input.score) ? "READY" : "BLOCKED",
    baselineId: routeContext.baselineId ?? input.baselineId,
    jobId: routeContext.jobId ?? input.jobId,
    entrySource: surface,
  });

  const resultsHref = assertCanonicalRouteHref({
    kind: "results",
    href: getResultsHref({
      jobId: routeContext.jobId ?? input.jobId,
      baselineId: routeContext.baselineId ?? input.baselineId,
      assessmentId: routeContext.assessmentId ?? input.analysisAssessmentId ?? null,
      analysisId: routeContext.analysisId ?? input.analysisAssessmentId ?? null,
      highlightClaim: routeContext.highlightClaim ?? null,
    }),
    canonicalHref: getResultsHref({
      jobId: routeContext.jobId ?? input.jobId,
      baselineId: routeContext.baselineId ?? input.baselineId,
      assessmentId: routeContext.assessmentId ?? input.analysisAssessmentId ?? null,
      analysisId: routeContext.analysisId ?? input.analysisAssessmentId ?? null,
      highlightClaim: routeContext.highlightClaim ?? null,
    }),
    state: isDocumentGenerationUnlocked(input.score) ? "READY" : "BLOCKED",
    baselineId: routeContext.baselineId ?? input.baselineId,
    jobId: routeContext.jobId ?? input.jobId,
    entrySource: surface,
  });

  const studioHref = assertCanonicalRouteHref({
    kind: "studio",
    href: getStudioHref({
      jobId: routeContext.jobId ?? input.jobId,
      baselineId: routeContext.baselineId ?? input.baselineId,
      baselineVersionId: routeContext.baselineVersionId ?? input.analysisBaselineVersionId ?? null,
      assessmentId: routeContext.assessmentId ?? input.analysisAssessmentId ?? null,
      analysisId: routeContext.analysisId ?? input.analysisAssessmentId ?? null,
      fromUnlock: routeContext.fromUnlock,
    }),
    canonicalHref: getStudioHref({
      jobId: routeContext.jobId ?? input.jobId,
      baselineId: routeContext.baselineId ?? input.baselineId,
      baselineVersionId: routeContext.baselineVersionId ?? input.analysisBaselineVersionId ?? null,
      assessmentId: routeContext.assessmentId ?? input.analysisAssessmentId ?? null,
      analysisId: routeContext.analysisId ?? input.analysisAssessmentId ?? null,
      fromUnlock: routeContext.fromUnlock,
    }),
    state: isDocumentGenerationUnlocked(input.score) ? "READY" : "BLOCKED",
    baselineId: routeContext.baselineId ?? input.baselineId,
    jobId: routeContext.jobId ?? input.jobId,
    entrySource: surface,
  });

  return { fitReviewHref, resultsHref, studioHref };
}

export function buildProductDecisionState(
  input: BuildProductDecisionStateInput,
): ProductDecisionState {
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null;
  const scorePresentationMode = resolveScorePresentationMode(score, input.scorePresentationModeCandidates);
  const likelyUnderestimatedFit =
    input.likelyUnderestimatedFit ?? scorePresentationMode === "fix_first";
  const generationReadiness = input.generationReadiness;
  const decisionGenerationReadiness = normalizeGenerationReadinessForResults(
    input.surface,
    score,
    generationReadiness,
  );
  const authorityState = getGenerationAuthorityState(generationReadiness);
  const productReadiness = buildGenerationProductReadiness({
    score,
    authorityState,
    hasCanonicalAssessment: input.hasCanonicalAssessment,
    hasRequiredContext: input.hasRequiredContext,
    isPro: input.isPro,
    hasCompletedGeneration: input.opportunityAlreadySaved,
  });
  const routes = buildCanonicalRoutes(input.surface, {
    ...input,
    score,
    generationReadiness: decisionGenerationReadiness,
  });

  const canonicalDecision = resolveCanonicalState({
    surface: "studio",
    baselineId: input.baselineId,
    jobId: input.jobId,
    score,
    generationReadiness: decisionGenerationReadiness,
    productReadiness,
    fitReviewHref: routes.fitReviewHref,
    resultsHref: routes.resultsHref,
    canGenerateDocuments: input.canGenerateDocuments ?? productReadiness.canOpenStudio,
    persistedAssessmentId: input.persistedAssessmentId ?? null,
    analysisCandidates: input.analysisCandidates,
    scoreCandidates: input.scoreCandidates ?? [{ source: "primary", value: score }],
  });
  const renderedGenerationReadiness: GenerationReadiness =
    input.surface === "results"
      ? ({
          ...decisionGenerationReadiness,
          status:
            canonicalDecision.readinessState === "READY"
              ? "ready"
              : canonicalDecision.readinessState === "DRAFT"
                ? "limited"
                : "blocked",
          blocked: canonicalDecision.readinessState !== "READY",
          badgeLabel:
            canonicalDecision.readinessState === "READY"
              ? "READY"
              : canonicalDecision.readinessState === "DRAFT"
                ? "LIMITED"
                : "BLOCKED",
          summary:
            canonicalDecision.readinessState === "READY" ||
            canonicalDecision.readinessState === "DRAFT"
              ? "Your materials are ready to generate now. Review them in Studio before applying."
              : "Complete Fit Review to clarify the evidence gaps below.",
        } satisfies GenerationReadiness)
      : generationReadiness;

  return {
    surface: input.surface,
    score,
    scorePresentationMode,
    likelyUnderestimatedFit,
    generationReadiness,
    decisionGenerationReadiness,
    renderedGenerationReadiness,
    productReadiness,
    canonicalDecision,
    fitReviewHref: routes.fitReviewHref,
    resultsHref: routes.resultsHref,
    studioHref: routes.studioHref,
    canGenerateDocuments: input.canGenerateDocuments ?? productReadiness.canOpenStudio,
    canOpenStudio: productReadiness.canOpenStudio,
    pairKey: canonicalDecision.pairKey,
    dataSource: input.dataSource ?? "fresh",
    persistedAssessmentId: input.persistedAssessmentId ?? null,
  };
}
