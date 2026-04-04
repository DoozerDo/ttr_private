"use client";

import Link from "next/link";
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
  isBaselineAnalyzedFromSummary,
  getLatestRoleAnalysisFitScore,
  type BaselineAssessmentSummaryDto,
  type BaselineDto,
} from "@/lib/baselines";
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
import { BETA_BASELINE_UPLOAD_LIMIT } from "@/src/features/baseline/constants";
import { getBaselineDetailsHref } from "@/src/navigation/routes";
import { CareerGravity } from "../results/components/CareerGravity";

type BaselineStudioHomeProps = {
  baselines: BaselineDto[];
  libraryMode?: "editable" | "readonly";
};

type ErrorPayload = {
  message?: unknown;
  latestAssessmentSummary?: BaselineAssessmentSummaryDto;
};

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
  return sortBaselinesNewestFirst(baselines).find((baseline) => baseline.status !== "ARCHIVED")?.id ?? null;
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
      ? ((data as { message?: unknown }).message as string)
      : null;

  if (
    duplicateCode !== "BASELINE_DUPLICATE" &&
    duplicateCode !== "CONFLICT" &&
    topLevelMessage !== "This file has already been uploaded."
  ) {
    return null;
  }

  return (typeof errorBody?.message === "string" ? errorBody.message : topLevelMessage) ??
    "This file has already been uploaded.";
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

function getBaselineReadinessState({
  hasCompletedAssessment,
  isAnalyzing,
}: {
  hasCompletedAssessment: boolean;
  isAnalyzing: boolean;
}): BaselineReadinessState {
  if (isAnalyzing) return "ANALYZING";
  if (hasCompletedAssessment) return "READY";
  return "NOT_ANALYZED";
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

function buildBaselineReadinessContract({
  baselineId,
  summary,
  isAnalyzing = false,
}: {
  baselineId: string | null;
  summary?: BaselineAssessmentSummaryDto | null;
  isAnalyzing?: boolean;
}): BaselinePageReadinessContract {
  const hasCompletedAssessment = isBaselineAnalyzedFromSummary(summary);
  const latestAssessmentId = summary?.latestAssessmentId?.trim() ?? null;
  const latestAssessmentCreatedAt = summary?.latestAssessmentCreatedAt?.trim() ?? null;
  const latestFitScore = getLatestRoleAnalysisFitScore(summary);
  const readinessState = getBaselineReadinessState({
    hasCompletedAssessment,
    isAnalyzing,
  });

  return {
    activeBaselineId: baselineId,
    baselineId,
    hasCompletedAssessment,
    latestAssessmentId,
    latestAssessmentCreatedAt,
    latestFitScore,
    readinessState,
  };
}

function createBaselineUpdateProposal(signalLabel: string, answer: string) {
  return `${signalLabel}: ${answer.trim()}`;
}

function formatCardActionLabel(label: string) {
  return label.toUpperCase();
}

function extractApprovedSignalAdditions(baseline: BaselineDto | null): string[] {
  if (!baseline?.sections?.length) return [];
  const refinementSections = baseline.sections
    .filter((section) => (section.title ?? "").trim().toLowerCase() === "approved signal refinements")
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  if (!refinementSections.length) return [];

  const lines: string[] = [];
  for (const section of refinementSections) {
    const content = typeof section.content === "string" ? section.content : "";
    content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => lines.push(line.replace(/^[-*•]\s*/, "")));
  }
  return lines;
}

export function BaselineStudioHome({ baselines, libraryMode = "editable" }: BaselineStudioHomeProps) {
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
  const [strengtheningSuccessMessage, setStrengtheningSuccessMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessId, setUploadSuccessId] = useState<string | null>(null);
  const [highlightedBaselineId, setHighlightedBaselineId] = useState<string | null>(null);
  const [postUploadCtaBaselineId, setPostUploadCtaBaselineId] = useState<string | null>(null);
  const [baselineUpdatedNotice, setBaselineUpdatedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [insufficientTextError, setInsufficientTextError] =
    useState<ParsedInsufficientExtractedTextError | null>(null);
  const [archivingBaselineId, setArchivingBaselineId] = useState<string | null>(null);
  const [loadingBaselineId, setLoadingBaselineId] = useState<string | null>(null);
  const [analysisRunsByBaselineId, setAnalysisRunsByBaselineId] = useState<Record<string, number>>({});
  const [completedRoleAnalyses, setCompletedRoleAnalyses] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analysisSectionRef = useRef<HTMLDivElement | null>(null);
  const analysisHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const allBaselines = useMemo(() => sortBaselinesNewestFirst(baselineList), [baselineList]);
  const activeBaselines = useMemo(
    () => allBaselines.filter((baseline) => baseline.status !== "ARCHIVED"),
    [allBaselines],
  );
  const uploadLimitReached = activeBaselines.length >= BETA_BASELINE_UPLOAD_LIMIT;
  const isEditableLibrary = libraryMode === "editable";

  useEffect(() => {
    setIsHydrated(true);
  }, []);

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

  const primaryBaselineReadiness = useMemo(
    () =>
      buildBaselineReadinessContract({
        baselineId: primaryBaseline?.id ?? primaryBaselineId ?? null,
        summary: primaryBaseline?.latestAssessmentSummary ?? null,
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
  const hasCompletedAnalysis = primaryBaselineReadiness.hasCompletedAssessment;
  const latestFitScore = getLatestRoleAnalysisFitScore(latestAssessmentSummary);
  const latestAssessmentId = latestAssessmentSummary?.latestAssessmentId?.trim() ?? null;
  const latestAssessmentCreatedAt = latestAssessmentSummary?.latestAssessmentCreatedAt?.trim() ?? null;
  const latestResultsHref = latestAssessmentId
    ? `/results?assessmentId=${encodeURIComponent(latestAssessmentId)}`
    : null;
  const baselineDetailsHref = primaryBaselineId ? getBaselineDetailsHref(primaryBaselineId) : "/baseline";
  const targetRoleHref = primaryBaselineId ? `/target?baselineId=${encodeURIComponent(primaryBaselineId)}` : "/target";
  const studioHref = latestAssessmentId
    ? `/studio?assessmentId=${encodeURIComponent(latestAssessmentId)}&analysisId=${encodeURIComponent(latestAssessmentId)}${
        primaryBaselineId ? `&baselineId=${encodeURIComponent(primaryBaselineId)}` : ""
      }`
    : null;
  const fitReviewHref = latestResultsHref ? `${latestResultsHref}&locked=1` : "/fit-review";
  const heroState: "no_baseline" | "no_analysis" | "analysis_exists" = useMemo(() => {
    if (!hasBaseline) return "no_baseline";
    if (!hasCompletedAnalysis) return "no_analysis";
    return "analysis_exists";
  }, [hasBaseline, hasCompletedAnalysis]);
  const isValidatedBaselineState = heroState === "analysis_exists";
  const sourceResumesSectionTitle = hasBaseline
    ? isValidatedBaselineState
      ? "Source resumes"
      : "Your resumes"
    : "Uploaded resumes";

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!primaryBaseline) return;
    const baselineRuntimeDebug = {
      baseline: {
        id: primaryBaseline.id,
        fileName: primaryBaseline.originalFilename,
        isExpectedBaseline: true,
        selectedAtRuntime: Boolean(primaryBaselineId),
      },
      analysis: {
        id: primaryBaselineReadiness.latestAssessmentId,
        score: primaryBaselineReadiness.latestFitScore,
        hasCompletedAssessment: primaryBaselineReadiness.hasCompletedAssessment,
        readinessState: primaryBaselineReadiness.readinessState,
      },
      decision: {
        finalAction: primaryBaselineReadiness.latestAssessmentId ? "analysis" : "baseline",
        why: primaryBaselineReadiness.latestAssessmentId
          ? "baseline has a completed analysis"
          : "baseline still needs analysis",
      },
    };
    console.debug("baselineRuntimeDebug", baselineRuntimeDebug);
  }, [primaryBaseline, primaryBaselineId, primaryBaselineReadiness]);
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
    setStrengtheningSuccessMessage(null);
    setPendingStrengtheningProposal(createBaselineUpdateProposal(activeStrengtheningSignal.label, trimmed));
  }, [activeStrengtheningSignal, strengtheningAnswer]);

  const fetchBaselineDetails = useCallback(
    async (baselineId: string) => {
      setPrimaryBaselineId(baselineId);
      setLoadingBaselineId(baselineId);
      setError(null);

      try {
        const response = await fetch(`/api/baselines/${encodeURIComponent(baselineId)}`, {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Unable to load baseline analysis right now.");
        }

        const payload = (await response.json()) as BaselineDto;
        setBaselineDetails((current) => ({ ...current, [baselineId]: payload }));
        setPostUploadCtaBaselineId((current) => (current === baselineId ? null : current));
        scrollToAnalysis();
      } catch (fetchError) {
        console.error("Unable to load baseline details", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load baseline analysis right now.",
        );
      } finally {
        setLoadingBaselineId(null);
      }
    },
    [scrollToAnalysis],
  );

  const runCanonicalBaselineAnalysis = useCallback(
    async (baselineId: string) => {
      setPrimaryBaselineId(baselineId);
      setLoadingBaselineId(baselineId);
      setError(null);

      try {
        await fetchBaselineDetails(baselineId);

        const currentSummary =
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
        console.error("Unable to run baseline analysis", runError);
        setError(
          runError instanceof Error
            ? runError.message
            : "Unable to run baseline analysis right now.",
        );
      } finally {
        setLoadingBaselineId(null);
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
    setStrengtheningSuccessMessage(null);

    try {
      const beforeBaseline =
        baselineDetails[primaryBaselineId] ??
        baselineList.find((item) => item.id === primaryBaselineId) ??
        null;
      const previousScore = beforeBaseline?.latestBaselineScore ?? null;
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
      const nextScore = persistedBaseline.latestBaselineScore ?? null;
      const delta = previousScore !== null && nextScore !== null ? nextScore - previousScore : null;
      const deltaLabel =
        delta === null
          ? "No change"
          : delta > 0
            ? `+${delta}%`
            : delta < 0
              ? `${delta}%`
              : "No change";
      const changeSummary =
        (persistedBaseline.sections ?? [])
          .slice(-1)[0]?.title ??
        activeStrengtheningSignal?.label ??
        "Signal strengthened";

      setStrengtheningSuccessMessage(
        scoreDelta === 0
          ? `${explanation} Impact: ${impactType.replace("_", " ")}. Added signal: ${changeSummary}${matchedRequirement ? ` (${matchedRequirement})` : ""}.`
          : `Previous score ${previousScore ?? "--"}%. New score ${nextScore ?? "--"}%. Delta ${deltaLabel}. ${explanation} Impact: ${impactType.replace("_", " ")}. Added signal: ${changeSummary}${matchedRequirement ? ` (${matchedRequirement})` : ""}.`,
      );
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
      if (isUploading || uploadLimitReached) return;

      if (process.env.NODE_ENV !== "production") {
        console.debug("[BaselineStudioHome] upload handler entered", {
          filename: file.name,
          size: file.size,
          isUploading,
          uploadLimitReached,
        });
      }

      setIsUploading(true);
      setError(null);
      setDuplicateError(null);
      setInsufficientTextError(null);
      setUploadSuccessId(null);
      setHighlightedBaselineId(null);
      setPostUploadCtaBaselineId(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/baselines", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const payload = await readResponsePayload(response);

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
                  setPrimaryBaselineId(matchingBaseline.id);
                }
              }
            } catch (refreshError) {
              console.error("Unable to refresh Baseline Library after duplicate upload", refreshError);
            }

            setDuplicateError("This resume is already in your Baseline Library.");
            return;
          }

          const fallbackMessage =
            typeof payload === "object" && payload !== null
              ? (payload as Record<string, unknown>).message ??
                (payload as Record<string, unknown>).error
              : undefined;
          setError(
            typeof fallbackMessage === "string"
              ? fallbackMessage
              : "Unable to upload resume right now.",
          );
          return;
        }

        const baselineRecord = getUploadedBaselineRecord(payload);
        if (!baselineRecord) {
          setError("Unable to upload resume right now.");
          return;
        }

        if (process.env.NODE_ENV !== "production") {
          console.debug("[BaselineStudioHome] upload persisted", {
            uploadedBaselineId: baselineRecord.id,
            originalFilename: baselineRecord.originalFilename,
          });
        }

        setBaselineList((current) => [
          baselineRecord,
          ...current.filter((item) => item.id !== baselineRecord.id),
        ]);
        setPrimaryBaselineId(baselineRecord.id);
        setUploadSuccessId(baselineRecord.id);
        setHighlightedBaselineId(baselineRecord.id);
        setPostUploadCtaBaselineId(baselineRecord.id);

        if (process.env.NODE_ENV !== "production") {
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

        if (process.env.NODE_ENV !== "production") {
          console.debug("[BaselineStudioHome] upload analyze request issued", {
            uploadedBaselineId: baselineRecord.id,
            requestPath: "/api/baselines/analyze",
          });
        }

        const analysisPayload = (await readResponsePayload(analysisResponse)) as ErrorPayload | null;
        if (!analysisResponse.ok) {
          if (process.env.NODE_ENV !== "production") {
            console.debug("[BaselineStudioHome] upload analyze failed", {
              uploadedBaselineId: baselineRecord.id,
              status: analysisResponse.status,
              payload: analysisPayload,
            });
          }
          throw new Error(
            typeof analysisPayload?.message === "string"
              ? analysisPayload.message
              : "Unable to analyze the uploaded resume right now.",
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.debug("[BaselineStudioHome] upload analysis complete", {
            uploadedBaselineId: baselineRecord.id,
            hasCompletedAssessment:
              analysisPayload?.latestAssessmentSummary?.hasCompletedAssessment ?? false,
            latestFitScore: analysisPayload?.latestAssessmentSummary?.latestFitScore ?? null,
          });
        }

        await refreshBaselineLibrary();
        await fetchBaselineDetails(baselineRecord.id);
      } catch (uploadError) {
        console.error("Upload failed", uploadError);
        setError("Unable to upload resume right now.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [isUploading, refreshBaselineLibrary, uploadLimitReached],
  );

  const handleArchiveBaseline = useCallback(
    async (baselineId: string) => {
      if (archivingBaselineId === baselineId) return;
      setArchivingBaselineId(baselineId);
      setError(null);

      try {
        await archiveBaseline(baselineId);

        const remainingBaselines = activeBaselines.filter((item) => item.id !== baselineId);
        const nextPrimaryId =
          primaryBaselineId === baselineId ? remainingBaselines[0]?.id ?? null : primaryBaselineId;

        setBaselineList((current) =>
          current.map((item) =>
            item.id === baselineId
              ? {
                  ...item,
                  status: "ARCHIVED",
                  archivedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
        setBaselineDetails((current) => {
          const next = { ...current };
          delete next[baselineId];
          return next;
        });
        setPostUploadCtaBaselineId((current) => (current === baselineId ? null : current));
        setUploadSuccessId((current) => (current === baselineId ? null : current));
        setPrimaryBaselineId(nextPrimaryId);
      } catch (archiveError) {
        console.error("Unable to delete baseline", archiveError);
        setError(
          archiveError instanceof Error
            ? archiveError.message
            : "Unable to delete this resume right now.",
        );
      } finally {
        setArchivingBaselineId(null);
      }
    },
    [activeBaselines, archivingBaselineId, primaryBaselineId],
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (uploadLimitReached || isUploading) return;
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      await handleUpload(file);
    },
    [handleUpload, isUploading, uploadLimitReached],
  );

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await handleUpload(file);
    },
    [handleUpload],
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
    <div className="mx-auto w-full max-w-6xl px-6 2xl:px-8">
      <div className="flex flex-col gap-8">
        <section className="rounded-[28px] bg-slate-900/40 p-6 md:p-8">
          <div className="max-w-3xl space-y-5">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[34px]">
                {heroState === "no_baseline"
                  ? "Upload your resume to get started"
                  : heroState === "no_analysis"
                    ? "Your baseline is ready"
                    : "Your baseline is ready"}
              </h1>
              <p className="text-base leading-7 text-slate-300">
                {heroState === "no_baseline"
                  ? "Upload the resume you want to work from. We convert it into a baseline used for scoring and tailored documents."
                  : heroState === "no_analysis"
                    ? "Your resume has been converted into a baseline."
                    : "Your resume has been converted into a baseline."}
              </p>
              <p className="text-sm leading-6 text-slate-400">
                {heroState === "no_baseline"
                  ? "Upload your resume to create your baseline."
                  : heroState === "no_analysis"
                    ? "Your baseline is ready for targeting, but it still needs analysis before it can guide tailored generation."
                    : "This baseline is ready for targeting and tailored document generation."}
              </p>
            </div>
            {isValidatedBaselineState ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={targetRoleHref}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold uppercase text-cyan-50 transition hover:bg-cyan-400/15"
                >
                  Target a role
                </Link>
                <Link
                  href={baselineDetailsHref}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase text-slate-100 transition hover:bg-white/10"
                >
                  View baseline details
                </Link>
              </div>
            ) : (
              <div
                className={`rounded-[18px] border px-4 py-4 transition ${
                  uploadLimitReached
                    ? "border-white/10 bg-slate-950/25"
                    : "border-dashed border-white/20 bg-slate-950/35"
                }`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                data-testid="baseline-upload-surface"
              >
                <div className="space-y-3">
                  <FormButton
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || uploadLimitReached || !isEditableLibrary}
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
                      : "Upload another resume if you want to replace the source file."}
                  </p>
                  <p className="text-sm text-slate-400">Accepted file types: PDF and DOCX</p>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    {activeBaselines.length} of {BETA_BASELINE_UPLOAD_LIMIT} active resumes
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={onFileChange}
                    disabled={isUploading || uploadLimitReached}
                  />
                  {uploadLimitReached ? (
                    <p className="text-sm text-slate-300">
                      Maximum of {BETA_BASELINE_UPLOAD_LIMIT} active resumes reached.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>
        {isValidatedBaselineState ? (
          <section className="space-y-4 rounded-[22px] border border-white/10 bg-slate-900/25 p-5">
            <header className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">Active baseline</h2>
              <p className="text-sm text-slate-400">
                {primaryBaseline?.originalFilename ?? "Your active baseline"} is the validated asset TTR now uses.
              </p>
            </header>
            {primaryBaseline ? (
              <article className="rounded-[16px] border border-white/10 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-100">{primaryBaseline.originalFilename}</p>
                  <span className="rounded-full border border-cyan-300/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-100">
                    Validated baseline
                  </span>
                  <span className="rounded-full border border-emerald-300/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-100">
                    Ready for targeting
                  </span>
                </div>
                {latestAssessmentCreatedAt ? (
                  <p className="mt-2 text-xs text-slate-400">Last analyzed {formatDateTime(latestAssessmentCreatedAt)}</p>
                ) : null}
                {latestFitScore !== null ? (
                  <p className="mt-1 text-xs text-slate-500">Role fit score: {latestFitScore}%</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={targetRoleHref}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold uppercase text-cyan-50 transition hover:bg-cyan-400/15"
                  >
                    Target a role
                  </Link>
                  <Link
                    href={baselineDetailsHref}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase text-slate-100 transition hover:bg-white/10"
                  >
                    View baseline details
                  </Link>
                  {isEditableLibrary ? (
                    <FormButton
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || uploadLimitReached || !isEditableLibrary}
                      className="bg-indigo-600 text-white hover:bg-indigo-500 uppercase"
                    >
                      Upload another resume
                    </FormButton>
                  ) : null}
                </div>
              </article>
            ) : null}
          </section>
        ) : null}
        <section className="rounded-[22px] border border-white/10 bg-slate-900/25 p-5">
          <h2 className="text-lg font-semibold text-slate-100">What is a baseline?</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">What is a baseline?</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">You upload a resume.</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                We convert it into a structured baseline that represents your verified experience.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                This baseline is what we use to score your fit for a role and generate tailored application materials.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Why not just use your resume?
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Resumes are written for people, not systems.</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                The baseline translates your resume into a format that can be analyzed, scored, and reused across every job you target.
              </p>
            </div>
          </div>
        </section>
        {allBaselines.length > 0 ? (
          <section className="space-y-4 rounded-[22px] border border-white/10 bg-slate-900/25 p-5">
            <header className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                {sourceResumesSectionTitle}
              </h2>
              <p className="text-sm text-slate-400">
                {isValidatedBaselineState
                  ? "The source file for the active baseline is shown here without repeating the same record at full weight."
                  : "One resume becomes the active baseline used for scoring and tailored documents."}
              </p>
            </header>
            <div className="space-y-3">
              {allBaselines
                .filter((baseline) => !(isValidatedBaselineState && baseline.id === primaryBaselineId))
                .slice(0, 3)
                .map((baseline) => {
                const isPrimary = primaryBaselineId === baseline.id;
                const isArchived = baseline.status === "ARCHIVED";
                const assessmentSummary = baseline.latestAssessmentSummary;
                const activeBaselineSummary =
                  isPrimary ? primaryBaseline?.latestAssessmentSummary ?? assessmentSummary ?? null : assessmentSummary ?? null;
                const baselineReadiness = buildBaselineReadinessContract({
                  baselineId: baseline.id,
                  summary: activeBaselineSummary,
                  isAnalyzing: loadingBaselineId === baseline.id,
                });
                const hasCompletedAssessment = baselineReadiness.hasCompletedAssessment;
                const isLoading = loadingBaselineId === baseline.id;
                const readinessState = baselineReadiness.readinessState;
                const readinessLabel = getBaselineReadinessLabel(readinessState);
                const canTargetJob = readinessState === "READY";
                const setActiveDisabled = isLoading || isPrimary || isArchived || !isHydrated;
                const latestResultsForBaselineHref = baselineReadiness.latestAssessmentId
                  ? `/results?assessmentId=${encodeURIComponent(baselineReadiness.latestAssessmentId)}`
                  : null;
                const latestAssessmentTimestamp = baselineReadiness.latestAssessmentCreatedAt;
                const latestRoleFitScore =
                  typeof baselineReadiness.latestFitScore === "number"
                    ? Math.max(0, Math.min(100, Math.round(baselineReadiness.latestFitScore)))
                    : null;
                const canOpenStudio = latestRoleFitScore !== null && latestRoleFitScore >= 70;
                const isReadyBaseline = readinessState === "READY" && !isArchived;

                if (process.env.NODE_ENV !== "production") {
                  console.debug("[BaselineStudioHome] library readiness", {
                    baselineId: baseline.id,
                    isPrimary,
                    activeBaselineId: primaryBaselineReadiness.activeBaselineId,
                    hasCompletedAssessment: baselineReadiness.hasCompletedAssessment,
                    readinessState,
                    latestAssessmentId: baselineReadiness.latestAssessmentId,
                    latestAssessmentCreatedAt: baselineReadiness.latestAssessmentCreatedAt,
                  });
                }

                return (
                  <article
                    key={baseline.id}
                    className={`rounded-[16px] border p-4 ${
                      uploadSuccessId === baseline.id || highlightedBaselineId === baseline.id
                        ? "border-cyan-300/20 bg-cyan-400/[0.04]"
                        : "border-white/10 bg-slate-950/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-100">{baseline.originalFilename}</p>
                      {isPrimary ? (
                        <span className="rounded-full border border-cyan-300/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-100">
                          Active baseline
                        </span>
                      ) : null}
                      <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-300">
                        {isArchived ? "archived" : readinessLabel.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">Uploaded {formatDateTime(baseline.createdAt)}</p>
                    <p className="mt-1 text-xs text-slate-400">Baseline name: {baseline.originalFilename}</p>
                    {hasCompletedAssessment ? (
                      <p className="mt-1 text-xs text-slate-400">
                        Last analyzed{" "}
                        {latestAssessmentTimestamp
                          ? formatDateTime(latestAssessmentTimestamp)
                          : "recently"}
                      </p>
                    ) : null}
                    {latestRoleFitScore !== null ? (
                      <p className="mt-1 text-xs text-slate-500">Last role analysis: {latestRoleFitScore}%</p>
                    ) : null}
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {!isPrimary ? (
                          <FormButton
                            variant="ghost"
                            onClick={() => setPrimaryBaselineId(baseline.id)}
                            disabled={setActiveDisabled}
                            className="uppercase"
                          >
                            {formatCardActionLabel("Set Active")}
                          </FormButton>
                        ) : null}
                        <Link
                          href={baselineDetailsHref}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase text-slate-100 transition hover:bg-white/10"
                        >
                          {formatCardActionLabel("View Baseline Details")}
                        </Link>
                        {isArchived ? null : isReadyBaseline ? (
                          <Link
                            href={targetRoleHref}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold uppercase text-cyan-50 transition hover:bg-cyan-400/15"
                          >
                            {formatCardActionLabel("Target a role")}
                          </Link>
                        ) : (
                          <FormButton
                            onClick={() => setPrimaryBaselineId(baseline.id)}
                            disabled={setActiveDisabled}
                            className="bg-indigo-600 uppercase text-white hover:bg-indigo-500"
                          >
                            {formatCardActionLabel("Upload Another Resume")}
                          </FormButton>
                        )}
                        {isReadyBaseline ? null : canTargetJob && !isArchived ? (
                          <Link
                            href={targetRoleHref}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] border border-cyan-300/20 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold uppercase text-cyan-50 transition hover:bg-cyan-400/15"
                          >
                            {formatCardActionLabel("Add Job Description")}
                          </Link>
                        ) : null}
                        {isEditableLibrary ? (
                          <>
                            <FormButton
                              variant="ghost"
                              onClick={() => void handleArchiveBaseline(baseline.id)}
                              disabled={archivingBaselineId === baseline.id || isArchived}
                              className="uppercase"
                            >
                              {isArchived
                                ? formatCardActionLabel("Archived")
                                : archivingBaselineId === baseline.id
                                  ? formatCardActionLabel("Archiving...")
                                  : formatCardActionLabel("Archive")}
                            </FormButton>
                          </>
                        ) : null}
                      </div>
                      {latestResultsForBaselineHref ? (
                        <div className="flex flex-wrap gap-2 text-sm">
                          <Link
                            href={latestResultsForBaselineHref}
                            className="text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
                          >
                            {formatCardActionLabel("View Latest Results")}
                          </Link>
                          {canOpenStudio ? (
                            <Link
                              href={studioHref ?? "/studio"}
                              className="text-cyan-100 underline decoration-cyan-300/25 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-200/60"
                            >
                              {formatCardActionLabel("Open Resume Studio")}
                            </Link>
                          ) : (
                            <Link
                              href={fitReviewHref}
                              className="text-amber-100 underline decoration-amber-300/25 underline-offset-4 transition hover:text-amber-50 hover:decoration-amber-200/60"
                            >
                              {formatCardActionLabel("Start Fit Review")}
                            </Link>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {isValidatedBaselineState && !allBaselines.some((baseline) => baseline.id !== primaryBaselineId) ? (
                <p className="text-sm text-slate-400">
                  Source file for active baseline: {primaryBaseline?.originalFilename ?? "active baseline"}
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

        {strengtheningSuccessMessage ? (
          <section className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/[0.06] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
              Signal strengthened
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-50">{strengtheningSuccessMessage}</p>
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
                  Your baseline emits a set of professional signals. Strong signals improve targeting outcomes while developing signals indicate where signal clarity should improve next.
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
                    Your baseline signals are already well developed.
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
                        Your baseline signals are already well developed.
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
                        <CareerGravity />
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




