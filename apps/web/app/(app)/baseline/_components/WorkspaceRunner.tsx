"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { buildEvidenceLines, type ScoreBreakdown } from "@/lib/evidenceLines";
import { getGenerationReadiness } from "@/lib/generationReadiness";
import { getGenerationAuthorityState } from "@/lib/generationAuthority";
import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";
import { sanitizeScoreExplanationLine, sanitizeScoreExplanationList } from "@/lib/scoreExplanationCopy";
import { trackEvent } from "@/src/lib/analytics";
import { SetupModuleCard } from "./SetupModuleCard";

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

type StudioUrlArgs = {
  assessmentId?: string | null;
  jobId?: string | null;
  baselineId?: string | null;
  baselineVersionId?: string | null;
};

type ScoreBandKey = "prime" | "strong" | "competitive" | "possible" | "low";

type ScoreBandPresentation = {
  key: ScoreBandKey;
  label: string;
  summary: string;
  accentClassName: string;
  surfaceClassName: string;
};

export function resolveScoreBandPresentation(score: number): ScoreBandPresentation {
  if (score >= 90) {
    return {
      key: "prime",
      label: "Primary readiness",
      summary: "Strong alignment with this role.",
      accentClassName: "text-emerald-200",
      surfaceClassName: "border-emerald-300/20 bg-emerald-400/10",
    };
  }

  if (score >= 80) {
    return {
      key: "strong",
      label: "Strong Match",
      summary: "Strong alignment with this role.",
      accentClassName: "text-sky-200",
      surfaceClassName: "border-sky-300/20 bg-sky-400/10",
    };
  }

  if (score >= 70) {
    return {
      key: "competitive",
      label: "Competitive Match",
      summary: "You look like a plausible candidate, with a few areas that need stronger proof.",
      accentClassName: "text-cyan-100",
      surfaceClassName: "border-cyan-300/20 bg-cyan-400/10",
    };
  }

  if (score >= 60) {
    return {
      key: "possible",
      label: "Possible Fit",
      summary: "There is some alignment here, but the gaps are still noticeable.",
      accentClassName: "text-cyan-100",
      surfaceClassName: "border-cyan-300/20 bg-cyan-400/10",
    };
  }

  return {
    key: "low",
    label: "Low Match",
    summary: "This role currently shows substantial gaps against your baseline evidence.",
    accentClassName: "text-rose-100",
    surfaceClassName: "border-rose-300/20 bg-rose-400/10",
  };
}

export function buildResultsUrl({
  assessmentId,
  jobId,
  baselineId,
}: ResultsUrlArgs): string | null {
  const normalizedAssessmentId = assessmentId?.trim();
  const normalizedJobId = jobId?.trim();
  const normalizedBaselineId = baselineId?.trim();
  if (normalizedAssessmentId && normalizedBaselineId && normalizedJobId) {
    return `/results?assessmentId=${encodeURIComponent(normalizedAssessmentId)}&analysisId=${encodeURIComponent(
      normalizedAssessmentId,
    )}&jobId=${encodeURIComponent(normalizedJobId)}&baselineId=${encodeURIComponent(normalizedBaselineId)}`;
  }

  if (normalizedAssessmentId && normalizedBaselineId) {
    return `/results?assessmentId=${encodeURIComponent(normalizedAssessmentId)}&analysisId=${encodeURIComponent(
      normalizedAssessmentId,
    )}&baselineId=${encodeURIComponent(normalizedBaselineId)}`;
  }

  if (normalizedAssessmentId && normalizedJobId) {
    return `/results?assessmentId=${encodeURIComponent(normalizedAssessmentId)}&analysisId=${encodeURIComponent(
      normalizedAssessmentId,
    )}&jobId=${encodeURIComponent(normalizedJobId)}`;
  }

  if (normalizedAssessmentId) {
    return `/results?assessmentId=${encodeURIComponent(normalizedAssessmentId)}&analysisId=${encodeURIComponent(
      normalizedAssessmentId,
    )}`;
  }

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

function formatScoreValue(score: number | null): string {
  if (score === null) return "--";
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const PRE_REVEAL_MESSAGES = [
  "Analyzing role compatibility...",
  "Scanning experience signals...",
  "Evaluating leadership scope...",
  "Comparing operational depth...",
] as const;
const PRE_REVEAL_MIN_MS = 1300;
const COUNT_UP_MS = 800;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractScoreBreakdown(value: FitResultPayload | null): ScoreBreakdown | null {
  if (!value) return null;
  const candidates = [
    (value as { score_breakdown?: unknown }).score_breakdown,
    (value as { scoreBreakdown?: unknown }).scoreBreakdown,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const typed = candidate as {
      total_score?: unknown;
      dimensions?: Array<{
        key?: unknown;
        label?: unknown;
        score?: unknown;
        weight?: unknown;
      }>;
    };
    if (typeof typed.total_score !== "number" || !Array.isArray(typed.dimensions)) continue;

    const dimensions = typed.dimensions
      .map((dimension) => {
        if (
          typeof dimension?.key !== "string" ||
          typeof dimension.label !== "string" ||
          typeof dimension.score !== "number" ||
          typeof dimension.weight !== "number"
        ) {
          return null;
        }
        return {
          key: dimension.key,
          label: dimension.label,
          score: dimension.score,
          weight: dimension.weight,
        };
      })
      .filter(Boolean) as ScoreBreakdown["dimensions"];

    if (!dimensions.length) continue;
    return {
      total_score: typed.total_score,
      dimensions,
    } as ScoreBreakdown;
  }

  return null;
}

function extractFallbackEvidence(value: FitResultPayload | null): string[] {
  const strengths = (value as { strengths?: unknown } | null)?.strengths;
  if (!Array.isArray(strengths)) return [];
  return strengths
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

type CriticalGapSignal = {
  title: string;
  requirementEvidence?: string | null;
  baselineEvidence?: string | null;
  severityScore?: number | null;
};

function normalizeDiagnosticLine(value: string): string {
  return sanitizeScoreExplanationLine(value, "supporting") ?? "";
}

function extractCriticalGaps(value: FitResultPayload | null): CriticalGapSignal[] {
  const criticalGaps = (value as { criticalGaps?: unknown } | null)?.criticalGaps;
  if (!Array.isArray(criticalGaps)) return [];

  return criticalGaps
    .filter(
      (gap): gap is {
        title: string;
        requirementEvidence?: string | null;
        baselineEvidence?: string | null;
        severityScore?: number | null;
      } => Boolean(gap) && typeof (gap as { title?: unknown }).title === "string",
    )
    .map((gap) => ({
      title: gap.title.trim(),
      requirementEvidence: gap.requirementEvidence,
      baselineEvidence: gap.baselineEvidence,
      severityScore: gap.severityScore,
    }))
    .filter((gap) => gap.title.length > 0)
    .slice(0, 3);
}

function extractStrengthFallbackFromGaps(
  gaps: CriticalGapSignal[],
  score: number | null,
): string[] {
  if (typeof score !== "number" || score < 75) return [];

  return gaps
    .filter((gap): gap is CriticalGapSignal & { baselineEvidence: string } =>
      typeof gap.baselineEvidence === "string" && gap.baselineEvidence.trim().length > 0,
    )
    .sort((a, b) => (a.severityScore ?? 1) - (b.severityScore ?? 1))
    .map((gap) => normalizeDiagnosticLine(gap.baselineEvidence))
    .filter(Boolean)
    .slice(0, 1);
}

function resolveGapSeverityLabel(severityScore?: number | null): string {
  if (typeof severityScore !== "number") return "Moderate gap";
  if (severityScore >= 0.75) return "Major gap";
  if (severityScore >= 0.5) return "Moderate gap";
  return "Minor gap";
}

function getCompetitiveContext(score: number | null): string | null {
  return null;
}

export function buildStudioUrl({
  assessmentId,
  jobId,
  baselineId,
  baselineVersionId,
}: StudioUrlArgs): string {
  const params = new URLSearchParams();

  if (assessmentId?.trim()) {
    params.set("analysisId", assessmentId.trim());
  }

  if (jobId?.trim()) {
    params.set("jobId", jobId.trim());
  }

  if (baselineId?.trim()) {
    params.set("baselineId", baselineId.trim());
  }

  if (baselineVersionId?.trim()) {
    params.set("baselineVersionId", baselineVersionId.trim());
  }

  const query = params.toString();
  return query ? `/studio?${query}` : "/studio";
}

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

const BASELINE_INVALID_MESSAGE =
  "Baseline content is missing in this environment. Please re upload or select a valid baseline.";

const asString = (value?: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

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

    const statusCandidate =
      typeof parsed === "object"
        ? ("status" in parsed ? (parsed as { status?: unknown }).status : undefined)
        : undefined;
    const statusFromMessage =
      typeof parsed === "object" && "message" in parsed
        ? (parsed as { message?: { status?: unknown } }).message?.status
        : undefined;
    const normalizedStatus =
      (typeof statusCandidate === "string"
        ? statusCandidate.toLowerCase()
        : typeof statusFromMessage === "string"
        ? statusFromMessage.toLowerCase()
        : undefined) ?? "";

    const fallbackCode = asString((parsed as { code?: unknown }).code);
    const errorCodeRaw =
      asString(errorPayload.error?.code) ?? fallbackCode;
    const normalizedErrorCode = errorCodeRaw ? errorCodeRaw.toLowerCase() : "";

    if (
      normalizedStatus === "baseline_invalid" ||
      normalizedErrorCode === "baseline_empty"
    ) {
      const baselineError = new Error(BASELINE_INVALID_MESSAGE);
      (baselineError as Error & { code?: string; status?: string }).code =
        "BASELINE_EMPTY";
      (baselineError as Error & { status?: string }).status =
        "baseline_invalid";
      throw baselineError;
    }

    const normalizedDetailFlags = normalizeComplianceFlagsFromError(
      errorPayload.error?.details?.compliance_flags,
    );
    const detailErrorCodeRaw =
      typeof errorPayload.error?.code === "string" ? errorPayload.error.code : undefined;
    const errorCode = detailErrorCodeRaw?.toLowerCase() ?? "";
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
  const [completeBanner, setCompleteBanner] = useState<string | null>(null);
  const [latestJobId, setLatestJobId] = useState<string | null>(null);
  const [latestBaselineId, setLatestBaselineId] = useState<string | null>(null);
  const [runState, setRunState] = useState<"ok" | "compliance_blocked" | null>(null);
  const [showUploadAgainCTA, setShowUploadAgainCTA] = useState(false);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(baselineId);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(jobId);
  const [inFlightPairKey, setInFlightPairKey] = useState<string | null>(null);
  const [latestCompletedScore, setLatestCompletedScore] = useState<FitResultPayload | null>(
    null,
  );
  const [isRevealAnalyzing, setIsRevealAnalyzing] = useState(false);
  const [revealMessageIndex, setRevealMessageIndex] = useState(0);
  const [revealedScoreValue, setRevealedScoreValue] = useState<number | null>(null);
  const autoRunCombinationRef = useRef<string | null>(null);
  const autoRunCompletionTimerRef = useRef<number | null>(null);
  const autoRunInitiatedRef = useRef(false);
  const pendingCompletionKeyRef = useRef<string | null>(null);
  const stateViewedEventKeyRef = useRef<string | null>(null);
  const autoRunTriggerTimerRef = useRef<number | null>(null);
  const scoreSummaryRef = useRef<HTMLDivElement | null>(null);
  const revealStartMsRef = useRef<number>(0);
  const revealRunIdRef = useRef(0);
  const [isPreparingMatch, setIsPreparingMatch] = useState(false);
  const AUTO_RUN_DELAY_MS = 320;
  const reportProgressState = useCallback(
    (payload: ProgressState) => {
      onProgressStateChange?.(payload);
    },
    [onProgressStateChange],
  );
  const requestBaselineUploadAgain = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("baselineUploadAgainRequest"));
  }, []);

  useEffect(() => {
    if (!isRevealAnalyzing) {
      setRevealMessageIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setRevealMessageIndex((current) => (current + 1) % PRE_REVEAL_MESSAGES.length);
    }, 320);

    return () => window.clearInterval(timer);
  }, [isRevealAnalyzing]);

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
  const isDevMode = process.env.NODE_ENV !== "production";
  const debugUiEnabled = isDevMode || process.env.NEXT_PUBLIC_DEBUG_UI === "true";

  const showLoadLastRun = Boolean(baselineId) && Boolean(jobId);
  const showResult = Boolean(latestCompletedScore);
  const score = typeof displayResult?.score === "number" ? displayResult.score : null;
  const scoreBreakdown = extractScoreBreakdown(displayResult);
  const evidenceLinesFromBreakdown = buildEvidenceLines(scoreBreakdown);
  const baselineStrengthLines = extractFallbackEvidence(displayResult);
  const evidenceLines =
    baselineStrengthLines.length > 0
      ? baselineStrengthLines
      : evidenceLinesFromBreakdown;
  const strengthSignals = evidenceLines
    .map((line) => normalizeDiagnosticLine(line))
    .filter(Boolean);
  const gapSignals = extractCriticalGaps(displayResult);
  const strengthFallbackSignals = extractStrengthFallbackFromGaps(gapSignals, score);
  const visibleStrengthSignals = sanitizeScoreExplanationList(
    strengthSignals.length > 0 ? strengthSignals : strengthFallbackSignals,
    "strength",
    3,
  );
  const visibleGapSignals = gapSignals
    .map((gap) => ({
      ...gap,
      title: sanitizeScoreExplanationLine(gap.title, "gap"),
    }))
    .filter((gap): gap is CriticalGapSignal & { title: string } => Boolean(gap.title));
  const competitiveContext = getCompetitiveContext(score);
  const isStrongScore = typeof score === "number" && score > 80;
  const strongMatchSignals = sanitizeScoreExplanationList(visibleStrengthSignals, "supporting", 3);
  const scoreDisplayValue = showResult ? formatScoreValue(revealedScoreValue ?? score) : "--";
  const scoreBand = typeof score === "number" ? resolveScoreBandPresentation(score) : null;
  const resultsHref =
    buildResultsUrl({
      assessmentId: asString((displayResult as { assessmentId?: unknown } | null)?.assessmentId) ?? null,
      jobId: latestJobId,
      baselineId: latestBaselineId,
    }) ?? "/results";
  const studioHref = buildStudioUrl({
    assessmentId: asString((displayResult as { assessmentId?: unknown } | null)?.assessmentId) ?? null,
    jobId: latestJobId,
    baselineId: latestBaselineId,
    baselineVersionId:
      asString((displayResult as { baselineVersionId?: unknown } | null)?.baselineVersionId) ?? null,
  });
  const generationReadiness = useMemo(
    () => getGenerationReadiness(displayResult, runState),
    [displayResult, runState],
  );
  const targetGenerationState = useMemo(
    () => getGenerationAuthorityState(generationReadiness),
    [generationReadiness],
  );
  const productReadiness = useMemo(
    () =>
      buildGenerationProductReadiness({
        score,
        authorityState: targetGenerationState,
        hasCanonicalAssessment: Boolean(
          asString((displayResult as { assessmentId?: unknown } | null)?.assessmentId),
        ),
        hasRequiredContext: Boolean(latestBaselineId && latestJobId),
        isPro: true,
      }),
    [displayResult, latestBaselineId, latestJobId, score, targetGenerationState],
  );
  const isHighFit = productReadiness.canOpenStudio;
  const isGenerationLimited = targetGenerationState === "LIMITED";
  const isGenerationBlocked = targetGenerationState === "BLOCKED";
  const isLimitedHighFit =
    isHighFit && !productReadiness.generation_readiness.canGenerate && isGenerationLimited;
  const isBlockedHighFit =
    isHighFit && !productReadiness.generation_readiness.canGenerate && isGenerationBlocked;
  const scoreBandSummary =
    isBlockedHighFit
      ? "This role scored well, but your selected resume does not support compliant generation yet."
      : isLimitedHighFit
      ? "This role scored well, but generation is constrained by current verification limits."
      : scoreBand?.summary ?? "";
  const blockingReasons = generationReadiness.verificationIssues.slice(0, 3);

  const resultCardClasses = [
    "score-summary-card space-y-3 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))] p-4 text-[13px] text-slate-200 shadow-[0_24px_80px_rgba(2,6,23,0.45)]",
  ].join(" ");
  useEffect(() => {
    if (typeof score !== "number" || !latestBaselineId || !latestJobId) return;
    const assessmentId = asString((displayResult as { assessmentId?: unknown } | null)?.assessmentId) ?? "none";
    const eventKey = `${assessmentId}:${targetGenerationState}:${Math.round(score)}`;
    if (stateViewedEventKeyRef.current === eventKey) return;
    stateViewedEventKeyRef.current = eventKey;
    trackEvent("target_generation_state_viewed", {
      state: targetGenerationState,
      score,
      baselineId: latestBaselineId,
      jobId: latestJobId,
    });
  }, [displayResult, latestBaselineId, latestJobId, score, targetGenerationState]);

  const handleGenerateClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      trackEvent("target_cta_clicked", {
        state: targetGenerationState,
        score,
        actionType: isLimitedHighFit ? "open_studio_limited" : "open_studio_generate",
      });
      if (isBlockedHighFit || !productReadiness.canOpenStudio) {
        event.preventDefault();
        if (!productReadiness.canOpenStudio) {
          return;
        }
        trackEvent("target_cta_clicked", {
          state: targetGenerationState,
          score,
          actionType: "blocked_redirect",
        });
        trackEvent("target_generation_blocked_redirect", {
          score,
          blockerCodes: generationReadiness.verificationIssues.map((issue) => issue.code),
        });
      }
    },
    [
      generationReadiness.verificationIssues,
      isBlockedHighFit,
      isLimitedHighFit,
      productReadiness.canOpenStudio,
      score,
      targetGenerationState,
    ],
  );

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
    setLatestCompletedScore(null);
    setLatestJobId(null);
    setLatestBaselineId(null);
    setRunState(null);
    setShowUploadAgainCTA(false);
    setRevealedScoreValue(0);
    setIsRevealAnalyzing(true);
    revealStartMsRef.current = Date.now();
    const runId = revealRunIdRef.current + 1;
    revealRunIdRef.current = runId;

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

      if (runState === "ok") {
        const canonicalAssessmentId =
          typeof nextResult.assessmentId === "string" ? nextResult.assessmentId.trim() : "";
        const canonicalBaselineId =
          typeof nextResult.baselineId === "string" ? nextResult.baselineId.trim() : "";
        if (!canonicalAssessmentId) {
          throw new Error(
            "Analysis did not complete successfully. No persisted assessment was created.",
          );
        }
        if (canonicalBaselineId !== baselineForRun) {
          throw new Error("Analysis baseline linkage mismatch. Please retry.");
        }
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
      const numericScore =
        typeof nextResult.score === "number" ? nextResult.score : null;

      if (numericScore !== null && runState !== "compliance_blocked") {
        const elapsed = Date.now() - revealStartMsRef.current;
        const waitMs = Math.max(0, PRE_REVEAL_MIN_MS - elapsed);
        if (waitMs > 0) {
          await delay(waitMs);
        }

        if (revealRunIdRef.current !== runId) {
          return;
        }

        setIsRevealAnalyzing(false);

        const animationStart = Date.now();
        let current = 0;
        while (current < numericScore) {
          const progress = Math.min(1, (Date.now() - animationStart) / COUNT_UP_MS);
          current = Math.round(numericScore * progress * 10) / 10;
          setRevealedScoreValue(current);
          if (progress >= 1) break;
          await delay(16);
        }
        setRevealedScoreValue(numericScore);
      } else {
        setIsRevealAnalyzing(false);
        setRevealedScoreValue(numericScore);
      }

      setLatestCompletedScore(nextResult);

      const completionText =
        runState === "compliance_blocked" ? "Assessment blocked" : "Compatibility scored";
      reportProgressState({
        isScoring: false,
        isCompletionMoment: runState !== "compliance_blocked",
        isComplianceBlocked: runState === "compliance_blocked",
        isPreparingMatch: false,
      });
      setCompleteBanner(completionText);
    } catch (runError: unknown) {
      const message =
        extractErrorMessage(runError) ?? "Unable to run compatibility scoring right now.";
      const shouldShowUploadCTA = isMissingCanonicalRunError(runError, message);
      setResult(null);
      setLatestCompletedScore(null);
      setRevealedScoreValue(null);
      setError(message);
      setShowUploadAgainCTA(shouldShowUploadCTA);
      setLatestJobId(null);
      setLatestBaselineId(null);
      setRunState(null);
      autoRunInitiatedRef.current = false;
      setIsRevealAnalyzing(false);
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
    isPreparingMatch,
    isRunning,
    reportProgressState,
    selectedBaselineId,
    selectedJobId,
  ]);

  const loadLastRun = async () => {
    if (!baselineId || !jobId || isLoadingLastRun) return;

    setIsLoadingLastRun(true);
    setIsRevealAnalyzing(false);
    setRevealedScoreValue(null);
    setError(null);
    setShowUploadAgainCTA(false);
    setCompleteBanner(null);
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
      setRevealedScoreValue(typeof nextResult.score === "number" ? nextResult.score : null);

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
      setCompleteBanner("Loaded last run");
    } catch (loadError: unknown) {
      const message = extractErrorMessage(loadError) ?? "Unable to load the last run.";
      setError(message);
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
    onAutoRunComplete?.();
  }, [onAutoRunComplete, reportProgressState]);

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
    <SetupModuleCard label="" title="" description="">
      {isRunning || isRevealAnalyzing ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-200">
          <p className="font-medium text-slate-100">{PRE_REVEAL_MESSAGES[revealMessageIndex]}</p>
          <p className="mt-1 text-xs text-slate-400">Preparing your score reveal...</p>
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
          <div className="flex flex-col gap-5 px-2 py-6 text-left sm:px-4">
            <div
              className={`rounded-[24px] border p-6 text-center sm:p-8 ${scoreBand?.surfaceClassName ?? "border-white/10 bg-white/5"}`}
            >
              <p className="text-[88px] font-black leading-none tracking-[-0.06em] text-white sm:text-[112px]">
                {scoreDisplayValue}
              </p>
              {scoreBand ? (
                <>
                  <p className={`mt-3 text-xl font-semibold ${scoreBand.accentClassName}`}>
                    {scoreBand.label}
                  </p>
                  <p className="mt-2 text-base text-slate-100">{scoreBandSummary}</p>
                  <a
                    href={resultsHref}
                    className="mt-3 inline-flex text-sm font-medium text-slate-300 underline decoration-white/10 underline-offset-4 transition hover:text-white hover:decoration-white/30"
                  >
                    View detailed analysis
                  </a>
                </>
              ) : null}
              {competitiveContext ? (
                <p className="mt-3 text-sm text-slate-300">{competitiveContext}</p>
              ) : null}
            </div>
            {isStrongScore && strongMatchSignals.length ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/35 p-5">
                <h3 className="text-base font-semibold text-white">Why this is a strong match</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-200">
                  {strongMatchSignals.map((line) => (
                    <li key={line}>&bull; {line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!isStrongScore && visibleStrengthSignals.length ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/35 p-5">
                <h3 className="text-base font-semibold text-white">Why this role fits you</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-200">
                  {visibleStrengthSignals.map((line) => (
                    <li key={line}>&bull; {line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!isStrongScore && visibleGapSignals.length ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                <h3 className="text-base font-semibold text-white">Where the gaps are</h3>
                <div className="mt-3 space-y-3">
                  {visibleGapSignals.map((gap) => (
                    <div
                      key={`${gap.title}-${gap.requirementEvidence ?? ""}`}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                        {resolveGapSeverityLabel(gap.severityScore)}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        &bull; {gap.title}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {isHighFit ? (
              <div
                className={`rounded-2xl border p-4 text-sm ${
                  targetGenerationState === "BLOCKED"
                    ? "border-rose-300/35 bg-rose-500/10 text-rose-100"
                    : targetGenerationState === "LIMITED"
                    ? "border-cyan-300/35 bg-cyan-500/10 text-cyan-100"
                    : "border-emerald-300/35 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                  Generation status: {targetGenerationState}
                </p>
                <p className="mt-1 text-slate-100">
                  {targetGenerationState === "READY"
                    ? "Ready to generate tailored materials now."
                    : targetGenerationState === "LIMITED"
                    ? "Generation is limited by current verification constraints."
                    : "Generation is blocked until verification gaps are resolved."}
                </p>
                {targetGenerationState !== "READY" && blockingReasons.length ? (
                  <ul className="mt-2 space-y-1 text-slate-200">
                    {blockingReasons.map((reason, index) => (
                      <li key={`target-readiness-reason-${reason.code}-${index}`}>- {reason.explanation}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {isStrongScore ? (
              <p className="text-sm font-medium text-slate-100">
                {isBlockedHighFit
                  ? "You are a strong match, but your materials need refinement before applying."
                  : isLimitedHighFit
                    ? "You are a strong match, but generation is constrained until verification is stronger."
                  : "You are a strong match and ready to generate tailored materials."}
              </p>
            ) : null}
            {isBlockedHighFit ? (
              <div className="space-y-3 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4">
                <h3 className="text-base font-semibold text-cyan-100">
                  Strong match, but not ready to generate
                </h3>
                <p className="text-sm text-cyan-50/90">
                  Your experience aligns with this role. But your baseline does not yet support compliant
                  document generation.
                </p>
                {blockingReasons.length ? (
                  <ul className="space-y-2 text-sm text-cyan-50/90">
                    {blockingReasons.map((reason, index) => (
                      <li key={`${reason.code}-${index}`}>&bull; {reason.explanation}</li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-2xl bg-slate-600 px-6 py-3 text-sm font-semibold text-slate-200 opacity-80"
                >
                  Resolve gaps before generating
                </button>
                <a
                  href={resultsHref}
                  onClick={() =>
                    trackEvent("target_cta_clicked", {
                      state: targetGenerationState,
                      score,
                      actionType: "resolve_gaps",
                    })
                  }
                  className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-sm font-semibold text-[var(--verdict-apply-text)] transition hover:bg-[var(--accent-primary-hover)]"
                >
                  Fix baseline and continue
                </a>
              </div>
            ) : (
              <a
                href={productReadiness.canOpenStudio ? studioHref : resultsHref}
                onClick={handleGenerateClick}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-sm font-semibold text-[var(--verdict-apply-text)] transition hover:bg-[var(--accent-primary-hover)]"
              >
                {!productReadiness.canOpenStudio
                  ? "Continue Building Baseline"
                  : isLimitedHighFit
                  ? "Open Studio With Limits"
                  : "Open Studio"}
              </a>
            )}
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
