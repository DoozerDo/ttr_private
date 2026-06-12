"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import {
  archiveBaseline,
  BaselineMutationError,
  describeBaselineMutationError,
  setCurrentBaseline,
  isBaselineAnalyzedFromSummary,
  getLatestRoleAnalysisFitScore,
  type BaselineAssessmentSummaryDto,
  type BaselineDto,
} from "@/lib/baselines";
import { logDecisionFlowEvent } from "@/lib/decisionFlowDebug";
import { getBaselineCardActionFlags } from "@/lib/baselineCardActions";
import { partitionBaselines } from "@/lib/baselinePartition";
import {
  parseComplianceError,
  readResponsePayload,
  type ParsedInsufficientExtractedTextError,
} from "@/lib/compliance/parseComplianceError";
import { formatDateTime } from "@/lib/format-date";
import { buildBaselineCertification, buildCareerGravityUnlock } from "@/lib/baselineCertification";
import {
  buildBaselineScoreHistoryFromBaseline,
  toBaselineScoreHistoryCardViewModel,
} from "@/lib/baselineScoreHistory";
import {
  buildBaselineSignalGraph,
  type ProfessionalSignalId,
  type SignalGraphViewModel,
} from "@/lib/professionalSignals";
import { publishBaselineUpdated, subscribeBaselineUpdated } from "@/src/lib/baseline-sync";
import { BASELINE_USABLE_MIN_PERCENT } from "@/src/features/baseline/constants";
import {
  assertCanonicalRouteHref,
  getBaselineDetailsHref,
} from "@/src/navigation/routes";
import { trackEvent } from "@/src/lib/analytics";
import { sanitizeRenderedTextList, sanitizeRenderedTextValue } from "@/lib/renderedText";
import { resolveWorkflowProgression } from "@/lib/workflowProgression";
import { ResumeWithBaselineStatus } from "./_components/ResumeWithBaselineStatus";

type BaselineStudioHomeProps = {
  baselines: BaselineDto[];
  libraryMode?: "editable" | "readonly";
};

type ErrorPayload = {
  message?: unknown;
  latestAssessmentSummary?: BaselineAssessmentSummaryDto;
};

const TARGET_ROLE_CTA_LABEL = "TARGET A ROLE";
const BASELINE_NEEDS_REVIEW_EXPLANATION =
  "You need to complete baseline verification before targeting roles.";

type BaselineStrengthState = "empty" | "needs_analysis" | "ready";
type BaselineReadinessState = "NOT_ANALYZED" | "ANALYZING" | "READY";
type BaselinePageReadinessContract = {
  activeBaselineId: string | null;
  baselineId: string | null;
  hasCompletedAssessment: boolean;
  latestAssessmentId: string | null;
  latestAssessmentCreatedAt: string | null;
  latestFitScore: number | null;
  readinessState: BaselineReadinessState;
  ctaLabel: string;
  ctaHref: string;
  actionType: "target_role" | "upload_resume";
  workflowState: string;
  dataSource: "fresh" | "persisted" | "mixed";
  persistedAssessmentId: string | null;
};

type StrengtheningPrompt = {
  question: string;
  whyMatters: string;
};

const STRENGTHENING_PROMPTS: Record<ProfessionalSignalId, StrengtheningPrompt> = {
  customer_operations_leadership: {
    question: "What operational outcomes did you personally lead across customer operations?",
    whyMatters: "Leadership signal helps the system model scope and decision ownership.",
  },
  support_process_design: {
    question: "Describe a support process or workflow you designed and how it changed execution.",
    whyMatters: "Process-design signal improves role fit for operations-heavy environments.",
  },
  incident_management: {
    question: "Describe the most complex incident process you personally owned or improved.",
    whyMatters: "Incident signal improves confidence for high-accountability operations roles.",
  },
  cross_functional_coordination: {
    question: "Which cross-functional groups did you coordinate with, and what did you drive together?",
    whyMatters: "Coordination signal improves transfer into multi-stakeholder roles.",
  },
  tooling_and_workflow_operations: {
    question: "Which tooling or workflow systems did you own, configure, or evolve?",
    whyMatters: "Tooling signal supports stronger platform and execution alignment.",
  },
  platform_ownership_scope: {
    question: "What platform ownership scope did you hold, and what decisions were yours?",
    whyMatters: "Ownership scope clarifies whether you operated the system or led it.",
  },
  organizational_scale: {
    question: "What team size, customer volume, or operational scale did your work support?",
    whyMatters: "Scale signal unlocks better senior-level and enterprise targeting confidence.",
  },
  change_leadership: {
    question: "Describe a process, tooling, or support change you led and what changed because of it.",
    whyMatters: "Change signal strengthens fit for transformation-oriented roles.",
  },
  quantified_business_impact: {
    question:
      "What measurable result came from your work, such as faster resolution, reduced backlog, improved CSAT, or better efficiency?",
    whyMatters: "Quantified signal improves scoring confidence and personalization quality.",
  },
  domain_and_customer_context: {
    question: "What customer segment or business context shaped your operational decisions?",
    whyMatters: "Context signal helps align your baseline with role-specific business needs.",
  },
};

function sortBaselinesNewestFirst(baselines: BaselineDto[]) {
  return [...baselines].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function getMostRecentBaselineId(baselines: BaselineDto[]) {
  return (
    sortBaselinesNewestFirst(baselines).find((baseline) => baseline.isActive === true)?.id ??
    sortBaselinesNewestFirst(baselines).find((baseline) => baseline.status !== "ARCHIVED")?.id ??
    null
  );
}

function deriveBaselineStrengthPercent(
  baseline: BaselineDto | null,
  graph: SignalGraphViewModel,
) {
  if (!baseline?.sections?.length) return 24;
  const scores = graph.strongSignals.concat(graph.developingSignals).map((signal) => signal.score);
  if (!scores.length) return 24;
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.max(28, Math.min(91, Math.round(average)));
}

function SignalPill({ label, tone }: { label: string; tone: "strong" | "developing" }) {
  const toneClasses =
    tone === "strong"
      ? "border-emerald-300/15 bg-emerald-400/[0.08] text-slate-100"
      : "border-white/10 bg-white/[0.04] text-slate-100";

  return (
    <article className={`rounded-[22px] border px-4 py-4 ${toneClasses}`}>
      <p className="text-sm font-semibold">{label}</p>
    </article>
  );
}

function getDuplicateUploadMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const maybeCode = (data as { code?: unknown }).code;
  const errorBody = (data as { error?: Record<string, unknown> }).error;
  const duplicateCode =
    (typeof maybeCode === "string" ? maybeCode : undefined) ??
    (typeof errorBody?.code === "string" ? errorBody.code : undefined);
  const topLevelMessage =
    typeof (data as { message?: unknown }).message === "string"
      ? sanitizeRenderedTextValue((data as { message?: unknown }).message as string, {
          endpoint: "baseline-studio-home",
          field: "message",
        })
      : null;

  if (
    duplicateCode !== "BASELINE_DUPLICATE" &&
    duplicateCode !== "CONFLICT" &&
    topLevelMessage !== "This file has already been uploaded."
  ) {
    return null;
  }

  return (
    (typeof errorBody?.message === "string"
      ? sanitizeRenderedTextValue(errorBody.message, {
          endpoint: "baseline-studio-home",
          field: "error.message",
        })
      : topLevelMessage) ?? "This file has already been uploaded."
  );
}

function getLibraryCapMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const maybeCode = (data as { code?: unknown }).code;
  const errorBody = (data as { error?: Record<string, unknown> }).error;
  const capCode =
    (typeof maybeCode === "string" ? maybeCode : undefined) ??
    (typeof errorBody?.code === "string" ? errorBody.code : undefined);

  if (capCode !== "BASELINE_LIBRARY_CAP_REACHED") return null;

  return (
    (typeof errorBody?.message === "string"
      ? sanitizeRenderedTextValue(errorBody.message, {
          endpoint: "baseline-studio-home",
          field: "error.message",
        })
      : null) ?? "Upload unavailable."
  );
}

function getUploadedBaselineRecord(data: unknown): BaselineDto | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const direct = payload as unknown as BaselineDto;
  if (typeof direct.id === "string" && direct.id.trim().length > 0) {
    return direct;
  }

  const nested = payload.baseline;
  if (!nested || typeof nested !== "object") return null;
  const baseline = nested as BaselineDto;
  if (typeof baseline.id !== "string" || baseline.id.trim().length === 0) {
    return null;
  }
  return baseline;
}

function getAssessmentSummaryStatusTone(state: BaselineReadinessState) {
  if (state === "ANALYZING") {
    return "border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100";
  }
  return state === "READY"
    ? "border-emerald-300/15 bg-emerald-400/[0.08] text-emerald-100"
    : "border-white/10 bg-white/[0.05] text-slate-300";
}

function getBaselineReadinessLabel(state: BaselineReadinessState) {
  if (state === "ANALYZING") return "Analyzing";
  if (state === "READY") return "Ready for targeting";
  return "Not analyzed";
}

function toEpoch(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveCanonicalAssessmentSummary(
  ...candidates: Array<BaselineAssessmentSummaryDto | null | undefined>
): BaselineAssessmentSummaryDto | undefined {
  const summaries = candidates.filter(
    (candidate): candidate is BaselineAssessmentSummaryDto => Boolean(candidate),
  );
  if (!summaries.length) return undefined;

  const analyzed = summaries.filter((summary) => isBaselineAnalyzedFromSummary(summary));
  const pool = analyzed.length ? analyzed : summaries;
  return [...pool].sort(
    (left, right) =>
      toEpoch(right.latestAssessmentCreatedAt) - toEpoch(left.latestAssessmentCreatedAt),
  )[0];
}

function resolveBaselineProgressPercent(baseline: BaselineDto | null): number | null {
  if (!baseline) return null;
  if (typeof baseline.latestBaselineScore === "number") return baseline.latestBaselineScore;
  if (typeof baseline.originalBaselineScore === "number") return baseline.originalBaselineScore;
  return null;
}

function buildBaselineReadinessContract({
  baseline,
  isAnalyzing = false,
}: {
  baseline: BaselineDto | null;
  isAnalyzing?: boolean;
}): BaselinePageReadinessContract {
  const baselineId = baseline?.id ?? null;
  const progressPercent = resolveBaselineProgressPercent(baseline);
  const summary = baseline?.latestAssessmentSummary ?? null;
  const latestAssessmentId = summary?.latestAssessmentId?.trim() ?? null;
  const hasAnalyzedSummary = isBaselineAnalyzedFromSummary(summary);
  const routes = {
    baseline: "/baseline",
    target: baselineId ? `/target?baselineId=${encodeURIComponent(baselineId)}` : "/target",
    analyze: baselineId ? `/analyze?baselineId=${encodeURIComponent(baselineId)}` : "/analyze",
    results: baselineId ? `/target?baselineId=${encodeURIComponent(baselineId)}` : "/target",
    upload: baselineId ? getBaselineDetailsHref(baselineId) : "/baseline",
    studio: baselineId ? `/target?baselineId=${encodeURIComponent(baselineId)}` : "/target",
    fitReview: baselineId ? `/target?baselineId=${encodeURIComponent(baselineId)}` : "/target",
  };
  const progression = resolveWorkflowProgression({
    surface: "baseline",
    baselineId,
    jobId: null,
    routes,
    baselineStatus: isAnalyzing ? "UPLOADING" : "READY",
    analysisStatus: isAnalyzing ? "running" : latestAssessmentId ? "complete" : "idle",
    analysisAssessmentId: latestAssessmentId,
    persistedAssessmentId: latestAssessmentId,
    score: summary?.latestFitScore ?? null,
    firstRun: !baselineId,
    hasJobDescription: false,
    dataSource: summary ? "persisted" : "fresh",
  });

  return {
    activeBaselineId: baselineId,
    baselineId,
    hasCompletedAssessment: hasAnalyzedSummary,
    latestAssessmentId,
    latestAssessmentCreatedAt: summary?.latestAssessmentCreatedAt?.trim() ?? null,
    latestFitScore: summary?.latestFitScore ?? null,
    readinessState: isAnalyzing
      ? "ANALYZING"
      : hasAnalyzedSummary ||
          (typeof progressPercent === "number" && progressPercent >= BASELINE_USABLE_MIN_PERCENT)
        ? "READY"
        : "NOT_ANALYZED",
    ctaLabel: TARGET_ROLE_CTA_LABEL,
    ctaHref: routes.target,
    actionType: "target_role",
    workflowState: progression.state,
    dataSource: progression.dataSource,
    persistedAssessmentId: progression.persistedAssessmentId,
  };
}

function createBaselineUpdateProposal(signalLabel: string, answer: string) {
  return sanitizeRenderedTextValue(`${signalLabel}: ${answer.trim()}`, {
    endpoint: "baseline-studio-home",
    field: "baselineUpdateProposal",
  });
}

function formatCardActionLabel(label: string) {
  return label.toUpperCase();
}

function extractApprovedSignalAdditions(baseline: BaselineDto | null): string[] {
  if (!baseline?.sections?.length) return [];
  const refinementSections = baseline.sections
    .filter(
      (section) =>
        sanitizeRenderedTextValue(section.title ?? "", {
          endpoint: "baseline-studio-home",
          field: "section.title",
        }).toLowerCase() === "approved signal refinements",
    )
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  if (!refinementSections.length) return [];

  const lines: string[] = [];
  for (const section of refinementSections) {
    const content = typeof section.content === "string" ? section.content : "";
    sanitizeRenderedTextList(content.split("\n"), {
      endpoint: "baseline-studio-home",
      field: "section.content",
    })
      .map((line) => line.replace(/^[-*•]\s*/, ""))
      .filter(Boolean)
      .forEach((line) => lines.push(line));
  }
  return lines;
}

export function BaselineStudioHome({ baselines, libraryMode = "editable" }: BaselineStudioHomeProps) {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [baselineList, setBaselineList] = useState<BaselineDto[]>(baselines);
  const [primaryBaselineId, setPrimaryBaselineId] = useState<string | null>(() =>
    getMostRecentBaselineId(baselines),
  );
  const [baselineDetails, setBaselineDetails] = useState<Record<string, BaselineDto>>({});
  const [activeStrengtheningSignalId, setActiveStrengtheningSignalId] =
    useState<ProfessionalSignalId | null>(null);
  const [strengtheningAnswer, setStrengtheningAnswer] = useState("");
  const [pendingStrengtheningProposal, setPendingStrengtheningProposal] = useState<string | null>(
    null,
  );
  const [savingStrengtheningProposal, setSavingStrengtheningProposal] = useState(false);
  const [strengtheningSaveError, setStrengtheningSaveError] = useState<string | null>(null);
  const [strengtheningFeedbackBySignalId, setStrengtheningFeedbackBySignalId] = useState<
    Record<
      string,
      {
        classification: "no_change_duplicate" | "refined_existing_signal" | "new_signal_added";
        message: string;
        scoreDelta: number;
      }
    >
  >({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessId, setUploadSuccessId] = useState<string | null>(null);
  const [highlightedBaselineId, setHighlightedBaselineId] = useState<string | null>(null);
  const [postUploadCtaBaselineId, setPostUploadCtaBaselineId] = useState<string | null>(null);
  const [baselineUpdatedNotice, setBaselineUpdatedNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [insufficientTextError, setInsufficientTextError] =
    useState<ParsedInsufficientExtractedTextError | null>(null);
  const [archivingBaselineId, setArchivingBaselineId] = useState<string | null>(null);
  const [loadingBaselineId, setLoadingBaselineId] = useState<string | null>(null);
  const [analysisRunsByBaselineId, setAnalysisRunsByBaselineId] = useState<Record<string, number>>({});
  const [completedRoleAnalyses, setCompletedRoleAnalyses] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analysisSectionRef = useRef<HTMLDivElement | null>(null);
  const analysisHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const primaryBaselineIdRef = useRef<string | null>(primaryBaselineId);
  const baselineDetailsRequestRef = useRef<{ requestId: string; baselineId: string } | null>(null);
  const baselineAnalysisRequestRef = useRef<{ requestId: string; baselineId: string } | null>(null);

  const allBaselines = useMemo(() => sortBaselinesNewestFirst(baselineList), [baselineList]);
  const currentBaselineId = useMemo(
    () =>
      sortBaselinesNewestFirst(baselineList).find(
        (baseline) => baseline.status !== "ARCHIVED" && baseline.isActive === true,
      )?.id ?? null,
    [baselineList],
  );
  const baselinePartition = useMemo(
    () =>
      partitionBaselines({
        baselines: baselineList,
        currentBaselineId: currentBaselineId ?? primaryBaselineId,
      }),
    [baselineList, currentBaselineId, primaryBaselineId],
  );
  const activeBaselines = baselinePartition.activeBaselines;
  const libraryBaselines = baselinePartition.libraryBaselines;
  const isEditableLibrary = libraryMode === "editable";
  const baselineDebugEnabled = useMemo(() => {
    if (process.env.NODE_ENV !== "production") return true;
    try {
      return window.localStorage.getItem("baseline_debug") === "true";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    primaryBaselineIdRef.current = primaryBaselineId;
  }, [primaryBaselineId]);

  useEffect(() => {
    if (!currentBaselineId) return;
    setPrimaryBaselineId((current) => (current === currentBaselineId ? current : currentBaselineId));
  }, [currentBaselineId]);

  useEffect(() => {
    if (!activeBaselines.length) {
      setPrimaryBaselineId(null);
      return;
    }

    setPrimaryBaselineId((current) => {
      if (
        current &&
        activeBaselines.some((baseline) => baseline.id === current && baseline.status !== "ARCHIVED")
      ) {
        return current;
      }
      return activeBaselines[0]?.id ?? null;
    });
  }, [activeBaselines]);

  const primaryBaseline = useMemo(() => {
    if (!primaryBaselineId) return null;
    const listBaseline =
      allBaselines.find((item) => item.id === primaryBaselineId && item.status !== "ARCHIVED") ?? null;
    const detailBaseline = baselineDetails[primaryBaselineId] ?? null;

    if (!listBaseline) return detailBaseline;
    if (!detailBaseline) return listBaseline;

    return {
      ...listBaseline,
      ...detailBaseline,
      latestAssessmentSummary: resolveCanonicalAssessmentSummary(
        detailBaseline.latestAssessmentSummary,
        listBaseline.latestAssessmentSummary,
      ),
    };
  }, [allBaselines, baselineDetails, primaryBaselineId]);

  const currentActiveBaseline = useMemo(() => {
    if (!currentBaselineId) return null;
    const listBaseline =
      allBaselines.find(
        (item) => item.id === currentBaselineId && item.status === "ACTIVE" && item.isActive === true,
      ) ?? null;
    const detailBaseline = baselineDetails[currentBaselineId] ?? null;

    if (!listBaseline) return null;
    if (!detailBaseline) return listBaseline;

    return {
      ...listBaseline,
      ...detailBaseline,
      latestAssessmentSummary: resolveCanonicalAssessmentSummary(
        detailBaseline.latestAssessmentSummary,
        listBaseline.latestAssessmentSummary,
      ),
    };
  }, [allBaselines, baselineDetails, currentBaselineId]);

  const hasCurrentActiveBaseline = currentActiveBaseline?.status === "ACTIVE" && currentActiveBaseline?.isActive === true;

  const primaryBaselineReadiness = useMemo(
    () =>
      buildBaselineReadinessContract({
        baseline: primaryBaseline,
      }),
    [primaryBaseline, primaryBaselineId],
  );
  const primaryAnalysisStatus =
    primaryBaselineReadiness.readinessState === "READY" ? "ready" : "not_analyzed";

  const approvedSignalAdditions = useMemo(
    () => extractApprovedSignalAdditions(primaryBaseline),
    [primaryBaseline],
  );
  const signalGraph = useMemo(
    () => buildBaselineSignalGraph({ baseline: primaryBaseline }),
    [primaryBaseline],
  );
  const primaryScoreHistoryViewModel = useMemo(
    () =>
      toBaselineScoreHistoryCardViewModel(
        buildBaselineScoreHistoryFromBaseline(
          primaryBaselineId ? baselineDetails[primaryBaselineId] ?? primaryBaseline : primaryBaseline,
        ),
      ),
    [baselineDetails, primaryBaseline, primaryBaselineId],
  );
  const baselineStrengthPercent = useMemo(
    () =>
      typeof primaryScoreHistoryViewModel.currentScore === "number"
        ? primaryScoreHistoryViewModel.currentScore
        : deriveBaselineStrengthPercent(primaryBaseline, signalGraph),
    [primaryBaseline, primaryScoreHistoryViewModel.currentScore, signalGraph],
  );
  const gravitySummary = useMemo(
    () => signalGraph.strongSignals.slice(0, 3).map((signal) => signal.label).join(", "),
    [signalGraph.strongSignals],
  );
  const certification = useMemo(
    () =>
      buildBaselineCertification({
        baseline: primaryBaseline,
        signalGraph,
        baselineStrengthPercent,
        analysisStatus: primaryAnalysisStatus,
        analysesCompleted:
          (primaryBaselineId ? analysisRunsByBaselineId[primaryBaselineId] ?? 0 : 0) +
          (primaryAnalysisStatus === "ready" ? 1 : 0),
      }),
    [
      analysisRunsByBaselineId,
      baselineStrengthPercent,
      primaryBaseline,
      primaryAnalysisStatus,
      primaryBaselineId,
      signalGraph,
    ],
  );
  const baselineStrengthState: BaselineStrengthState = useMemo(() => {
    if (activeBaselines.length === 0) return "empty";
    if (!primaryBaselineId || primaryAnalysisStatus !== "ready" || !primaryBaseline?.sections?.length) {
      return "needs_analysis";
    }
    return "ready";
  }, [activeBaselines.length, primaryAnalysisStatus, primaryBaselineId, primaryBaseline]);
  const analysisReady = baselineStrengthState === "ready";
  const latestAssessmentSummary = primaryBaseline?.latestAssessmentSummary ?? null;
  const hasBaseline = activeBaselines.length > 0;
  const baselineDetailsHref = currentActiveBaseline?.id
    ? getBaselineDetailsHref(currentActiveBaseline.id)
    : primaryBaselineId
      ? getBaselineDetailsHref(primaryBaselineId)
      : "/baseline";
  const targetRoleHref = currentActiveBaseline?.id
    ? `/target?baselineId=${encodeURIComponent(currentActiveBaseline.id)}`
    : "/target";
  const heroState: "no_baseline" | "has_current_active" | "has_no_current" = useMemo(() => {
    if (!hasBaseline) return "no_baseline";
    if (hasCurrentActiveBaseline) return "has_current_active";
    return "has_no_current";
  }, [hasBaseline, hasCurrentActiveBaseline]);
  const canReplaceActiveBaseline = true;
  const baselineLibrarySectionTitle = "Other baselines";
  const activeBaselineVersionLabel = `Version ${primaryBaseline?.versionNumber ?? primaryBaseline?.version ?? 1} (current)`;
  const baselineReadinessDataSource = primaryBaselineReadiness.dataSource;
  const baselineReadinessAnalyticsPayload = useMemo(
    () => ({
      source: "baseline" as const,
      baselineId: primaryBaseline?.id ?? primaryBaselineId ?? null,
      readinessState: primaryBaselineReadiness.readinessState,
      latestAssessmentId: primaryBaselineReadiness.latestAssessmentId,
      latestFitScore: primaryBaselineReadiness.latestFitScore,
      dataSource: baselineReadinessDataSource,
      ctaLabel: primaryBaselineReadiness.ctaLabel,
      ctaHref: primaryBaselineReadiness.ctaHref,
      actionType: primaryBaselineReadiness.actionType,
    }),
    [
      baselineReadinessDataSource,
      primaryBaseline?.id,
      primaryBaselineId,
      primaryBaselineReadiness.actionType,
      primaryBaselineReadiness.ctaHref,
      primaryBaselineReadiness.ctaLabel,
      primaryBaselineReadiness.latestAssessmentId,
      primaryBaselineReadiness.latestFitScore,
      primaryBaselineReadiness.readinessState,
    ],
  );
  const baselineReadinessKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!primaryBaseline) return;
    const eventKey = [
      primaryBaseline.id,
      primaryBaselineReadiness.latestAssessmentId ?? "none",
      primaryBaselineReadiness.latestFitScore ?? "none",
      primaryBaselineReadiness.readinessState,
      baselineReadinessDataSource,
    ].join(":");
    if (baselineReadinessKeyRef.current === eventKey) return;
    baselineReadinessKeyRef.current = eventKey;
    const cta = {
      label: primaryBaselineReadiness.ctaLabel,
      href: primaryBaselineReadiness.ctaHref,
      actionType: primaryBaselineReadiness.actionType,
    };

    trackEvent("baseline_readiness_viewed", baselineReadinessAnalyticsPayload);
    logDecisionFlowEvent({
      event: "baseline_readiness_resolved",
      entrySource: "baseline",
      baselineId: primaryBaseline.id,
      jobId: null,
      pairKey: null,
      score: primaryBaselineReadiness.latestFitScore ?? null,
      readinessState: primaryBaselineReadiness.readinessState,
      contractSource: "resolveCanonicalState",
      ctaLabel: cta.label,
      ctaHref: cta.href,
      resolvedRoute: cta.href,
      actionType: cta.actionType,
      legacyFallbackAttempted: false,
      legacyFallbackBlocked: true,
      analyticsPayload: baselineReadinessAnalyticsPayload,
      dataSource: baselineReadinessDataSource,
      persistedAssessmentId: primaryBaselineReadiness.latestAssessmentId,
    });
  }, [
    baselineReadinessAnalyticsPayload,
    baselineReadinessDataSource,
    primaryBaseline,
    primaryBaselineReadiness.actionType,
    primaryBaselineReadiness.ctaHref,
    primaryBaselineReadiness.ctaLabel,
    primaryBaselineReadiness.latestAssessmentId,
    primaryBaselineReadiness.latestFitScore,
    primaryBaselineReadiness.readinessState,
  ]);
  const careerGravity = useMemo(
    () => buildCareerGravityUnlock(completedRoleAnalyses),
    [completedRoleAnalyses],
  );
  const activeStrengtheningSignal = useMemo(
    () =>
      activeStrengtheningSignalId
        ? signalGraph.developingSignals.find((signal) => signal.id === activeStrengtheningSignalId) ?? null
        : null,
    [activeStrengtheningSignalId, signalGraph.developingSignals],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch("/api/analysis/history", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as unknown;
        const records = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { items?: unknown[] })?.items)
            ? ((payload as { items?: unknown[] }).items as unknown[])
            : Array.isArray((payload as { history?: unknown[] })?.history)
              ? ((payload as { history?: unknown[] }).history as unknown[])
              : [];
        const completed = records.filter((record) => {
          if (!record || typeof record !== "object") return false;
          const status =
            typeof (record as { status?: unknown }).status === "string"
              ? ((record as { status?: string }).status as string).toLowerCase()
              : "";
          if (status.includes("complete") || status.includes("success")) {
            return true;
          }
          return (
            typeof (record as { score?: unknown }).score === "number" ||
            typeof (record as { compatibilityScore?: unknown }).compatibilityScore === "number" ||
            typeof (record as { fitScore?: unknown }).fitScore === "number"
          );
        }).length;

        if (!cancelled) {
          setCompletedRoleAnalyses(completed);
        }
      } catch {
        if (!cancelled) {
          setCompletedRoleAnalyses(0);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToAnalysis = useCallback(() => {
    window.setTimeout(() => {
      const sectionNode = analysisSectionRef.current;
      if (sectionNode && typeof sectionNode.scrollIntoView === "function") {
        sectionNode.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      analysisHeadingRef.current?.focus();
    }, 50);
  }, []);

  const refreshBaselineLibrary = useCallback(async () => {
    const response = await fetch("/api/baselines?includeArchived=true", {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Unable to refresh your Baseline Library right now.");
    }

    const payload = (await response.json()) as BaselineDto[];
    setBaselineList(payload);
    setBaselineDetails({});
    setPageError(null);
    setPrimaryBaselineId((current) => {
      const activeBaselines = sortBaselinesNewestFirst(payload).filter(
        (baseline) => baseline.status !== "ARCHIVED",
      );
      const canonicalCurrentId =
        activeBaselines.find((baseline) => baseline.isActive === true)?.id ?? null;
      const requestedId =
        typeof current === "string" && current
          ? activeBaselines.some((baseline) => baseline.id === current)
            ? current
            : null
          : null;

      return requestedId ?? canonicalCurrentId ?? activeBaselines[0]?.id ?? null;
    });

    if (process.env.NODE_ENV !== "production") {
      payload.forEach((baseline) => {
        console.debug("[BaselineStudioHome] refreshed baseline summary", {
          baselineId: baseline.id,
          hasCompletedAssessment: isBaselineAnalyzedFromSummary(
            baseline.latestAssessmentSummary,
          ),
          latestAssessmentCreatedAt: baseline.latestAssessmentSummary?.latestAssessmentCreatedAt ?? null,
        });
      });
    }
    return payload;
  }, []);

  const closeStrengtheningModal = useCallback(() => {
    setActiveStrengtheningSignalId(null);
    setStrengtheningAnswer("");
    setPendingStrengtheningProposal(null);
    setStrengtheningSaveError(null);
  }, []);

  const openStrengtheningModal = useCallback((signalId: ProfessionalSignalId) => {
    setActiveStrengtheningSignalId(signalId);
    setStrengtheningAnswer("");
    setPendingStrengtheningProposal(null);
  }, []);

  const handleGenerateStrengtheningProposal = useCallback(() => {
    if (!activeStrengtheningSignal) {
      return;
    }
    const trimmed = strengtheningAnswer.trim();
    if (!trimmed) {
      return;
    }
    setStrengtheningSaveError(null);
    setPendingStrengtheningProposal(createBaselineUpdateProposal(activeStrengtheningSignal.label, trimmed));
  }, [activeStrengtheningSignal, strengtheningAnswer]);

  const createRequestId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const fetchBaselineDetails = useCallback(
    async (baselineId: string) => {
      const requestId = createRequestId();
      setPrimaryBaselineId(baselineId);
      setLoadingBaselineId(baselineId);
      setPageError(null);
      baselineDetailsRequestRef.current = { requestId, baselineId };

      try {
        const response = await fetch(`/api/baselines/${encodeURIComponent(baselineId)}`, {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Selected baseline went stale (archived/deleted elsewhere). Rehydrate and fall back.
            try {
              await refreshBaselineLibrary();
            } catch (refreshError) {
              console.error("Unable to refresh Baseline Library after missing baseline detail", refreshError);
            }
            return null;
          }
          throw new Error("Unable to load baseline analysis right now.");
        }

        const payload = (await response.json()) as BaselineDto;
        if (
          baselineDetailsRequestRef.current?.requestId !== requestId ||
          primaryBaselineIdRef.current !== baselineId
        ) {
          if (process.env.NODE_ENV !== "production") {
            console.info("[BaselineStudioHome] dropped stale baseline detail response", {
              area: "baseline",
              operation: "load_details",
              status: "warn",
              code: "stale_response_dropped",
              baselineId,
              requestId,
              currentBaselineId: primaryBaselineIdRef.current,
            });
          }
          return null;
        }
        setBaselineDetails((current) => ({ ...current, [baselineId]: payload }));
        setPostUploadCtaBaselineId((current) => (current === baselineId ? null : current));
        scrollToAnalysis();
        return payload;
      } catch (fetchError) {
        if (
          baselineDetailsRequestRef.current?.requestId !== requestId ||
          primaryBaselineIdRef.current !== baselineId
        ) {
          return null;
        }
        console.error("[BaselineStudioHome] baseline_details_failed", {
          area: "baseline",
          operation: "load_details",
          status: "error",
          code: "load_failed",
          baselineId,
          message: fetchError instanceof Error ? fetchError.message : String(fetchError),
        });
        setPageError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load baseline analysis right now.",
        );
        return null;
      } finally {
        if (baselineDetailsRequestRef.current?.requestId === requestId) {
          setLoadingBaselineId(null);
          baselineDetailsRequestRef.current = null;
        }
      }
    },
    [refreshBaselineLibrary, scrollToAnalysis],
  );

  const runCanonicalBaselineAnalysis = useCallback(
    async (baselineId: string) => {
      const requestId = createRequestId();
      setPrimaryBaselineId(baselineId);
      setLoadingBaselineId(baselineId);
      setPageError(null);
      baselineAnalysisRequestRef.current = { requestId, baselineId };

      try {
        const loadedBaseline = await fetchBaselineDetails(baselineId);
        if (!loadedBaseline) {
          return;
        }
        if (
          baselineAnalysisRequestRef.current?.requestId !== requestId ||
          primaryBaselineIdRef.current !== baselineId
        ) {
          return;
        }

        const currentSummary =
          loadedBaseline?.latestAssessmentSummary ??
          baselineDetails[baselineId]?.latestAssessmentSummary ??
          baselineList.find((entry) => entry.id === baselineId)?.latestAssessmentSummary;
        if (isBaselineAnalyzedFromSummary(currentSummary)) {
          return;
        }

        const response = await fetch("/api/baselines/analyze", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baselineId }),
        });
        const payload: ErrorPayload | null = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof payload?.message === "string"
              ? payload.message
              : "Analysis did not complete successfully.",
          );
        }

        const analyzedFromResponse = isBaselineAnalyzedFromSummary(
          payload?.latestAssessmentSummary,
        );
        if (!analyzedFromResponse) {
          throw new Error(
            "Analysis did not complete successfully. Baseline readiness was not persisted.",
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.debug("[BaselineStudioHome] canonical analyze complete", {
            area: "baseline",
            operation: "analyze",
            status: "debug",
            code: "analysis_completed",
            baselineId,
            hasCompletedAssessment:
              payload?.latestAssessmentSummary?.hasCompletedAssessment ?? false,
            latestFitScore: payload?.latestAssessmentSummary?.latestFitScore ?? null,
          });
        }

        setAnalysisRunsByBaselineId((current) => ({
          ...current,
          [baselineId]: (current[baselineId] ?? 0) + 1,
        }));
        await refreshBaselineLibrary();
        publishBaselineUpdated({ baselineId, source: "analysis" });
      } catch (runError) {
        if (
          baselineAnalysisRequestRef.current?.requestId !== requestId ||
          primaryBaselineIdRef.current !== baselineId
        ) {
          return;
        }
        console.error("[BaselineStudioHome] baseline_analysis_failed", {
          area: "baseline",
          operation: "analyze",
          status: "error",
          code: "analysis_failed",
          baselineId,
          message: runError instanceof Error ? runError.message : String(runError),
        });
        setPageError(
          runError instanceof Error
            ? runError.message
            : "Unable to run baseline analysis right now.",
        );
      } finally {
        if (baselineAnalysisRequestRef.current?.requestId === requestId) {
          setLoadingBaselineId(null);
          baselineAnalysisRequestRef.current = null;
        }
      }
    },
    [baselineDetails, baselineList, fetchBaselineDetails, refreshBaselineLibrary],
  );

  const handleApproveStrengtheningProposal = useCallback(async () => {
    if (!primaryBaselineId || !pendingStrengtheningProposal) {
      return;
    }
    setSavingStrengtheningProposal(true);
    setStrengtheningSaveError(null);

    try {
      const response = await fetch(
        `/api/baselines/${encodeURIComponent(primaryBaselineId)}/strengthening-additions`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalType: activeStrengtheningSignal?.id ?? null,
            rawText: strengtheningAnswer.trim() || pendingStrengtheningProposal,
          }),
        },
      );

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as Record<string, unknown>).message === "string"
            ? ((payload as Record<string, unknown>).message as string)
            : "Unable to save this baseline update right now.";
        throw new Error(message);
      }

      const persistedBaseline = payload as BaselineDto;
      const impactType =
        typeof (payload as { impactType?: unknown }).impactType === "string"
          ? ((payload as { impactType?: string }).impactType as string)
          : "no_match";
      const changeClassification =
        typeof (payload as { changeClassification?: unknown }).changeClassification === "string"
          ? ((payload as { changeClassification?: string }).changeClassification as
              | "no_change_duplicate"
              | "refined_existing_signal"
              | "new_signal_added")
          : impactType === "duplicate"
            ? "no_change_duplicate"
            : impactType === "new_match"
              ? "new_signal_added"
              : "refined_existing_signal";
      const scoreDelta =
        typeof (payload as { scoreDelta?: unknown }).scoreDelta === "number"
          ? ((payload as { scoreDelta?: number }).scoreDelta as number)
          : 0;
      const explanation =
        typeof (payload as { explanation?: unknown }).explanation === "string"
          ? ((payload as { explanation?: string }).explanation as string)
          : scoreDelta === 0
            ? "This addition was saved, but it did not change the score."
            : "Baseline update applied.";
      const matchedRequirement =
        typeof (payload as { matchedRequirement?: unknown }).matchedRequirement === "string"
          ? ((payload as { matchedRequirement?: string }).matchedRequirement as string)
          : null;
      setBaselineDetails((current) => ({ ...current, [primaryBaselineId]: persistedBaseline }));
      setBaselineList((current) =>
        current.map((item) => (item.id === primaryBaselineId ? { ...item, ...persistedBaseline } : item)),
      );

      publishBaselineUpdated({ baselineId: primaryBaselineId, source: "baseline" });
      const feedbackMessage =
        changeClassification === "no_change_duplicate"
          ? "No changes made. This experience is already represented."
          : changeClassification === "new_signal_added"
            ? "Signal added. New experience included."
            : scoreDelta > 0
              ? "Signal improved. We strengthened how this experience is described."
              : "Saved. We'll incorporate this as more evidence becomes available.";

      setStrengtheningFeedbackBySignalId((current) => ({
        ...current,
        [activeStrengtheningSignal?.id ?? "unknown"]: {
          classification: changeClassification,
          message: matchedRequirement ? `${feedbackMessage} (${matchedRequirement})` : feedbackMessage,
          scoreDelta,
        },
      }));
      closeStrengtheningModal();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Unable to save this baseline update right now.";
      setStrengtheningSaveError(message);
    } finally {
      setSavingStrengtheningProposal(false);
    }
  }, [
    activeStrengtheningSignal?.id,
    baselineDetails,
    baselineList,
    closeStrengtheningModal,
    pendingStrengtheningProposal,
    primaryBaselineId,
    strengtheningAnswer,
  ]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (isUploading) return;
      const shouldPromoteToCurrent = !primaryBaselineId;

      if (baselineDebugEnabled) {
        console.debug("[BaselineStudioHome] upload handler entered", {
          filename: file.name,
          size: file.size,
          isUploading,
          canReplaceActiveBaseline,
        });
      }

      setIsUploading(true);
      setUploadError(null);
      setPageError(null);
      setDuplicateError(null);
      setCapacityError(null);
      setInsufficientTextError(null);
      setUploadSuccessId(null);
      setHighlightedBaselineId(null);
      setPostUploadCtaBaselineId(null);

      try {
        if (baselineDebugEnabled) {
          console.debug("[BaselineStudioHome] upload file accepted", {
            filename: file.name,
            size: file.size,
            type: file.type,
          });
        }
        const formData = new FormData();
        formData.append("file", file);

        if (baselineDebugEnabled) {
          console.log("[UPLOAD][REQUEST]", { filename: file.name, size: file.size });
        }

        const response = await fetch("/api/baselines", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const payload = await readResponsePayload(response);

        if (baselineDebugEnabled) {
          console.log("[UPLOAD][RESPONSE]", { status: response.status, ok: response.ok });
        }

        if (!response.ok) {
          const compliance = parseComplianceError({ status: response.status, payload });
          if (compliance?.type === "insufficient_extracted_text") {
            setInsufficientTextError(compliance);
            return;
          }

          const duplicateMessage = getDuplicateUploadMessage(payload);
          if (duplicateMessage) {
            try {
              const latestBaselines = await refreshBaselineLibrary();
              const matchingBaseline =
                latestBaselines.find((baseline) => baseline.originalFilename === file.name) ??
                latestBaselines[0] ??
                null;

              if (matchingBaseline) {
                setHighlightedBaselineId(matchingBaseline.id);
                if (matchingBaseline.status !== "ARCHIVED") {
                  setPrimaryBaselineId((current) => (current ? current : matchingBaseline.id));
                }
              }
            } catch (refreshError) {
              console.error("Unable to refresh Baseline Library after duplicate upload", refreshError);
            }

            setDuplicateError("This resume is already in your Baseline Library.");
            return;
          }

          const capMessage = getLibraryCapMessage(payload);
          if (capMessage) {
            setCapacityError(capMessage);
            return;
          }

          const fallbackMessage =
            typeof payload === "object" && payload !== null
              ? (payload as Record<string, unknown>).message ??
                (payload as Record<string, unknown>).error
              : undefined;
          setUploadError(
            typeof fallbackMessage === "string"
              ? fallbackMessage
              : "Unable to upload resume right now.",
          );
          return;
        }

        const baselineRecord = getUploadedBaselineRecord(payload);
        if (!baselineRecord) {
          setUploadError("Unable to upload resume right now.");
          return;
        }

        if (baselineDebugEnabled) {
          console.debug("[BaselineStudioHome] upload persisted", {
            uploadedBaselineId: baselineRecord.id,
            originalFilename: baselineRecord.originalFilename,
          });
        }

        setBaselineList((current) => [
          baselineRecord,
          ...current.filter((item) => item.id !== baselineRecord.id),
        ]);
        setPrimaryBaselineId((current) => (current ? current : baselineRecord.id));
        setUploadSuccessId(baselineRecord.id);
        setHighlightedBaselineId(baselineRecord.id);
        setPostUploadCtaBaselineId(baselineRecord.id);

        if (baselineDebugEnabled) {
          console.debug("[BaselineStudioHome] upload baseline ready for analysis", {
            uploadedBaselineId: baselineRecord.id,
            status: baselineRecord.status,
            latestBaselineScore: baselineRecord.latestBaselineScore ?? null,
            latestAssessmentSummary: baselineRecord.latestAssessmentSummary ?? null,
          });
        }

        const analysisResponse = await fetch("/api/baselines/analyze", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baselineId: baselineRecord.id }),
        });

        if (baselineDebugEnabled) {
          console.debug("[BaselineStudioHome] upload analyze request issued", {
            uploadedBaselineId: baselineRecord.id,
            requestPath: "/api/baselines/analyze",
          });
        }

        try {
          const analysisPayload = (await readResponsePayload(analysisResponse)) as ErrorPayload | null;
          if (!analysisResponse.ok) {
            if (baselineDebugEnabled) {
              console.debug("[BaselineStudioHome] upload analyze failed", {
                uploadedBaselineId: baselineRecord.id,
                status: analysisResponse.status,
                payload: analysisPayload,
              });
            }
            // Upload already succeeded; keep this non-fatal and do not show an "Upload failed" banner.
            setPageError(
              typeof analysisPayload?.message === "string"
                ? analysisPayload.message
                : "Upload succeeded, but analysis did not complete successfully.",
            );
          } else if (process.env.NODE_ENV !== "production") {
            console.debug("[BaselineStudioHome] upload analysis complete", {
              uploadedBaselineId: baselineRecord.id,
              hasCompletedAssessment:
                analysisPayload?.latestAssessmentSummary?.hasCompletedAssessment ?? false,
              latestFitScore: analysisPayload?.latestAssessmentSummary?.latestFitScore ?? null,
            });
          }
        } catch (analysisError) {
          console.error("[BaselineStudioHome] upload analyze unexpected failure", analysisError);
          setPageError("Upload succeeded, but analysis did not complete successfully.");
        }

        try {
          await refreshBaselineLibrary();
        } catch (refreshError) {
          console.error("Unable to refresh Baseline Library after upload", refreshError);
          setPageError("Upload succeeded, but the Baseline Library could not be refreshed right now.");
        }
        if (shouldPromoteToCurrent) {
          await fetchBaselineDetails(baselineRecord.id);
        }
      } catch (uploadError) {
        console.error("Upload failed", uploadError);
        setUploadError("Unable to upload resume right now.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [
      baselineDebugEnabled,
      canReplaceActiveBaseline,
      fetchBaselineDetails,
      isUploading,
      primaryBaselineId,
      refreshBaselineLibrary,
    ],
  );

  const handleSetCurrentBaseline = useCallback(
    async (baselineId: string) => {
      if (loadingBaselineId === baselineId) return;
      setLoadingBaselineId(baselineId);
      setPageError(null);

      try {
        const updatedBaseline = await setCurrentBaseline(baselineId);

        // Reconcile from the canonical backend response, then rehydrate from the server.
        setBaselineList((current) =>
          current.map((item) =>
            item.id === updatedBaseline.id
              ? {
                  ...item,
                  ...updatedBaseline,
                  isActive: true,
                  status: "ACTIVE",
                  archivedAt: null,
                }
              : item.status === "ARCHIVED"
                ? item
                : { ...item, isActive: false },
          ),
        );
        setBaselineDetails((current) => ({
          ...current,
          [updatedBaseline.id]: {
            ...(current[updatedBaseline.id] ?? {}),
            ...updatedBaseline,
            isActive: true,
            status: "ACTIVE",
            archivedAt: null,
          },
        }));
        setPrimaryBaselineId(updatedBaseline.id);
        publishBaselineUpdated({ baselineId: updatedBaseline.id, source: "baseline" });

        try {
          await refreshBaselineLibrary();
        } catch (refreshError) {
          console.error("Unable to refresh baseline library after setting current", refreshError);
        }
      } catch (setCurrentError) {
        console.error("Unable to set current baseline", {
          baselineId,
          setCurrentError,
        });
        if (setCurrentError instanceof BaselineMutationError && setCurrentError.status === 404) {
          try {
            await refreshBaselineLibrary();
          } catch (refreshError) {
            console.error("Unable to refresh baseline library after missing baseline on set current", refreshError);
          }
          return;
        }
        setPageError(describeBaselineMutationError(setCurrentError, "set current"));
      } finally {
        setLoadingBaselineId(null);
      }
    },
    [loadingBaselineId, refreshBaselineLibrary],
  );

  const handleArchiveBaseline = useCallback(
    async (baselineId: string) => {
      if (archivingBaselineId === baselineId) return;
      setArchivingBaselineId(baselineId);
      setPageError(null);

      try {
        if (process.env.NODE_ENV !== "production") {
          console.log("[BASELINE_UI][LIST_BEFORE]", baselineList.map((b) => ({ id: b.id, status: b.status, isActive: b.isActive })));
        }
        const archived = await archiveBaseline(baselineId);

        const remainingBaselines = activeBaselines.filter((item) => item.id !== baselineId);
        const nextPrimaryId =
          primaryBaselineId === baselineId ? remainingBaselines[0]?.id ?? null : primaryBaselineId;

        setBaselineList((current) => {
          const next = current.map((item) =>
            item.id === baselineId
              ? {
                  ...item,
                  status: archived.status ?? "ARCHIVED",
                  archivedAt: archived.archivedAt ?? new Date().toISOString(),
                  isActive: archived.isActive ?? false,
                }
              : item,
          );
          if (process.env.NODE_ENV !== "production") {
            console.log("[BASELINE_UI][ARCHIVE_SUCCESS]", { baselineId });
            console.log("[BASELINE_UI][LIST_AFTER]", next.map((b) => ({ id: b.id, status: b.status, isActive: b.isActive })));
          }
          return next;
        });
        setBaselineDetails((current) => {
          const next = { ...current };
          delete next[baselineId];
          return next;
        });
        setPostUploadCtaBaselineId((current) => (current === baselineId ? null : current));
        setUploadSuccessId((current) => (current === baselineId ? null : current));
        setPrimaryBaselineId(nextPrimaryId);

        publishBaselineUpdated({ baselineId, source: "baseline" });
        try {
          await refreshBaselineLibrary();
        } catch (refreshError) {
          console.error("Unable to refresh baseline library after archive", refreshError);
        }
      } catch (archiveError) {
        console.error("Unable to archive baseline", {
          baselineId,
          archiveError,
        });
        if (archiveError instanceof BaselineMutationError && archiveError.status === 404) {
          try {
            await refreshBaselineLibrary();
          } catch (refreshError) {
            console.error("Unable to refresh baseline library after missing baseline on archive", refreshError);
          }
          return;
        }
        setPageError(describeBaselineMutationError(archiveError, "archive"));
      } finally {
        setArchivingBaselineId(null);
      }
    },
    [activeBaselines, archivingBaselineId, baselineList, primaryBaselineId, refreshBaselineLibrary],
  );

  const triggerUploadClick = useCallback(() => {
    if (isUploading || !isEditableLibrary) return;
    if (baselineDebugEnabled) {
      console.debug("[BaselineStudioHome] upload CTA clicked", {
        isUploading,
        isEditableLibrary,
        canReplaceActiveBaseline,
      });
    }
    fileInputRef.current?.click();
  }, [
    baselineDebugEnabled,
    canReplaceActiveBaseline,
    isEditableLibrary,
    isUploading,
  ]);

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isUploading) return;
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      if (baselineDebugEnabled) {
        console.debug("[BaselineStudioHome] upload surface drop", {
          filename: file.name,
          size: file.size,
          type: file.type,
        });
      }
      await handleUpload(file);
    },
    [baselineDebugEnabled, canReplaceActiveBaseline, handleUpload, isUploading],
  );

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (baselineDebugEnabled) {
        console.debug("[BaselineStudioHome] upload file input changed", {
          hasFile: Boolean(file),
          filename: file?.name ?? null,
          size: file?.size ?? null,
          type: file?.type ?? null,
        });
      }
      if (!file) return;
      await handleUpload(file);
    },
    [baselineDebugEnabled, handleUpload],
  );

  useEffect(() => {
    const unsubscribe = subscribeBaselineUpdated(async (detail) => {
      try {
        const latestBaselines = await refreshBaselineLibrary();
        const targetBaselineId = detail.baselineId?.trim() ?? "";
        const hasTarget = targetBaselineId
          ? latestBaselines.some((baseline) => baseline.id === targetBaselineId)
          : false;
        const fallbackBaselineId =
          latestBaselines.find((baseline) => baseline.status !== "ARCHIVED")?.id ?? null;

        if (hasTarget && targetBaselineId) {
          await fetchBaselineDetails(targetBaselineId);
        } else if (
          primaryBaselineId &&
          latestBaselines.some((baseline) => baseline.id === primaryBaselineId)
        ) {
          await fetchBaselineDetails(primaryBaselineId);
        } else if (fallbackBaselineId) {
          await fetchBaselineDetails(fallbackBaselineId);
        }

      } catch (syncError) {
        console.error("Unable to synchronize baseline updates", syncError);
      }
    });

    return unsubscribe;
  }, [fetchBaselineDetails, primaryBaselineId, refreshBaselineLibrary]);

  useEffect(() => {
    const refetchFromServer = () => {
      void refreshBaselineLibrary();
    };

    window.addEventListener("focus", refetchFromServer);
    window.addEventListener("pageshow", refetchFromServer);

    return () => {
      window.removeEventListener("focus", refetchFromServer);
      window.removeEventListener("pageshow", refetchFromServer);
    };
  }, [refreshBaselineLibrary]);

  useEffect(() => {
    if (!baselineUpdatedNotice) return;
    const timer = window.setTimeout(() => setBaselineUpdatedNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [baselineUpdatedNotice]);

  return (
    <div
      className="mx-auto w-full max-w-6xl px-6 2xl:px-8"
      data-baseline-renderer="studio-home"
      data-baseline-build="archive-e2e-v1"
      data-baseline-mode={isEditableLibrary ? "editable" : "readonly"}
      data-current-baseline-id={currentBaselineId ?? primaryBaselineId ?? ""}
      data-library-baseline-ids={libraryBaselines.map((baseline) => baseline.id).join(",")}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={onFileChange}
        disabled={isUploading || !canReplaceActiveBaseline}
        data-testid="baseline-upload-input"
      />
      <div className="flex flex-col gap-6">
        {capacityError || duplicateError || insufficientTextError || uploadError ? (
          <section
            className="rounded-[18px] border border-rose-300/20 bg-rose-500/10 px-4 py-4 text-slate-100"
            data-testid="baseline-upload-error"
          >
            <p className="text-sm font-semibold">
              {capacityError
                ? "Upload unavailable"
                  : duplicateError
                    ? "Resume already uploaded"
                  : insufficientTextError
                    ? "We couldn't read enough text from that file"
                    : "Upload failed"}
            </p>
            <p className="mt-1 text-sm text-slate-200">
              {capacityError ??
                duplicateError ??
                (insufficientTextError
                  ? "Try re-exporting your resume as a text-based PDF or upload a DOCX."
                  : uploadError)}
            </p>
            {insufficientTextError?.details?.tips?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-200">
                {insufficientTextError.details.tips.slice(0, 3).map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {pageError ? (
          <Alert intent="error" title="Something went wrong">
            <p className="text-sm text-current">{pageError}</p>
          </Alert>
        ) : null}
        {!hasCurrentActiveBaseline ? (
          <section className="rounded-[28px] bg-slate-900/40 p-6 md:p-8">
            <div className="max-w-3xl space-y-5">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[34px]">
                  Upload your resume to get started
                </h1>
                <p className="text-base leading-7 text-slate-300">
                  Upload the resume you want to work from. We convert it into a baseline used for scoring and tailored documents.
                </p>
                <p className="text-sm leading-6 text-slate-400">Upload your resume to create your baseline.</p>
              </div>
              <div
                className="rounded-[18px] border border-dashed border-white/20 bg-slate-950/35 px-4 py-4 transition"
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                data-testid="baseline-upload-surface"
                id="baseline-upload"
              >
                <div className="space-y-3">
                  <FormButton
                    onClick={triggerUploadClick}
                    disabled={isUploading || !canReplaceActiveBaseline || !isEditableLibrary}
                    className="bg-indigo-600 text-white hover:bg-indigo-500"
                  >
                    {isEditableLibrary
                      ? isUploading
                        ? "Uploading..."
                        : heroState === "no_baseline"
                          ? "Upload resume"
                          : "Upload another resume"
                      : "Upload unavailable"}
                  </FormButton>
                  <p className="text-sm text-slate-300">
                    {heroState === "no_baseline"
                      ? "Upload resume or drag and drop a PDF or DOCX here."
                      : "Upload another resume to create another baseline."}
                  </p>
                  <p className="text-sm text-slate-400">Accepted file types: PDF and DOCX</p>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    {activeBaselines.length} active baselines
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {currentActiveBaseline ? (
          <section
            className="space-y-4 rounded-[22px] border border-white/10 bg-slate-900/25 p-5"
            data-testid="baseline-current-section"
          >
            <header className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">Current baseline</h2>
              <p className="text-sm text-slate-400">
                This baseline is your current experience foundation for targeting roles.
              </p>
            </header>
            <article
              className="rounded-[16px] border border-white/10 bg-slate-950/30 p-4"
              data-testid={`baseline-current-card:${primaryBaseline.id}`}
            >
              <ResumeWithBaselineStatus
                filename={currentActiveBaseline.originalFilename}
                isReadyForTargeting
                isActiveBaseline
                showNeedsReviewBadge={false}
                readinessScore={currentActiveBaseline.latestBaselineScore ?? null}
                accepted={true}
                targetReady={true}
                studioReady={false}
                highConfidence={false}
              />
                <p className="mt-1 text-xs text-slate-400">{activeBaselineVersionLabel}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Created from: {currentActiveBaseline.originalFilename}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <FormButton
                    onClick={() => router.push(targetRoleHref)}
                    className="bg-cyan-400/10 uppercase text-cyan-50 hover:bg-cyan-400/15"
                  >
                    {TARGET_ROLE_CTA_LABEL}
                  </FormButton>
                  <Link
                    href={baselineDetailsHref}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase text-slate-100 transition hover:bg-white/10"
                  >
                    View baseline details
                  </Link>
                  <FormButton
                    variant="ghost"
                    onClick={triggerUploadClick}
                    disabled={isUploading || !canReplaceActiveBaseline || !isEditableLibrary}
                    className="uppercase border-white/10 bg-transparent text-slate-300 hover:border-white/20 hover:text-slate-100"
                  >
                    {isEditableLibrary ? "Upload another resume" : "Upload unavailable"}
                  </FormButton>
                </div>
            </article>
          </section>
        ) : null}
        <details
          className="rounded-[22px] border border-white/10 bg-slate-900/25 p-5"
          open={!primaryBaseline}
        >
          <summary className="cursor-pointer text-lg font-semibold text-slate-100">
            What is a baseline?
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">How it works</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">You upload a resume (a file).</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                We convert it into a structured baseline (the data we actually use).
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Your current baseline is the one used when you target roles.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Why not just use the resume file?
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Resumes are written for people, not systems.</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                The baseline translates your resume into a format that can be analyzed, scored, and reused across every job you target.
              </p>
            </div>
          </div>
        </details>
        {activeBaselines.length > 0 ? (
          <section className="space-y-4 rounded-[22px] border border-white/10 bg-slate-900/25 p-5">
            <header className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                {baselineLibrarySectionTitle}
              </h2>
              <p className="text-sm text-slate-400">
                Uploading a resume creates a baseline. Set one as current to use across the app.
              </p>
            </header>
            <div className="space-y-3" data-testid="baseline-library-section">
              {libraryBaselines.map((baseline) => {
                const isArchived = baseline.status === "ARCHIVED";
                const isCurrentBaseline = baseline.isActive === true;

                const isLoading = loadingBaselineId === baseline.id;
                const setActiveDisabled = isLoading || isArchived || !isHydrated;
                const actionFlags = getBaselineCardActionFlags({
                  isCurrentBaseline,
                  isEditable: isEditableLibrary,
                  targetReady: false,
                  isArchived,
                });
                const baselineDetailsHref = getBaselineDetailsHref(baseline.id);

                return (
                  <article
                    key={baseline.id}
                    data-testid={`baseline-library-card:${baseline.id}`}
                    data-archive-enabled={actionFlags.showArchive ? "true" : "false"}
                    className={`rounded-[16px] border p-4 ${
                      uploadSuccessId === baseline.id || highlightedBaselineId === baseline.id
                        ? "border-cyan-300/20 bg-cyan-400/[0.04]"
                        : "border-white/10 bg-slate-950/30"
                    }`}
                  >
                    <ResumeWithBaselineStatus
                      filename={baseline.originalFilename}
                      isReadyForTargeting={false}
                      showNeedsReviewBadge={true}
                      readinessScore={baseline.latestBaselineScore ?? null}
                      accepted={baseline.capability?.accepted ?? false}
                      targetReady={false}
                      studioReady={baseline.capability?.studioReady ?? false}
                      highConfidence={baseline.capability?.highConfidence ?? false}
                    />
                    <p className="mt-1 text-xs text-slate-500">Created from: {baseline.originalFilename}</p>
                    <p className="mt-2 text-xs text-slate-400">Uploaded {formatDateTime(baseline.createdAt)}</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <FormButton
                          onClick={() => handleSetCurrentBaseline(baseline.id)}
                          disabled={setActiveDisabled}
                          className="bg-indigo-600 uppercase text-white hover:bg-indigo-500"
                        >
                          {formatCardActionLabel("Set current")}
                        </FormButton>
                        <Link
                          href={baselineDetailsHref}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase text-slate-100 transition hover:bg-white/10"
                        >
                          {formatCardActionLabel("View baseline details")}
                        </Link>
                        {isReadyBaseline ? (
                          <FormButton
                            variant="ghost"
                            onClick={() => handleSetCurrentBaseline(baseline.id)}
                            disabled={setActiveDisabled}
                            className="uppercase"
                          >
                            {formatCardActionLabel("Set current")}
                          </FormButton>
                        ) : null}
                        {actionFlags.showArchive ? (
                          <FormButton
                            variant="ghost"
                            onClick={() => void handleArchiveBaseline(baseline.id)}
                            disabled={archivingBaselineId === baseline.id || isArchived}
                            className="uppercase"
                            data-testid={`baseline-library-archive:${baseline.id}`}
                          >
                            {archivingBaselineId === baseline.id ? "Archiving..." : "Archive"}
                          </FormButton>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
              {libraryBaselines.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No other baselines yet. Upload another resume to create one.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
        {analysisReady ? (
          <section className="space-y-3 rounded-[20px] border border-white/10 bg-slate-900/20 p-5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">Baseline readiness</h2>
            <p className="text-sm leading-6 text-slate-300">{certification.summary}</p>
            <details className="rounded-[14px] border border-white/10 bg-slate-950/30 px-4 py-3" open>
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                View readiness details
              </summary>
              <div className="mt-3 grid gap-2">
                {certification.checklist.map((item) => (
                  <p key={item.label} className="text-sm text-slate-300">
                    {item.label}: {item.value}
                  </p>
                ))}
              </div>
            </details>
          </section>
        ) : null}

        {analysisReady ? (
          <div className="space-y-6 pt-4">
            <section
              ref={analysisSectionRef}
              className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,6,23,0.96))] p-5 shadow-[0_18px_50px_rgba(2,6,23,0.22)]"
            >
              <header className="space-y-2 border-b border-white/10 pb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  SIGNAL GRAPH
                </p>
                <h2
                  ref={analysisHeadingRef}
                  tabIndex={-1}
                  className="text-2xl font-semibold tracking-tight text-slate-100 outline-none"
                >
                  Professional Signals Diagnosis
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-slate-300">
                  Your current baseline emits a set of professional signals. Strong signals improve targeting outcomes while developing signals indicate where signal clarity should improve next.
                </p>
              </header>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <article className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Signals Detected</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {signalGraph.identifiedSignalCount}
                  </p>
                </article>
                <article className="rounded-[18px] border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">Strong Signals</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-100">{signalGraph.strongSignalCount}</p>
                </article>
                <article className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Developing Signals</p>
                  <p className="mt-2 text-3xl font-bold text-white">{signalGraph.developingSignalCount}</p>
                </article>
              </div>

              <article className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Developing Signals
                </p>
                {signalGraph.developingSignals.length > 0 ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {signalGraph.developingSignals.map((signal) => (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => openStrengtheningModal(signal.id)}
                        className="text-left"
                      >
                        <SignalPill label={signal.label} tone="developing" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-emerald-100">
                    Your current baseline signals are already well developed.
                  </p>
                )}
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-12">
              <article className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,6,23,0.94))] p-5 shadow-[0_18px_50px_rgba(2,6,23,0.2)] xl:col-span-7">
                <header className="space-y-2 border-b border-white/10 pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Baseline Strengthening
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
                    Strengthen developing signals with structured input
                  </h2>
                </header>
                <div className="mt-5 space-y-4">
                  {approvedSignalAdditions.length ? (
                    <article className="rounded-[20px] border border-cyan-300/20 bg-cyan-400/[0.08] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
                        Saved baseline updates
                      </p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-100">
                        {approvedSignalAdditions.slice(-4).reverse().map((entry, index) => (
                          <li key={`${entry}-${index}`}>• {entry}</li>
                        ))}
                      </ul>
                    </article>
                  ) : null}
                  {signalGraph.developingSignals.length === 0 ? (
                    <article className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/[0.08] p-4">
                      <p className="text-base font-semibold text-emerald-100">
                        Your current baseline signals are already well developed.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">
                        Reanalyze after future updates, or move into TARGET to apply your certified signal set.
                      </p>
                    </article>
                  ) : null}
                  {signalGraph.developingSignals.map((signal) => (
                    <article
                      key={signal.id}
                      className="rounded-[20px] border border-white/10 bg-slate-950/40 p-4"
                    >
                      <p className="text-base font-semibold text-slate-100">{signal.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {STRENGTHENING_PROMPTS[signal.id].whyMatters}
                      </p>
                      {strengtheningFeedbackBySignalId[signal.id] ? (
                        <div
                          data-testid={`baseline-strengthening-feedback-${signal.id}`}
                          className="mt-3 rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100"
                        >
                          {strengtheningFeedbackBySignalId[signal.id].message}
                        </div>
                      ) : null}
                      <div className="mt-4">
                        <FormButton onClick={() => openStrengtheningModal(signal.id)}>
                          Strengthen This Signal
                        </FormButton>
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <article className="rounded-[28px] border border-white/10 bg-slate-900/35 p-5 xl:col-span-5">
                <header className="space-y-2 border-b border-white/10 pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Career Gravity
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
                    Progressive insight
                  </h2>
                </header>
                <div className="mt-5">
                  {careerGravity.unlocked ? (
                    <>
                      <p className="text-sm leading-6 text-slate-300">
                        Your experience clusters strongly around:
                      </p>
                      <div className="mt-4 rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
                        <p className="text-base font-semibold leading-7 text-slate-100">
                          {gravitySummary || "Professional signal clarity is still forming."}
                        </p>
                      </div>
                      <div className="mt-5">
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
                      <p className="text-sm font-semibold text-slate-100">Career Gravity is locked</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Unlocks after 3 role analyses.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Run more role analyses to reveal where your background clusters most strongly in the market.
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                        {careerGravity.progressText}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            </section>
          </div>
        ) : null}

        {activeStrengtheningSignal ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Strengthen Signal"
          >
            <article className="w-full max-w-2xl rounded-[24px] border border-white/10 bg-slate-900 p-6 shadow-[0_30px_80px_rgba(2,6,23,0.5)]">
              <header className="space-y-2 border-b border-white/10 pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Baseline Strengthening
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                  {activeStrengtheningSignal.label}
                </h2>
                <p className="text-sm leading-6 text-slate-300">
                  {STRENGTHENING_PROMPTS[activeStrengtheningSignal.id].question}
                </p>
              </header>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Your input
                  </span>
                  <textarea
                    value={strengtheningAnswer}
                    onChange={(event) => setStrengtheningAnswer(event.target.value)}
                    rows={5}
                    className="mt-2 w-full rounded-[16px] border border-white/10 bg-slate-950/45 px-3 py-2 text-sm leading-6 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-300/30"
                    placeholder="Add concrete evidence to strengthen this professional signal."
                  />
                </label>

                {pendingStrengtheningProposal ? (
                  <div className="rounded-[18px] border border-cyan-300/20 bg-cyan-400/[0.08] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
                      Proposed baseline update
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-100">
                      {pendingStrengtheningProposal}
                    </p>
                  </div>
                ) : null}
                {strengtheningSaveError ? (
                  <Alert intent="error" title="Unable to save update">
                    <p className="text-sm text-current">{strengtheningSaveError}</p>
                  </Alert>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  {!pendingStrengtheningProposal ? (
                    <FormButton
                      onClick={handleGenerateStrengtheningProposal}
                      disabled={!strengtheningAnswer.trim() || savingStrengtheningProposal}
                    >
                      Generate Proposed Update
                    </FormButton>
                  ) : (
                    <FormButton onClick={() => void handleApproveStrengtheningProposal()} disabled={savingStrengtheningProposal}>
                      {savingStrengtheningProposal ? "Saving..." : "Approve and Apply"}
                    </FormButton>
                  )}
                  <FormButton variant="ghost" onClick={closeStrengtheningModal} disabled={savingStrengtheningProposal}>
                    {pendingStrengtheningProposal ? "Cancel" : "Close"}
                  </FormButton>
                </div>
              </div>
            </article>
          </div>
        ) : null}

      </div>
    </div>
  );
}




