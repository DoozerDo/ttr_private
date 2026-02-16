"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { ScoreGauge } from "@/components/ScoreGauge";
import { SetupModuleCard } from "./SetupModuleCard";
import { JourneyStepId } from "@/src/lib/journeyNav";
import { useJourneyNavAppState } from "@/src/lib/journeyNavStore";

type ProgressState = {
  isScoring: boolean;
  isCompletionMoment: boolean;
  isComplianceBlocked: boolean;
  isPreparingMatch: boolean;
};

type WorkspaceRunnerProps = {
  baselineId: string | null;
  jobId: string | null;
  onAutoRunComplete?: () => void;
  onProgressStateChange?: (state: ProgressState) => void;
};

type DimensionScoreValue = number | string | null | undefined;

type RunDebugInfo = {
  baselineId: string;
  baselineVersionHash: string | null;
  baselineSelectedSectionCount: number;
  baselineTotalChars: number;
  jobId: string | null;
  jobRawChars: number;
  normalizedResponsibilitiesCount: number;
  normalizedResponsibilitiesChars: number;
  normalizedRequirementsCount: number;
  normalizedRequirementsChars: number;
  dimensionScores: Record<string, DimensionScoreValue>;
  totalScore: number;
};

type FitResultPayload = {
  score?: number | null;
  verdict?: string | null;
  dimensionScores?: Record<string, DimensionScoreValue> | DimensionScoreValue[] | null;
  complianceFlags?: unknown[] | null;
  compliance_flags?: unknown[] | null;

  createdAt?: string | null;
  updatedAt?: string | null;
  assessedAt?: string | null;
  runAt?: string | null;
  timestamp?: string | null;
  debug?: RunDebugInfo | null;
  scoringProof?: ScoringProofPayload | null;

  [key: string]: unknown;
};

type ScoringProofPayload = {
  assessmentId?: string | null;
  baselineTextCharsScored?: number;
  jobTextCharsScored?: number;
  truncationAppliedBaseline?: boolean;
  truncationAppliedJob?: boolean;
  normalizedResponsibilitiesCount?: number;
  normalizedRequirementsCount?: number;
  jobRawTextCharCount?: number | null;
  jobRawTextSha256?: string | null;
  jobRawTextTooShort?: boolean | null;
  jobRawTextWarning?: string | null;
};

type ResultsUrlArgs = {
  assessmentId?: string | null;
  jobId?: string | null;
  baselineId?: string | null;
};

export function buildResultsUrl({
  assessmentId,
  jobId,
  baselineId,
}: ResultsUrlArgs): string | null {
  const normalizedAssessmentId = assessmentId?.trim();
  if (normalizedAssessmentId) {
    return `/results?assessmentId=${encodeURIComponent(normalizedAssessmentId)}`;
  }

  const normalizedJobId = jobId?.trim();
  const normalizedBaselineId = baselineId?.trim();

  if (normalizedJobId && normalizedBaselineId) {
    return `/results?jobId=${encodeURIComponent(normalizedJobId)}&baselineId=${encodeURIComponent(
      normalizedBaselineId,
    )}`;
  }

  if (normalizedJobId) {
    return `/results?jobId=${encodeURIComponent(normalizedJobId)}`;
  }

  return null;
}

const formatDimensionEntries = (
  payload: FitResultPayload,
): [string, DimensionScoreValue][] => {
  const entries: [string, DimensionScoreValue][] = [];
  const dims = payload.dimensionScores;

  if (Array.isArray(dims)) {
    dims.forEach((value, index) => {
      entries.push([`Dimension ${index + 1}`, value]);
    });
    return entries;
  }

  if (dims && typeof dims === "object") {
    Object.entries(dims).forEach(([key, value]) => {
      entries.push([key, value]);
    });
  }

  return entries;
};

const renderDimensionValue = (value: DimensionScoreValue): string => {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "n/a";
  }
};

const formatProofNumber = (value?: number | null) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return "n/a";
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (payload && typeof payload === "object") {
    const candidate = (payload as Record<string, unknown>).message;
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate;
    }
  }
  return null;
};

const isMissingCanonicalRunError = (error: unknown, message?: string | null): boolean => {
  if (error && typeof error === "object") {
    const candidateCode = (error as { code?: unknown }).code;
    if (
      typeof candidateCode === "string" &&
      candidateCode.toLowerCase() === "baseline_canonical_missing"
    ) {
      return true;
    }
  }

  if (message && message.toLowerCase().includes("missing canonical")) {
    return true;
  }

  return false;
};

const normalizeComplianceFlagsFromError = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const buildComplianceBlockedPayload = (flags: unknown[]): FitResultPayload => ({
  score: null,
  verdict: "blocked",
  complianceFlags: flags,
  compliance_flags: flags.map((flag) =>
    typeof flag === "string" ? { code: flag, message: flag } : flag,
  ),
});

const parseAnalysisRunResponse = async (
  response: Response,
): Promise<{ payload: FitResultPayload; runState: "ok" | "compliance_blocked" }> => {
  const text = await response.text();
  let parsed: unknown = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Unable to run compatibility scoring right now.");
    }
  }

  if (response.ok) {
    const payload = (parsed as FitResultPayload | null) ?? {};
    return { payload, runState: "ok" };
  }

  if (parsed && typeof parsed === "object") {
    const candidate = parsed as FitResultPayload;
    if (candidate.verdict === "blocked") {
      return { payload: candidate, runState: "compliance_blocked" };
    }

    const errorPayload = parsed as {
      error?: {
        code?: string;
        message?: string;
        details?: { compliance_flags?: unknown[] };
      };
    };

    const normalizedDetailFlags = normalizeComplianceFlagsFromError(
      errorPayload.error?.details?.compliance_flags,
    );
    const errorCodeRaw =
      typeof errorPayload.error?.code === "string" ? errorPayload.error.code : undefined;
    const errorCode = errorCodeRaw?.toLowerCase() ?? "";
    const hasBlockSeverity =
      Array.isArray(normalizedDetailFlags) &&
      normalizedDetailFlags.some((flag) => {
        if (typeof flag !== "object" || flag === null) return false;
        const severity = (flag as { severity?: string }).severity;
        return typeof severity === "string" && severity.toLowerCase() === "block";
      });

    if (errorCode === "compliance_blocked" || hasBlockSeverity) {
      return {
        payload: buildComplianceBlockedPayload(normalizedDetailFlags),
        runState: "compliance_blocked",
      };
    }

    const message =
      errorPayload.error?.message ??
      extractErrorMessage(parsed) ??
      "Unable to run compatibility scoring right now.";
    const thrownError = new Error(message);
    if (errorCode) {
      (thrownError as Error & { code?: string }).code = errorCode;
    }
    throw thrownError;
  }

  throw new Error("Unable to run compatibility scoring right now.");
};

const pickTimestamp = (payload: FitResultPayload | null): string | null => {
  if (!payload) return null;

  const candidates = [
    payload.assessedAt,
    payload.runAt,
    payload.createdAt,
    payload.updatedAt,
    payload.timestamp,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) return candidate;
  }

  return null;
};

const formatTimestamp = (value: string | null): string => {
  if (!value) return "Not yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const BASELINE_STEP_ID: JourneyStepId = "baselines";
export function WorkspaceRunner({
  baselineId,
  jobId,
  onAutoRunComplete,
  onProgressStateChange,
}: WorkspaceRunnerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingLastRun, setIsLoadingLastRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FitResultPayload | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [completeBanner, setCompleteBanner] = useState<string | null>(null);
  const [latestAssessmentId, setLatestAssessmentId] = useState<string | null>(null);
  const [latestJobId, setLatestJobId] = useState<string | null>(null);
  const [latestBaselineId, setLatestBaselineId] = useState<string | null>(null);
  const [runState, setRunState] = useState<"ok" | "compliance_blocked" | null>(null);
  const [showUploadAgainCTA, setShowUploadAgainCTA] = useState(false);
  const router = useRouter();
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(baselineId);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(jobId);
  const [inFlightPairKey, setInFlightPairKey] = useState<string | null>(null);
  const [latestCompletedScore, setLatestCompletedScore] = useState<FitResultPayload | null>(
    null,
  );
  const journeyNavAppState = useJourneyNavAppState();
  const autoRunCombinationRef = useRef<string | null>(null);
  const autoRunCompletionTimerRef = useRef<number | null>(null);
  const autoRunInitiatedRef = useRef(false);
  const pendingCompletionKeyRef = useRef<string | null>(null);
  const autoRunTriggerTimerRef = useRef<number | null>(null);
  const scoreSummaryRef = useRef<HTMLDivElement | null>(null);
  const [isPreparingMatch, setIsPreparingMatch] = useState(false);
  const AUTO_RUN_DELAY_MS = 320;
  const reportProgressState = useCallback(
    (payload: ProgressState) => {
      onProgressStateChange?.(payload);
    },
    [onProgressStateChange],
  );
  const ensureScoreSummaryVisible = useCallback(() => {
    if (!scoreSummaryRef.current || typeof window === "undefined") {
      return;
    }
    const rect = scoreSummaryRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
    const mostlyVisible = visibleHeight >= rect.height * 0.7;
    if (!mostlyVisible) {
      scoreSummaryRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const requestBaselineUploadAgain = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("baselineUploadAgainRequest"));
  }, []);

  useLayoutEffect(() => {
    setSelectedBaselineId(baselineId);
  }, [baselineId]);

  // DEV CHECKLIST (manual verification paths):
  // 1) Selecting baseline+job auto-starts scoring after ~300ms with the running text visible.
  // 2) When scoring succeeds, Compatibility scored banner shows and dismisses after ~1.8s.
  // 3) After completion banner disappears, baseline/job selections clear and the Baseline rail resets.
  // 4) A completed score keeps the result card visible and View results remains usable afterward.
  // 5) Running scoring while a request is in flight does not start another run for the same pair.
  // 6) Changing selections mid-flight causes the stale response to be ignored (no new banner).
  // 7) Errors show the Scoring failed alert with a Retry scoring button that re-triggers scoring.
  // 8) Compliance blocked results still show blockers and keep Compatibility scored behavior until resolved.
  // 9) Loading last run via the link populates latestCompletedScore and keeps the card visible without auto-running.

  useLayoutEffect(() => {
    setSelectedJobId(jobId);
  }, [jobId]);

  const displayResult = latestCompletedScore ?? result;
  const dimensionEntries = useMemo(
    () => (displayResult ? formatDimensionEntries(displayResult) : []),
    [displayResult],
  );

  const isDevMode = process.env.NODE_ENV !== "production";
  const debugUiEnabled = isDevMode || process.env.NEXT_PUBLIC_DEBUG_UI === "true";
  const complianceTitleMap: Record<string, string> = {
    invented_company: "Invented company reference",
    invented_role: "Invented role or title",
    invented_metric: "Invented metric",
    invented_scope: "Invented scope or scale",
    invented_timeline: "Invented timeline",
  };

  const complianceFlagList = useMemo(() => {
    const rawFlags =
      displayResult?.complianceFlags ??
      displayResult?.compliance_flags ??
      (displayResult as { compliance?: { flags?: unknown[] } } | null)?.compliance?.flags;
    const normalizedFlags =
      Array.isArray(rawFlags) ? rawFlags : rawFlags ? [rawFlags] : [];
    return normalizedFlags.map((flag) => {
      if (typeof flag === "string") {
        return {
          title: "Compliance issue",
          message: flag,
          severity: "BLOCK",
          code: undefined,
          confidence: undefined,
        };
      }

      const typedFlag = flag as {
        code?: string;
        message?: string;
        severity?: string;
        confidence?: number;
      };

      const code =
        typeof typedFlag.code === "string" && typedFlag.code.trim()
          ? typedFlag.code
          : undefined;
      const message =
        typeof typedFlag.message === "string" && typedFlag.message.trim()
          ? typedFlag.message
          : code ?? "Compliance issue";
      const title =
        (code && complianceTitleMap[code]) ||
        complianceTitleMap[typedFlag.code ?? ""] ||
        "Compliance issue";
      const severity =
        typeof typedFlag.severity === "string" ? typedFlag.severity : "BLOCK";
      const confidence =
        debugUiEnabled && typeof typedFlag.confidence === "number"
          ? typedFlag.confidence
          : undefined;

      return {
        title,
        message,
        severity,
        code,
        confidence,
      };
    });
  }, [displayResult, debugUiEnabled]);

  const hasComplianceFlags = complianceFlagList.length > 0;
  const promptLikeFlag = complianceFlagList.find((flag) =>
    flag.message.toLowerCase().includes("prompt-like"),
  );
  const jobSourceUrl =
    (displayResult as { job?: { sourceUrl?: string | null } } | null)?.job?.sourceUrl ??
    (displayResult as { jobSourceUrl?: string | null } | null)?.jobSourceUrl ??
    null;
  const isLinkedInSource =
    typeof jobSourceUrl === "string" && jobSourceUrl.toLowerCase().includes("linkedin.com");
  const showLinkedInHint = Boolean(promptLikeFlag && isLinkedInSource);

  const showLoadLastRun = Boolean(baselineId) && Boolean(jobId);
  const showResult = Boolean(latestCompletedScore);

  const isBlockedResult =
    runState === "compliance_blocked" ||
    displayResult?.verdict === "blocked" ||
    (displayResult as { status?: string } | null)?.status === "compliance_blocked" ||
    Boolean((displayResult as { compliance?: { blocked?: boolean } } | null)?.compliance?.blocked);

  const isComplianceBlocked = isBlockedResult;
  const topComplianceFlags = complianceFlagList.slice(0, 3);

  const gaugeScore =
    typeof displayResult?.score === "number" ? displayResult.score : null;

  const onScoreCompleted = useCallback(
    (event: {
      baselineId: string;
      jobId: string;
      scoreValue: number | null;
      verdict: string | null;
    }) => {
      // Placeholder for future celebration hooks.
    },
    [],
  );

  const detailsToggleRow = (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setShowDetails((prev) => !prev)}
        className="text-xs font-semibold text-slate-200 underline decoration-white/10 underline-offset-4 hover:decoration-white/30"
      >
        {showDetails ? "Hide details" : "Show details"}
      </button>
    </div>
  );

  const viewResultsHref = buildResultsUrl({
    assessmentId: latestAssessmentId,
    jobId: latestJobId ?? jobId,
    baselineId: latestBaselineId ?? baselineId,
  });

  const viewResultsDisabled =
    isRunning || !viewResultsHref || isComplianceBlocked;
  const viewResultsHelper = !viewResultsHref
    ? "Compatibility score not ready yet."
    : isComplianceBlocked
      ? "Resolve compliance issues before viewing results."
      : null;
  const handleViewResults = () => {
    if (!viewResultsDisabled && viewResultsHref) {
      router.push(viewResultsHref);
    }
  };

  const handleResolveComplianceIssues = () => {
    if (!isComplianceBlocked) return;
    setShowComplianceModal(true);
  };

  const requestJobEdit = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("jobIngestionRequest"));
  }, []);

  const statusLine = useMemo(() => {
    if (!baselineId && !jobId && latestCompletedScore) return "Latest compatibility score is ready.";
    if (!baselineId && !jobId) return "Select a resume and a job to run scoring.";
    if (!baselineId) return "Select a resume to continue.";
    if (!jobId) return "Select a job to continue.";
    if (isRunning) return "Running compatibility score.";
    if (isComplianceBlocked) return "Compliance must be resolved before scoring.";
    if (displayResult) return "Compatibility score ready.";
    return "Ready to run compatibility scoring.";
  }, [baselineId, jobId, isRunning, isComplianceBlocked, displayResult, latestCompletedScore]);

  const resultCardClasses = [
    "score-summary-card space-y-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-200",
  ].join(" ");

  const runAssessment = useCallback(async () => {
    const baselineForRun = selectedBaselineId;
    const jobForRun = selectedJobId;
    if (!baselineForRun || !jobForRun || isRunning) return;

    const pairKey = `${baselineForRun}:${jobForRun}`;
    if (inFlightPairKey === pairKey) return;
    setInFlightPairKey(pairKey);

    if (isPreparingMatch) {
      setIsPreparingMatch(false);
    }
    reportProgressState({
      isScoring: true,
      isCompletionMoment: false,
      isComplianceBlocked: false,
      isPreparingMatch: false,
    });
    setIsRunning(true);
    setError(null);
    setCompleteBanner(null);
    setLatestAssessmentId(null);
    setLatestJobId(null);
    setLatestBaselineId(null);
    setShowDetails(false);
    setRunState(null);
    setShowUploadAgainCTA(false);

    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ baselineId: baselineForRun, jobId: jobForRun, debug: debugUiEnabled }),
      });

      const { payload: nextResult, runState } = await parseAnalysisRunResponse(response);
      if (selectedBaselineId !== baselineForRun || selectedJobId !== jobForRun) {
        return;
      }
      setResult(nextResult);
      setRunState(runState);
      const resolvedJobId =
        typeof nextResult.jobId === "string"
          ? nextResult.jobId
          : typeof jobForRun === "string"
            ? jobForRun
            : null;
      const resolvedBaselineId =
        typeof nextResult.baselineId === "string"
          ? nextResult.baselineId
          : typeof baselineForRun === "string"
            ? baselineForRun
            : null;
      setLatestJobId(resolvedJobId);
      setLatestBaselineId(resolvedBaselineId);
      setLatestAssessmentId(
        typeof nextResult.assessmentId === "string" ? nextResult.assessmentId : null,
      );
      setLatestCompletedScore(nextResult);
      onScoreCompleted({
        baselineId: baselineForRun,
        jobId: jobForRun,
        scoreValue:
          typeof nextResult.score === "number" ? nextResult.score : null,
        verdict: typeof nextResult.verdict === "string" ? nextResult.verdict : null,
      });

      const ts = pickTimestamp(nextResult) ?? new Date().toISOString();
      setLastRunAt(ts);
      const completionText =
        runState === "compliance_blocked" ? "Assessment blocked" : "Compatibility scored";
      reportProgressState({
        isScoring: false,
        isCompletionMoment: runState !== "compliance_blocked",
        isComplianceBlocked: runState === "compliance_blocked",
        isPreparingMatch: false,
      });
        setCompleteBanner(completionText);
        ensureScoreSummaryVisible();
    } catch (runError: unknown) {
      const message =
        extractErrorMessage(runError) ?? "Unable to run compatibility scoring right now.";
      const shouldShowUploadCTA = isMissingCanonicalRunError(runError, message);
      setError(message);
      setShowUploadAgainCTA(shouldShowUploadCTA);
      setLatestAssessmentId(null);
      setLatestJobId(null);
      setLatestBaselineId(null);
      setRunState(null);
      autoRunInitiatedRef.current = false;
      reportProgressState({
        isScoring: false,
        isCompletionMoment: false,
        isComplianceBlocked: false,
        isPreparingMatch: false,
      });
    } finally {
      setInFlightPairKey((current) => (current === pairKey ? null : current));
      setIsRunning(false);
    }
  }, [
    debugUiEnabled,
    inFlightPairKey,
    isRunning,
    reportProgressState,
    selectedBaselineId,
    selectedJobId,
  ]);

  const loadLastRun = async () => {
    if (!baselineId || !jobId || isLoadingLastRun) return;

    setIsLoadingLastRun(true);
    setError(null);
    setShowUploadAgainCTA(false);
    setCompleteBanner(null);
    setLatestAssessmentId(null);
    setLatestJobId(null);
    setLatestBaselineId(null);

    try {
      const url = `/api/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(
        baselineId,
      )}/latest`;

      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        const message = extractErrorMessage(payload) ?? "Unable to load the last run.";
        throw new Error(message);
      }

      const nextResult = payload as FitResultPayload;
      setResult(nextResult);
      setLatestCompletedScore(nextResult);

      const loadedIsBlocked =
        (nextResult as { status?: string } | null)?.status === "compliance_blocked" ||
        nextResult?.verdict === "blocked" ||
        Boolean((nextResult as { compliance?: { blocked?: boolean } } | null)?.compliance?.blocked);

      setRunState(loadedIsBlocked ? "compliance_blocked" : "ok");
      reportProgressState({
        isScoring: false,
        isCompletionMoment: false,
        isComplianceBlocked: loadedIsBlocked,
        isPreparingMatch: false,
      });

      const resolvedJobId =
        typeof nextResult.jobId === "string"
          ? nextResult.jobId
          : typeof jobId === "string"
            ? jobId
            : null;
      const resolvedBaselineId =
        typeof nextResult.baselineId === "string"
          ? nextResult.baselineId
          : typeof baselineId === "string"
            ? baselineId
            : null;
      setLatestJobId(resolvedJobId);
      setLatestBaselineId(resolvedBaselineId);
      setLatestAssessmentId(
        typeof nextResult.assessmentId === "string" ? nextResult.assessmentId : null,
      );

      const ts = pickTimestamp(nextResult) ?? new Date().toISOString();
      setLastRunAt(ts);
      setCompleteBanner("Loaded last run");
    } catch (loadError: unknown) {
      const message = extractErrorMessage(loadError) ?? "Unable to load the last run.";
      setError(message);
      setLatestAssessmentId(null);
      setLatestJobId(null);
      setLatestBaselineId(null);
      setRunState(null);
    } finally {
      setIsLoadingLastRun(false);
    }
  };

  const handleAutoRunFinalize = useCallback(() => {
    autoRunCombinationRef.current = null;
    autoRunInitiatedRef.current = false;
    pendingCompletionKeyRef.current = null;
    setSelectedBaselineId(null);
    setSelectedJobId(null);
    setInFlightPairKey(null);
    reportProgressState({
      isScoring: false,
      isCompletionMoment: false,
      isComplianceBlocked: false,
      isPreparingMatch: false,
    });
    journeyNavAppState.setActiveOverride(BASELINE_STEP_ID);
    onAutoRunComplete?.();
  }, [journeyNavAppState, onAutoRunComplete]);

  useEffect(() => {
    if (autoRunTriggerTimerRef.current !== null) {
      window.clearTimeout(autoRunTriggerTimerRef.current);
      autoRunTriggerTimerRef.current = null;
    }
    if (!selectedBaselineId || !selectedJobId) return;
    const pairKey = `${selectedBaselineId}:${selectedJobId}`;
    const alreadyCompleted =
      latestBaselineId === selectedBaselineId &&
      latestJobId === selectedJobId &&
      Boolean(latestCompletedScore);
    if (isRunning || inFlightPairKey === pairKey || alreadyCompleted) {
      return;
    }

    const baselineSnapshot = selectedBaselineId;
    const jobSnapshot = selectedJobId;
    autoRunTriggerTimerRef.current = window.setTimeout(() => {
      autoRunTriggerTimerRef.current = null;
      if (
        selectedBaselineId !== baselineSnapshot ||
        selectedJobId !== jobSnapshot
      ) {
        return;
      }
      autoRunCombinationRef.current = pairKey;
      autoRunInitiatedRef.current = true;
      void runAssessment();
    }, AUTO_RUN_DELAY_MS);

    return () => {
      if (autoRunTriggerTimerRef.current !== null) {
        window.clearTimeout(autoRunTriggerTimerRef.current);
        autoRunTriggerTimerRef.current = null;
      }
    };
  }, [
    inFlightPairKey,
    isRunning,
    latestBaselineId,
    latestCompletedScore,
    latestJobId,
    runAssessment,
    selectedBaselineId,
    selectedJobId,
  ]);

  useEffect(() => {
    if (!selectedBaselineId || !selectedJobId) {
      if (isPreparingMatch) {
        setIsPreparingMatch(false);
        reportProgressState({
          isScoring: false,
          isCompletionMoment: false,
          isComplianceBlocked: false,
          isPreparingMatch: false,
        });
      }
      return;
    }

    if (isRunning || isPreparingMatch) {
      return;
    }

    setIsPreparingMatch(true);
    reportProgressState({
      isScoring: false,
      isCompletionMoment: false,
      isComplianceBlocked: false,
      isPreparingMatch: true,
    });
  }, [isPreparingMatch, isRunning, reportProgressState, selectedBaselineId, selectedJobId]);

  useEffect(() => {
    if (runState !== "ok" || !completeBanner || !displayResult) return;
    if (!autoRunInitiatedRef.current) return;
    if (autoRunCompletionTimerRef.current) {
      window.clearTimeout(autoRunCompletionTimerRef.current);
      autoRunCompletionTimerRef.current = null;
    }
    const completionKey = autoRunCombinationRef.current;
    if (!completionKey) return;
    pendingCompletionKeyRef.current = completionKey;
    autoRunCompletionTimerRef.current = window.setTimeout(() => {
      autoRunCompletionTimerRef.current = null;
      if (autoRunCombinationRef.current !== completionKey) {
        pendingCompletionKeyRef.current = null;
        return;
      }
      pendingCompletionKeyRef.current = null;
      setCompleteBanner(null);
      handleAutoRunFinalize();
    }, 3000);

    return () => {
      if (autoRunCompletionTimerRef.current) {
        window.clearTimeout(autoRunCompletionTimerRef.current);
        autoRunCompletionTimerRef.current = null;
      }
      pendingCompletionKeyRef.current = null;
    };
  }, [completeBanner, handleAutoRunFinalize, displayResult, runState]);

  return (
    <SetupModuleCard
      label=""
      title=""
      description="Scoring begins automatically once you have selected both a resume and a job."
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-300">{statusLine}</p>
        <div className="text-xs text-slate-400">
          <div>Last run: {formatTimestamp(lastRunAt)}</div>
        </div>
      </div>
      {isRunning ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-200">
          Scoring compatibility.
        </div>
      ) : error ? (
        <div className="space-y-3">
          <Alert intent="error" title="Scoring failed">
            <p className="text-sm text-current">{error}</p>
          </Alert>
          <div className="flex flex-wrap justify-end gap-2">
            <FormButton onClick={runAssessment} disabled={isRunning}>
              Retry scoring
            </FormButton>
            {showUploadAgainCTA ? (
              <FormButton
                variant="secondary"
                onClick={requestBaselineUploadAgain}
                disabled={isRunning}
              >
                Upload resume again
              </FormButton>
            ) : null}
          </div>
        </div>
      ) : null}

      {showLoadLastRun ? (
        <button
          type="button"
          onClick={() => {
            void loadLastRun();
          }}
          disabled={isLoadingLastRun || isRunning}
          className="text-xs font-semibold text-slate-300 underline decoration-white/10 underline-offset-4 hover:decoration-white/30 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Load last run"
        >
          {isLoadingLastRun ? "Loading last run..." : "Load last run"}
        </button>
      ) : null}

      {showResult ? (
        <div ref={scoreSummaryRef} className={resultCardClasses}>
          {completeBanner ? (
            <div className="flex justify-end">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[11px] font-semibold text-slate-200">
                {completeBanner}
              </span>
            </div>
          ) : null}
          <div className="flex justify-center pt-3">
            <ScoreGauge score={gaugeScore ?? 0} loading={isRunning} label="Score" />
          </div>
          <div className="space-y-2 pt-3">
            <div className="flex justify-end">{detailsToggleRow}</div>
            {isComplianceBlocked ? (
              <>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Top blockers
                  </p>
                  {topComplianceFlags.length ? (
                    <ul className="space-y-1 text-xs text-slate-300">
                      {topComplianceFlags.map((flag, index) => (
                        <li key={`top-flag-${index}`}>
                          <span className="font-semibold text-slate-200">{flag.title}</span>:{" "}
                          {flag.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">No blocked issues surfaced yet.</p>
                  )}
                </div>
                {showDetails && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                        Compliance flags
                      </p>
                      <span className="text-xs text-slate-400">
                        {hasComplianceFlags
                          ? `${complianceFlagList.length} flagged`
                          : "No details provided"}
                      </span>
                    </div>
                    {hasComplianceFlags ? (
                      <ul className="space-y-2">
                        {complianceFlagList.map((flag, index) => (
                          <li
                            key={`flag-${index}`}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <div className="flex gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-300">
                                {flag.severity?.toUpperCase() ?? "BLOCK"}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-100">{flag.title}</p>
                                <p className="text-xs text-slate-300">{flag.message}</p>
                                {debugUiEnabled && (flag.code || flag.confidence !== undefined) ? (
                                  <p className="mt-1 text-[11px] text-amber-200">
                                    {flag.code ? `Code: ${flag.code}` : null}
                                    {flag.confidence !== undefined ? ` Confidence: ${flag.confidence}` : null}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">Compliance flag details are hidden.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {showDetails ? (
                  <div className="space-y-3">
                    {dimensionEntries.length ? (
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                          Dimension scores
                        </p>
                        <div className="grid gap-1 text-xs text-slate-300">
                          {dimensionEntries.map(([label, value], index) => (
                            <p key={`${label}-${index}`}>{label}: {renderDimensionValue(value)}</p>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Dimension breakdown is not available yet.</p>
                    )}
                    {complianceFlagList.length ? (
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                          Compliance flags
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">
                          {complianceFlagList.map((flag, index) => (
                            <li key={`flag-${index}`}>
                              <span className="font-semibold text-slate-200">{flag.title}</span>:{" "}
                              {flag.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {displayResult?.scoringProof ? (
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                          Scoring proof
                        </p>
                        <div className="grid gap-1 text-xs text-slate-300">
                          <p>Assessment ID: {displayResult.scoringProof.assessmentId ?? "n/a"}</p>
                          <p>
                            Resume chars scored:{" "}
                            {formatProofNumber(displayResult.scoringProof.baselineTextCharsScored)}
                          </p>
                          <p>
                            Job chars scored:{" "}
                            {formatProofNumber(displayResult.scoringProof.jobTextCharsScored)}
                          </p>
                          <p>
                            Normalized responsibilities:{" "}
                            {(displayResult.scoringProof.normalizedResponsibilitiesCount ?? 0).toLocaleString()}
                          </p>
                          <p>
                            Normalized requirements:{" "}
                            {(displayResult.scoringProof.normalizedRequirementsCount ?? 0).toLocaleString()}
                          </p>
                          <p>
                            Job raw text characters:{" "}
                            {(displayResult.scoringProof.jobRawTextCharCount ?? 0).toLocaleString()}
                          </p>
                          <p className="break-words text-xs text-slate-300">
                            Job raw text SHA256: {displayResult.scoringProof.jobRawTextSha256 ?? "n/a"}
                          </p>
                          {displayResult.scoringProof.jobRawTextTooShort ? (
                            <p className="text-[11px] uppercase tracking-[0.35em] text-amber-300">
                              {displayResult.scoringProof.jobRawTextWarning ??
                                "Raw job description is below the recommended length."}
                            </p>
                          ) : null}
                          <p>
                            Resume truncated:{" "}
                            {displayResult.scoringProof.truncationAppliedBaseline ? "Yes" : "No"}
                          </p>
                          <p>
                            Job truncated:{" "}
                            {displayResult.scoringProof.truncationAppliedJob ? "Yes" : "No"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Scoring proof is unavailable for this run.</p>
                    )}
                  </div>
                  ) : null}
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <FormButton onClick={handleViewResults} disabled={viewResultsDisabled}>
              View results
            </FormButton>
            {isComplianceBlocked ? (
              <FormButton onClick={handleResolveComplianceIssues}>Resolve compliance issues</FormButton>
            ) : null}
          </div>
          {viewResultsHelper ? (
            <p className="text-[11px] text-slate-400 pt-2">{viewResultsHelper}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Run a fit assessment to see your compatibility score.</p>
      )}
      {showComplianceModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950 p-5 text-sm text-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  Compliance issues to resolve
                </p>
                <p className="text-xs text-slate-400">
                  Resolve the issues below to continue scoring.
                </p>
              </div>
              <FormButton variant="secondary" onClick={() => setShowComplianceModal(false)}>
                Close
              </FormButton>
            </div>

            <div className="mt-4 space-y-3">
              {hasComplianceFlags ? (
                <ul className="space-y-2">
                  {complianceFlagList.map((flag, index) => (
                    <li
                      key={`modal-flag-${index}`}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">
                            {flag.severity?.toUpperCase() ?? "BLOCK"}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-100">
                            {flag.title}
                          </p>
                          <p className="text-xs text-slate-300">{flag.message}</p>
                        </div>
                        {flag.code ? (
                          <span className="text-[11px] text-slate-400">Code: {flag.code}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No compliance flag details were provided.</p>
              )}

              {showLinkedInHint ? (
                <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  This can happen when a LinkedIn page injects non-job content into the description.
                  Re-ingest the job or paste the job description text directly.
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <FormButton
                  onClick={() => {
                    requestJobEdit();
                    setShowComplianceModal(false);
                  }}
                >
                  Edit job description
                </FormButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        .score-summary-card {
          transform-origin: center;
        }
      `}</style>
    </SetupModuleCard>
  );
}
