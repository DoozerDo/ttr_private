"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { ScoreGauge } from "@/components/ScoreGauge";
import { getVerdictDisplayOrDefault } from "@/lib/fit-verdict";
import { sanitizeRenderedTextValue } from "@/lib/renderedText";
import type { ScoreBreakdown } from "@/lib/evidenceLines";
import { resolveFitReviewGaps, type FitReviewGapAnalysis } from "@/lib/fitReviewResolver";
import {
  LAST_ANALYSIS_STORAGE_KEY,
  readLastAnalysis,
  type AnalysisResult,
  type StoredAnalysisRecord,
} from "../lib/session";
import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";
import {
  fitReviewDimensionLabels,
  fitReviewQuestions,
  SCORING_DIMENSION_ORDER,
  type FitReviewDimensionKey,
} from "@/lib/fitReviewQuestions";
import { getStudioHref } from "@/src/navigation/routes";

type FitDimensionScores = {
  experienceAlignment?: number;
  leadershipLevel?: number;
  technicalPlatformFit?: number;
  industryContext?: number;
  strategicTacticalFit?: number;
};

type FitAssessment = {
  jobId?: string;
  baselineId?: string;
  baselineVersionId?: string | null;
  overallScore?: number;
  score?: number;
  verdict?: string;
  summary?: string;
  dimensionScores?: FitDimensionScores;
  breakdown?: {
    experience_alignment?: number;
    leadership_level?: number;
    technical_platform_fit?: number;
    industry_context?: number;
    strategic_vs_tactical?: number;
  };
  scoring_v2?: ScoringV2Result | null;
};

type ScoringV2Rubric = {
  weights?: Record<FitReviewDimensionKey, number>;
  dimensionPercents?: Record<FitReviewDimensionKey, number>;
  dimensionPoints?: Record<FitReviewDimensionKey, number>;
  penalties?: ScoringV2Penalty[];
};

type ScoringV2Penalty = {
  code: string;
  points?: number;
  reason?: string;
};

type ScoringV2Result = {
  score: number;
  rubric: ScoringV2Rubric;
  scoreConfidence?: "high" | "medium" | "low";
  scoreConfidenceReasons?: string[];
  scoreSanityFlags?: string[];
  likelyUnderestimatedFit?: boolean;
  scorePresentationMode?: "normal" | "caution" | "fix_first";
};

const HERO_MESSAGE =
  "Review the blocked analysis, add verified evidence, and continue the recovery path.";
const ACTIONABLE_DIMENSION_COUNT = 2;
const GUIDED_UNLOCK_MIN_SCORE = 70;
const GUIDED_UNLOCK_MAX_SCORE = 84;

function parseTimestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAssessmentCreatedTimestamp(a: FitAssessment | null | undefined): string | null {
  if (!a) return null;
  const anyA = a as unknown as {
    createdAt?: string;
    created_at?: string;
    createdTimestamp?: string;
    createdISO?: string;
    updatedAt?: string;
    updated_at?: string;
  };
  const value =
    anyA.createdAt ??
    anyA.created_at ??
    anyA.createdTimestamp ??
    anyA.createdISO ??
    anyA.updatedAt ??
    anyA.updated_at ??
    null;
  return typeof value === "string" ? value : null;
}

function getAssessmentScore(assessment?: FitAssessment | AnalysisResult | null): number | null {
  if (!assessment) return null;
  if (
    typeof (assessment as { scoring_v2?: { score?: unknown } }).scoring_v2?.score ===
    "number"
  ) {
    return (assessment as { scoring_v2: { score: number } }).scoring_v2.score;
  }
  if (typeof assessment.overallScore === "number") return assessment.overallScore;
  if (typeof assessment.score === "number") return assessment.score;
  return null;
}

function normalizeDimensions(data?: FitAssessment | null): FitDimensionScores {
  if (!data) return {};

  if (data.dimensionScores) {
    return data.dimensionScores;
  }

  if (data.breakdown) {
    const breakdown = data.breakdown;
    return {
      experienceAlignment: breakdown.experience_alignment,
      leadershipLevel: breakdown.leadership_level,
      technicalPlatformFit: breakdown.technical_platform_fit,
      industryContext: breakdown.industry_context,
      strategicTacticalFit: breakdown.strategic_vs_tactical,
    };
  }

  return {};
}

function isFitAssessment(
  value: FitAssessment | AnalysisResult | null | undefined,
): value is FitAssessment {
  if (!value || typeof value !== "object") return false;
  return (
    "baselineVersionId" in value ||
    "dimensionScores" in value ||
    "breakdown" in value
  );
}

function readStringField(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return sanitizeRenderedTextValue(value, {
        endpoint: "fit-review",
        field: key,
      });
    }
  }

  return null;
}

function extractScoreBreakdown(value: Record<string, unknown> | null): ScoreBreakdown | null {
  if (!value) return null;
  const candidates = [value.score_breakdown, value.scoreBreakdown];

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

function extractGapAnalysis(value: Record<string, unknown> | null): FitReviewGapAnalysis | null {
  if (!value) return null;

  const verificationCoverage =
    (value as { verification_coverage?: unknown }).verification_coverage ??
    (value as { verificationCoverage?: unknown }).verificationCoverage ??
    null;
  const unverifiedRequirementsRaw =
    verificationCoverage && typeof verificationCoverage === "object"
      ? (verificationCoverage as { unverifiedRequirements?: unknown; unverified_requirements?: unknown })
          .unverifiedRequirements ??
        (verificationCoverage as { unverifiedRequirements?: unknown; unverified_requirements?: unknown })
          .unverified_requirements ??
        null
      : null;

  const directCriticalGaps = (value as { criticalGaps?: unknown }).criticalGaps ?? null;
  const gapAnalysisContainer = (value as { gapAnalysis?: unknown }).gapAnalysis ?? null;
  const containerCriticalGaps =
    gapAnalysisContainer && typeof gapAnalysisContainer === "object"
      ? (gapAnalysisContainer as { criticalGaps?: unknown }).criticalGaps ?? null
      : null;
  const criticalGapsRaw = directCriticalGaps ?? containerCriticalGaps ?? null;

  const unverifiedRequirements = Array.isArray(unverifiedRequirementsRaw)
    ? unverifiedRequirementsRaw.filter((item): item is string => typeof item === "string")
    : null;

  const criticalGaps = Array.isArray(criticalGapsRaw)
    ? (criticalGapsRaw as unknown[])
        .map((gap) => {
          if (typeof gap === "string") return gap;
          if (!gap || typeof gap !== "object") return null;
          const obj = gap as { title?: unknown; requirementEvidence?: unknown; baselineEvidence?: unknown };
          return {
            title: typeof obj.title === "string" ? obj.title : null,
            requirementEvidence: typeof obj.requirementEvidence === "string" ? obj.requirementEvidence : null,
            baselineEvidence: typeof obj.baselineEvidence === "string" ? obj.baselineEvidence : null,
          };
        })
        .filter(
          (
            gap,
          ): gap is
            | string
            | { title: string | null; requirementEvidence: string | null; baselineEvidence: string | null } =>
            Boolean(gap),
        )
    : null;

  if (!unverifiedRequirements && !criticalGaps) return null;

  return {
    unverifiedRequirements,
    criticalGaps,
  };
}

function parseInsufficientBaselineSupportSignals(reason: string) {
  const recallMatch = reason.match(/baseline_recall=([0-9]+(?:\.[0-9]+)?)%/i);
  const overlapMatch = reason.match(/responsibility_overlap=([0-9]+(?:\.[0-9]+)?)%/i);
  const toolCoverageMatch = reason.match(/required_tool_coverage=([0-9]+(?:\.[0-9]+)?)%/i);

  const baselineRecall =
    recallMatch && Number.isFinite(Number(recallMatch[1])) ? Number(recallMatch[1]) : null;
  const responsibilityOverlap =
    overlapMatch && Number.isFinite(Number(overlapMatch[1])) ? Number(overlapMatch[1]) : null;
  const requiredToolCoverage =
    toolCoverageMatch && Number.isFinite(Number(toolCoverageMatch[1])) ? Number(toolCoverageMatch[1]) : null;

  if (baselineRecall === null && responsibilityOverlap === null && requiredToolCoverage === null) {
    return null;
  }

  return {
    baselineRecall,
    responsibilityOverlap,
    requiredToolCoverage,
  };
}

export default function FitReviewClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId") ?? "";
  const requestedAnalysisId =
    searchParams.get("analysisId")?.trim() ?? searchParams.get("assessmentId")?.trim() ?? "";
  const highlightedClaim = searchParams.get("highlightClaim")?.trim() ?? "";
  const [storedAnalysis, setStoredAnalysis] = useState<StoredAnalysisRecord | null>(null);
  const [assessment, setAssessment] = useState<FitAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDimension, setActiveDimension] = useState<FitReviewDimensionKey | null>(null);
  const [dialogAnswers, setDialogAnswers] = useState<
    Partial<Record<FitReviewDimensionKey, string[]>>
  >({});
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [proposedAdditions, setProposedAdditions] = useState<
    Partial<Record<FitReviewDimensionKey, string>>
  >({});
  const [approvedAdditions, setApprovedAdditions] = useState<
    Partial<Record<FitReviewDimensionKey, string>>
  >({});
  const [editingKey, setEditingKey] = useState<FitReviewDimensionKey | null>(null);
  const [editingText, setEditingText] = useState("");
  const [startInterviewError, setStartInterviewError] = useState<string | null>(null);
  const [isStartingInterview, setIsStartingInterview] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStoredAnalysis(readLastAnalysis());
    refresh();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LAST_ANALYSIS_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const resolvedJobId = jobId || storedAnalysis?.jobId || "";
  const normalizedResolvedJobId = resolvedJobId.trim();
  const storedSavedTimestamp = useMemo(
    () => parseTimestamp(storedAnalysis?.savedAt ?? null),
    [storedAnalysis?.savedAt],
  );
  const remoteCreatedTimestamp = useMemo(
    () => parseTimestamp(getAssessmentCreatedTimestamp(assessment)),
    [assessment],
  );
  const storedJobMatchesResolved =
    Boolean(normalizedResolvedJobId && storedAnalysis?.jobId?.trim() === normalizedResolvedJobId);
  const displayAssessment = useMemo(() => {
    if (storedJobMatchesResolved && storedAnalysis?.analysis) {
      if (storedSavedTimestamp >= remoteCreatedTimestamp) {
        return storedAnalysis.analysis;
      }
    }

    if (
      assessment &&
      normalizedResolvedJobId &&
      assessment.jobId?.trim() === normalizedResolvedJobId
    ) {
      return assessment;
    }

    if (storedJobMatchesResolved && storedAnalysis?.analysis) {
      return storedAnalysis.analysis;
    }

    return assessment ?? storedAnalysis?.analysis ?? null;
  }, [
    assessment,
    normalizedResolvedJobId,
    remoteCreatedTimestamp,
    storedAnalysis?.analysis,
    storedJobMatchesResolved,
    storedSavedTimestamp,
  ]);

  const scoringRubric = useMemo(() => {
    if (!isFitAssessment(displayAssessment)) return null;
    return displayAssessment.scoring_v2?.rubric ?? null;
  }, [displayAssessment]);

  const insufficientBaselineSupportPenalty = useMemo(() => {
    const penalties = scoringRubric?.penalties ?? [];
    return penalties.find((penalty) => penalty?.code === "insufficient_baseline_support") ?? null;
  }, [scoringRubric?.penalties]);

  const insufficientBaselineSupportSignals = useMemo(() => {
    const reason = insufficientBaselineSupportPenalty?.reason;
    if (typeof reason !== "string" || !reason.trim()) return null;
    return parseInsufficientBaselineSupportSignals(reason);
  }, [insufficientBaselineSupportPenalty?.reason]);

  const fitAssessment = useMemo<FitAssessment | null>(() => {
    return isFitAssessment(displayAssessment) ? displayAssessment : null;
  }, [displayAssessment]);

  const dimensionScores = useMemo(() => normalizeDimensions(fitAssessment), [fitAssessment]);
  const dimensionEntries = useMemo(
    () =>
      SCORING_DIMENSION_ORDER.map((key) => {
        const percent = scoringRubric?.dimensionPercents?.[key] ?? null;
        const points = scoringRubric?.dimensionPoints?.[key] ?? null;
        const normalized = dimensionScores[
          key as keyof FitDimensionScores
        ] as number | null;
        return {
          key,
          label: fitReviewDimensionLabels[key],
          percent,
          points,
          normalizedValue:
            typeof normalized === "number" ? normalized : null,
        };
      }),
    [dimensionScores, scoringRubric],
  );

  const actionableDimensionKeys = useMemo(() => {
    if (!dimensionEntries.length) return new Set<FitReviewDimensionKey>();
    const hasPercent = dimensionEntries.some((entry) => typeof entry.percent === "number");
    if (!hasPercent) return new Set<FitReviewDimensionKey>();
    const sorted = [...dimensionEntries]
      .map((entry, index) => ({
        key: entry.key,
        sortValue:
          typeof entry.percent === "number"
            ? entry.percent
            : Infinity,
        order: index,
      }))
      .sort((a, b) => {
        if (a.sortValue !== b.sortValue) {
          return a.sortValue - b.sortValue;
        }
        return a.order - b.order;
      })
      .slice(0, ACTIONABLE_DIMENSION_COUNT)
      .map((entry) => entry.key);
    return new Set(sorted);
  }, [dimensionEntries]);

  const heroScoreText = `Score: ${getAssessmentScore(displayAssessment)?.toFixed(1) ?? "Pending"}`;
  const numericScore = getAssessmentScore(displayAssessment);
  const isGuidedUnlockScore =
    typeof numericScore === "number" &&
    Number.isFinite(numericScore) &&
    numericScore >= GUIDED_UNLOCK_MIN_SCORE &&
    numericScore <= GUIDED_UNLOCK_MAX_SCORE;
  const verdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(displayAssessment?.verdict ?? null),
    [displayAssessment?.verdict],
  );
  const verdictLabelText =
    isGuidedUnlockScore && verdictInfo.label === "Consider" ? "Almost there" : verdictInfo.label;
  const verdictDescriptionText =
    isGuidedUnlockScore && verdictInfo.label === "Consider"
      ? "One focused update unlocks generation."
      : verdictInfo.description;
  const verdictLabelStyle = useMemo(() => {
    const baseStyle = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      padding: "5px 16px",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      lineHeight: 1,
      whiteSpace: "normal",
      textAlign: "center" as const,
      maxWidth: 200,
    };

    switch (verdictInfo.label) {
      case "Apply":
        return {
          ...baseStyle,
          border: "1px solid rgba(16,185,129,0.45)",
          background: "rgba(16,185,129,0.08)",
          color: "#bbf7d0",
        };
      case "Consider":
        return {
          ...baseStyle,
          border: "1px solid rgba(251,191,36,0.5)",
          background: "rgba(251,191,36,0.12)",
          color: "#fde68a",
        };
      case "Skip":
        return {
          ...baseStyle,
          border: "1px solid rgba(248,113,113,0.5)",
          background: "rgba(248,113,113,0.12)",
          color: "#fecdd3",
        };
      default:
        return {
          ...baseStyle,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(241,245,249,0.85)",
        };
    }
  }, [verdictInfo.label]);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      normalizedResolvedJobId &&
      getAssessmentScore(displayAssessment) !== null
    ) {
      console.debug(
        "[FitReview dev] jobId",
        normalizedResolvedJobId,
        "score",
        getAssessmentScore(displayAssessment),
      );
    }
  }, [normalizedResolvedJobId, displayAssessment]);

  useEffect(() => {
    if (!resolvedJobId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setAssessment(null);

      try {
        const response = await fetch(
          requestedAnalysisId
            ? `/api/analysis/fit-assessments/${encodeURIComponent(requestedAnalysisId)}`
            : `/api/analysis/job/${encodeURIComponent(resolvedJobId)}/latest`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Unable to load fit review data.");
        }

        const data = (await response.json()) as FitAssessment;
        if (!cancelled) {
          setAssessment(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error
              ? loadError.message
              : "Unable to load fit review data.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [requestedAnalysisId, resolvedJobId]);

  const hasAnalysis = Boolean(displayAssessment || storedAnalysis?.analysis);
  const displayRecord =
    displayAssessment && typeof displayAssessment === "object"
      ? (displayAssessment as Record<string, unknown>)
      : null;
  const storedRecord =
    storedAnalysis?.analysis && typeof storedAnalysis.analysis === "object"
      ? (storedAnalysis.analysis as Record<string, unknown>)
      : null;

  const baselineVersionId =
    readStringField(displayRecord, ["baselineVersionId", "baseline_version_id"]) ??
    readStringField(storedRecord, ["baselineVersionId", "baseline_version_id"]) ??
    (typeof storedAnalysis?.baselineVersionId === "string"
      ? storedAnalysis.baselineVersionId.trim() || null
      : null);
  const baselineId =
    readStringField(displayRecord, ["baselineId", "baseline_id"]) ??
    readStringField(storedRecord, ["baselineId", "baseline_id"]) ??
    (typeof storedAnalysis?.baselineId === "string"
      ? storedAnalysis.baselineId.trim() || null
      : null);
  const startJobId =
    readStringField(displayRecord, ["jobId", "job_id"]) ??
    readStringField(storedRecord, ["jobId", "job_id"]) ??
    (normalizedResolvedJobId || null);
  const fitAssessmentId =
    readStringField(displayRecord, ["assessmentId", "fitAssessmentId"]) ??
    readStringField(storedRecord, ["assessmentId", "fitAssessmentId"]);

  const scoreBreakdown = useMemo(
    () => extractScoreBreakdown(displayRecord ?? storedRecord),
    [displayRecord, storedRecord],
  );
  const gapAnalysis = useMemo(
    () => extractGapAnalysis(displayRecord ?? storedRecord),
    [displayRecord, storedRecord],
  );
  const resolvedGaps = useMemo(
    () => resolveFitReviewGaps({ gapAnalysis, scoreBreakdown }),
    [gapAnalysis, scoreBreakdown],
  );

  const handleAddExperienceNow = () => {
    if (!startJobId || !fitAssessmentId) {
      setReturnToStudioError("Reload the role analysis before returning to Studio.");
      return;
    }
    setReturnToStudioError(null);
    void router.push(
      getStudioHref({
        jobId: startJobId,
        baselineId,
        baselineVersionId,
        analysisId: fitAssessmentId ?? null,
        assessmentId: fitAssessmentId ?? null,
        fromUnlock: true,
        unlockDimension: resolvedGaps.primaryGap.dimension,
        missingEvidence: resolvedGaps.primaryGap.missingEvidence,
      }),
    );
  };

  const openDimensionDialog = (dimension: FitReviewDimensionKey) => {
    setDialogError(null);
    setActiveDimension(dimension);
    setDialogAnswers((prev) => {
      const existing = prev[dimension];
      const targetLength = fitReviewQuestions[dimension].length;
      if (existing && existing.length === targetLength) {
        return prev;
      }
      return {
        ...prev,
        [dimension]: Array(targetLength).fill(""),
      };
    });
  };

  const closeDialog = () => {
    setActiveDimension(null);
    setDialogError(null);
  };

  const handleAnswerChange = (index: number, value: string) => {
    if (!activeDimension) return;
    setDialogAnswers((prev) => {
      const answers = prev[activeDimension] ?? Array(fitReviewQuestions[activeDimension].length).fill("");
      const next = [...answers];
      next[index] = value;
      return {
        ...prev,
        [activeDimension]: next,
      };
    });
  };

  const handleDialogSubmit = () => {
    if (!activeDimension) return;
    const answers = (dialogAnswers[activeDimension] ?? [])
      .map((answer) => answer.trim())
      .filter((answer) => answer.length);

    if (!answers.length) {
      setDialogError("Please share at least one detail to craft the evidence.");
      return;
    }

    const additionText = answers.join(" - ");
    setProposedAdditions((prev) => ({
      ...prev,
      [activeDimension]: additionText,
    }));
    setDialogError(null);
    setActiveDimension(null);
  };

  const handleStartEditing = (dimension: FitReviewDimensionKey) => {
    const existing =
      proposedAdditions[dimension] ?? approvedAdditions[dimension] ?? "";
    setEditingKey(dimension);
    setEditingText(existing ?? "");
  };

  const handleSaveEdit = () => {
    if (!editingKey) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      return;
    }
    setProposedAdditions((prev) => ({
      ...prev,
      [editingKey]: trimmed,
    }));
    setEditingKey(null);
    setEditingText("");
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditingText("");
  };

  const handleApproveAddition = (dimension: FitReviewDimensionKey) => {
    const addition = proposedAdditions[dimension] ?? "";
    if (!addition) return;
    setApprovedAdditions((prev) => ({
      ...prev,
      [dimension]: addition,
    }));
    setProposedAdditions((prev) => {
      const next = { ...prev };
      delete next[dimension];
      return next;
    });
    setEditingKey(null);
  };

  const handleStartInterview = async () => {
    if (!startJobId) {
      setStartInterviewError("Job context is required to start the interview.");
      return;
    }

    if (!baselineVersionId && !baselineId) {
      setStartInterviewError("Baseline context is required to start the interview.");
      return;
    }

    setIsStartingInterview(true);
    setStartInterviewError(null);

    try {
      const response = await fetch("/api/interviews/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: startJobId,
          baselineVersionId: baselineVersionId ?? undefined,
          baselineId: baselineId ?? undefined,
          fitAssessmentId: fitAssessmentId ?? undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ?? payload?.message ?? "Unable to start interview.";
        throw new Error(message);
      }

      const payload = (await response.json().catch(() => null)) as
        | { id?: unknown }
        | null;
      const interviewId =
        payload && typeof payload.id === "string" ? payload.id.trim() : "";

      if (!interviewId) {
        throw new Error("Interview started but no interview id was returned.");
      }

      await router.push(`/interviews/${encodeURIComponent(interviewId)}`);
    } catch (buildIssue) {
      const message =
        buildIssue instanceof Error ? buildIssue.message : "Unable to start interview.";
      setStartInterviewError(message);
    } finally {
      setIsStartingInterview(false);
    }
  };

  const sanitizedHighlightedClaim = useMemo(() => {
    const claim = typeof highlightedClaim === "string" ? highlightedClaim.trim() : "";
    if (!claim) return null;
    const normalized = claim.toLowerCase();
    if (normalized === "next" || normalized === "unknown" || normalized === "undefined" || normalized === "null") {
      return null;
    }
    return claim;
  }, [highlightedClaim]);

  const canReturnToStudio = Boolean(startJobId && fitAssessmentId);
  const [returnToStudioError, setReturnToStudioError] = useState<string | null>(null);

  const returnToStudioHref = useMemo(() => {
    const params = new URLSearchParams();
    if (startJobId) params.set("jobId", startJobId);
    if (baselineId) params.set("baselineId", baselineId);
    if (baselineVersionId) params.set("baselineVersionId", baselineVersionId);
    if (fitAssessmentId) {
      params.set("analysisId", fitAssessmentId);
      params.set("assessmentId", fitAssessmentId);
    }
    if (sanitizedHighlightedClaim) params.set("verifiedClaim", sanitizedHighlightedClaim);
    return `/studio?${params.toString()}`;
  }, [baselineId, baselineVersionId, fitAssessmentId, sanitizedHighlightedClaim, startJobId]);

  const handleReturnToStudio = useCallback(() => {
    if (!canReturnToStudio) {
      setReturnToStudioError("Reload the role analysis before returning to Studio.");
      return;
    }
    setReturnToStudioError(null);
    void router.push(returnToStudioHref);
  }, [canReturnToStudio, returnToStudioHref, router]);

  return (
    <InstrumentShell
      kicker="Fit Review"
      title="Fit Review"
      subtitle={HERO_MESSAGE}
    >
      {returnToStudioError ? (
        <div className="px-6 pt-6">
          <Alert intent="warning" title="We couldn’t load your analysis">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-3xl text-sm text-slate-100">{returnToStudioError}</p>
              <FormButton onClick={() => void router.push("/analyze")}>Run Analyze again</FormButton>
            </div>
          </Alert>
        </div>
      ) : null}
      {sanitizedHighlightedClaim ? (
        <div className="px-6 pt-6">
          <Alert intent="info" title="Claim to verify">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-3xl text-sm text-slate-100">{sanitizedHighlightedClaim}</p>
              <FormButton onClick={handleReturnToStudio}>
                Confirm and return to Studio
              </FormButton>
            </div>
          </Alert>
        </div>
      ) : null}
          {!hasAnalysis ? (
            <div className="px-6 py-10">
              <EmptyState
                title="Run Analyze first"
                body="Load the latest fit score before starting your recovery path."
                cta={
                  <FormButton variant="ghost" onClick={() => router.push("/analyze")}>
                    Run Analyze
                  </FormButton>
                }
                className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
              />
            </div>
          ) : (
        <>
          <div style={ttrLayout.panelsRow}>
            <section style={{ ...ttrComponents.basePanel, flex: 0.95, position: "relative" }}>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  gap: 20,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <ScoreGauge
                    score={getAssessmentScore(displayAssessment) ?? undefined}
                    loading={loading}
                    label="Fit Score"
                  />
                  <span style={ttrTypography.caption}>{verdictLabelText}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={ttrTypography.subtleLabel}>Current result</span>
                    <h2 style={ttrTypography.h2}>{isGuidedUnlockScore ? "Almost there" : "Evidence review"}</h2>
                  </div>
                  <p style={{ margin: 0, color: "rgba(241,245,249,0.92)", fontSize: 15 }}>
                    {displayAssessment?.summary ??
                      "Capture verified evidence for the highlighted dimensions to unlock generation."}
                  </p>
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span style={verdictLabelStyle}>{verdictLabelText}</span>
                    <p
                      style={{
                        margin: 0,
                        color: "rgba(226,232,240,0.75)",
                        fontSize: 13,
                        flex: "1 1 200px",
                        minWidth: 220,
                      }}
                    >
                      {verdictDescriptionText}
                    </p>
                  </div>
                  {error ? <div style={ttrComponents.dangerBox}>{error}</div> : null}
                  <p className="text-lg font-semibold text-slate-100">{heroScoreText}</p>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                      Why you can trust this score
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      The score is tied to rubric dimensions and your exact baseline and job context.
                    </p>
                  </div>
                  {insufficientBaselineSupportPenalty ? (
                    <div
                      className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-slate-100"
                      data-testid="fit-review-score-cap-warning"
                    >
                      <p className="text-sm text-slate-100">
                        Score capped because the verified baseline does not show enough support for this role scope.
                      </p>
                      {insufficientBaselineSupportSignals ? (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-100/90">
                          {typeof insufficientBaselineSupportSignals.baselineRecall === "number" ? (
                            <li>Baseline recall: {insufficientBaselineSupportSignals.baselineRecall.toFixed(1)}%</li>
                          ) : null}
                          {typeof insufficientBaselineSupportSignals.responsibilityOverlap === "number" ? (
                            <li>
                              Responsibility overlap:{" "}
                              {insufficientBaselineSupportSignals.responsibilityOverlap.toFixed(1)}%
                            </li>
                          ) : null}
                          {typeof insufficientBaselineSupportSignals.requiredToolCoverage === "number" ? (
                            <li>
                              Required tool coverage:{" "}
                              {insufficientBaselineSupportSignals.requiredToolCoverage.toFixed(1)}%
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <section style={{ ...ttrComponents.basePanel }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Recovery plan</span>
              <h2 style={ttrTypography.h2}>
                {isGuidedUnlockScore ? "Your fastest path to unlock" : "Top evidence gaps"}
              </h2>
            </div>
            {isGuidedUnlockScore ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-slate-100" data-testid="fit-review-primary-gap">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-amber-200/90">
                    You're close. This is the one thing holding you back.
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{resolvedGaps.primaryGap.dimension}</h3>
                  <p className="mt-2 text-sm text-slate-200">{resolvedGaps.primaryGap.reason}</p>
                  {resolvedGaps.primaryGap.missingEvidence.length ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200" data-testid="fit-review-missing-evidence">
                      {resolvedGaps.primaryGap.missingEvidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-3 text-sm text-slate-200">{resolvedGaps.primaryGap.suggestedAction}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <FormButton onClick={handleAddExperienceNow} data-testid="fit-review-primary-cta">
                      Add this experience now
                    </FormButton>
                  </div>
                </div>
                {resolvedGaps.secondaryGaps.length ? (
                  <details className="rounded-2xl border border-white/10 bg-slate-900/40 p-4" data-testid="fit-review-secondary-gaps">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                      Other areas to strengthen
                    </summary>
                    <div className="mt-3 space-y-3 text-sm text-slate-200">
                      {resolvedGaps.secondaryGaps.map((gap) => (
                        <div key={gap.dimension} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{gap.dimension}</p>
                          <p className="mt-2 text-sm text-slate-200">{gap.reason}</p>
                          {gap.missingEvidence.length ? (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-300">
                              {gap.missingEvidence.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                }}
              >
                {dimensionEntries.map((entry) => {
                  const isActionable = actionableDimensionKeys.has(entry.key);
                  const isReviewed = Boolean(approvedAdditions[entry.key]);
                  const additionText = approvedAdditions[entry.key] ?? proposedAdditions[entry.key];
                  const isEditing = editingKey === entry.key;
                  const cardBorder =
                    isActionable && !isReviewed
                      ? "border-emerald-500/40 bg-emerald-900/30"
                      : "border-white/10 bg-white/5";
                  return (
                    <article key={entry.key} className={`rounded-2xl border p-4 text-slate-200 ${cardBorder}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{entry.label}</p>
                        {isReviewed ? (
                          <span className="text-xs text-emerald-300">Reviewed</span>
                        ) : isActionable ? (
                          <span className="text-xs text-sky-300">Actionable</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {typeof entry.percent === "number"
                          ? `${entry.percent.toFixed(1)}%`
                          : entry.normalizedValue !== null
                            ? `${entry.normalizedValue.toFixed(1)}`
                            : "Pending"}
                      </p>
                      <p className="text-xs text-slate-400">{entry.points !== null ? `${entry.points.toFixed(1)} points` : "Points pending"}</p>
                      <p className="mt-2 text-sm text-slate-300">
                        {isActionable ? "High-impact evidence gap. Add concrete proof before re-evaluating fit." : "Informational view of this dimension."}
                      </p>
                      {isActionable && !isReviewed ? (
                        <div className="mt-4">
                          <FormButton variant="secondary" onClick={() => openDimensionDialog(entry.key)}>
                            Ask me about this
                          </FormButton>
                        </div>
                      ) : null}
                      {additionText ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-sm text-slate-100">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Proposed evidence</p>
                          {isEditing ? (
                            <div className="mt-1 space-y-2">
                              <textarea
                                className="w-full rounded-xl border border-white/10 bg-slate-900/50 p-2 text-sm text-slate-100 outline-none"
                                rows={3}
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                              />
                              <div className="flex gap-2">
                                <FormButton variant="secondary" onClick={handleSaveEdit}>
                                  Save
                                </FormButton>
                                <FormButton variant="ghost" onClick={handleCancelEdit}>
                                  Cancel
                                </FormButton>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="mt-1 text-slate-200">{additionText}</p>
                              {!isReviewed ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <FormButton variant="secondary" onClick={() => handleStartEditing(entry.key)}>
                                    Edit
                                  </FormButton>
                                  <FormButton onClick={() => handleApproveAddition(entry.key)}>Approve evidence</FormButton>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {isGuidedUnlockScore ? null : (
          <section style={{ ...ttrComponents.basePanel }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={ttrTypography.subtleLabel}>Qualification proof</span>
                <h2 style={ttrTypography.h2}>Continue evidence review</h2>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Use this when you are ready to continue the guided evidence review and unlock the next step.
              </p>
              <div className="mt-4 space-y-3">
                {startInterviewError ? (
                  <Alert intent="error" title="Unable to start interview">
                    {startInterviewError}
                  </Alert>
                ) : null}
                <FormButton
                  onClick={handleStartInterview}
                  disabled={isStartingInterview || !startJobId || (!baselineVersionId && !baselineId)}
                >
                  {isStartingInterview ? "Starting review..." : "Continue Evidence Review"}
                </FormButton>
                <p className="text-xs text-slate-400">
                  Next: answer prompts, validate additions, and continue the recovery path.
                </p>
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-3">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                    Artifact readiness
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Not ready yet. Documents unlock after evidence review creates an updated assessment.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Current baseline version: {baselineVersionId ?? "Unavailable"}
                  </p>
                </div>
              </div>
          </section>
          )}
        </>
      )}

      {activeDimension ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-black/80"
          >
            <h2 className="text-xl font-semibold text-white">
              {fitReviewDimensionLabels[activeDimension]}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Capture evidence for this dimension. Keep your answers factual and based on your experience.
            </p>
            <div className="mt-4 space-y-4">
              {fitReviewQuestions[activeDimension].map((prompt, index) => (
                <div key={`${activeDimension}-${index}`} className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{`Prompt ${index + 1}`}</p>
                  <p className="text-sm text-slate-200">{prompt}</p>
                  <textarea
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-100 outline-none"
                    rows={3}
                    value={(dialogAnswers[activeDimension] ?? [])[index] ?? ""}
                    onChange={(event) => handleAnswerChange(index, event.target.value)}
                  />
                </div>
              ))}
            </div>
            {dialogError ? (
              <p className="mt-4 text-sm text-rose-300">{dialogError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <FormButton variant="ghost" onClick={closeDialog}>
                Cancel
              </FormButton>
              <FormButton onClick={handleDialogSubmit}>Generate proposal</FormButton>
            </div>
          </div>
        </div>
      ) : null}
    </InstrumentShell>
  );
}
