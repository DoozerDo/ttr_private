"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ComplianceViolationPanel } from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { ScoreGauge } from "@/components/ScoreGauge";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TextInput } from "@/components/TextInput";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { useAutoGenerateThreshold } from "../lib/settings";
import { getVerdictDisplayOrDefault } from "@/lib/fit-verdict";
import {
  mapComplianceFlags,
  sanitizeGapMessage,
  sortComplianceFlagsBySeverity,
} from "@/lib/resultsInsights";
import {
  CALIBRATION_PROFILE_OPTIONS,
  type CalibrationProfile,
} from "@/lib/calibration/profiles";

type FitDimensionScores = {
  experienceAlignment?: number;
  leadershipLevel?: number;
  technicalPlatformFit?: number;
  industryContext?: number;
  strategicTacticalFit?: number;
};

type DimensionBreakdown = {
  experience_alignment?: number;
  leadership_level?: number;
  technical_platform_fit?: number;
  industry_context?: number;
  strategic_vs_tactical?: number;
};

type ScoringContractV1DimensionKey =
  | "role_scope_and_seniority"
  | "support_operations_and_process_rigor"
  | "tooling_and_platform_experience"
  | "domain_and_business_context"
  | "change_leadership_and_customer_advocacy";

type ScoringV2PenaltyCode = "scope_mismatch_downlevel" | "domain_mismatch_hard";

type ScoringV2Penalty = {
  code: ScoringV2PenaltyCode;
  points: number;
  reason: string;
};

type ScoringV2ToolingCoverage = {
  requiredCoverage: number;
  preferredCoverage: number;
};

type ScoringV2DebugInfo = {
  jobScoringTextSource: "normalized" | "raw";
  baselineBand: string;
  roleBand: string;
  bandDelta: number;
  domainTagsBaseline: string[];
  domainTagsRole: string[];
  responsibilityOverlapPercent: number;
  baselineCoveragePercent: number;
  toolingCoverage: ScoringV2ToolingCoverage;
};

type ScoringV2Rubric = {
  id: "scoring_contract_v1";
  weights: Record<ScoringContractV1DimensionKey, number>;
  dimensionPercents: Record<ScoringContractV1DimensionKey, number>;
  dimensionPoints: Record<ScoringContractV1DimensionKey, number>;
  subtotal: number;
  penalties: ScoringV2Penalty[];
  finalBeforeClamp: number;
  rounding: string;
};

type ScoringV2Result = {
  score: number;
  rubric: ScoringV2Rubric;
  debug: ScoringV2DebugInfo;
  jobTextSource?: "normalized" | "raw";
};

type LatestAnalysis = {
  baselineId: string;
  baselineVersion?: number | null;
  baselineVersionId?: string | null;
  baselineVersionHash?: string | null;
  jobId: string;
  jobTextSource?: "normalized" | "raw" | null;
  overallScore?: number;
  note?: string;
  verdict?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  assessmentId?: string | null;
  score?: number | null;
  auditId?: string | null;
  audit_id?: string | null;
  dimensionScores?: FitDimensionScores | null;
  expandedDimensionScores?: FitDimensionScores | null;
  breakdown?: DimensionBreakdown | null;
  strengths?: string[];
  gaps?: string[];
  complianceFlags?: string[];
  summary?: string | null;
  evaluationNotes?: string[] | null;
  systemConstraints?: string[] | null;
  createdAt?: string | null;
  scoring_v2?: ScoringV2Result | null;
};

type CalibrationMetadata = {
  profile: CalibrationProfile;
  label: string;
  delta: number;
};

type CalibratedResult = LatestAnalysis & {
  calibration?: CalibrationMetadata;
};

type NextStep = {
  title: string;
  description: string;
};

type NextStepArgs = {
  score: number | null | undefined;
  verdict?: string | null;
  hasAnalysis: boolean;
  autoGenerateThreshold: number;
};

const debugUiEnabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";

const DIMENSION_LABELS: Record<keyof FitDimensionScores, string> = {
  experienceAlignment: "Experience alignment",
  leadershipLevel: "Leadership level",
  technicalPlatformFit: "Technical platform fit",
  industryContext: "Industry & context",
  strategicTacticalFit: "Strategic vs tactical",
};

const SCORING_DIMENSION_ORDER: ScoringContractV1DimensionKey[] = [
  "role_scope_and_seniority",
  "support_operations_and_process_rigor",
  "tooling_and_platform_experience",
  "domain_and_business_context",
  "change_leadership_and_customer_advocacy",
];

const SCORING_DIMENSION_LABELS: Record<ScoringContractV1DimensionKey, string> = {
  role_scope_and_seniority: "Role scope and seniority",
  support_operations_and_process_rigor: "Support operations and process rigor",
  tooling_and_platform_experience: "Tooling and platform experience",
  domain_and_business_context: "Domain and business context",
  change_leadership_and_customer_advocacy: "Change leadership and customer advocacy",
};

const LOW_EXPERIENCE_THRESHOLD = 70;

const formatPercentValue = (value?: number | null) =>
  typeof value === "number" ? `${value.toFixed(1)}%` : "n/a";

function normalizeDimensionScores(data?: LatestAnalysis | null): FitDimensionScores {
  if (!data) return {};
  if (data.dimensionScores) return data.dimensionScores;
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

  const fallback = data as Record<string, unknown>;
  if (fallback.dimension_scores && typeof fallback.dimension_scores === "object") {
    const scores = fallback.dimension_scores as Record<string, unknown>;
    return {
      experienceAlignment:
        typeof scores.experience_alignment === "number" ? scores.experience_alignment : undefined,
      leadershipLevel: typeof scores.leadership_level === "number" ? scores.leadership_level : undefined,
      technicalPlatformFit:
        typeof scores.technical_platform_fit === "number" ? scores.technical_platform_fit : undefined,
      industryContext:
        typeof scores.industry_context === "number" ? scores.industry_context : undefined,
      strategicTacticalFit:
        typeof scores.strategic_vs_tactical === "number" ? scores.strategic_vs_tactical : undefined,
    };
  }

  return {};
}

const getNextSteps = ({
  score,
  verdict,
  hasAnalysis,
  autoGenerateThreshold,
}: NextStepArgs): NextStep[] => {
  const verdictInfo = getVerdictDisplayOrDefault(verdict);
  const scoreLabel = typeof score === "number" ? score.toFixed(1) : "pending";

  return [
    {
      title: "Understand the score summary",
      description: hasAnalysis
        ? `Review the strengths, gaps, and experience area contributions above to see how the ${scoreLabel} score came together.`
        : "Load the latest analysis to reveal the score summary and supporting context.",
    },
    {
      title: "Decide whether to apply",
      description:
        "Weigh the highlighted gaps against the role priorities and your timing, and open Fit Review if you want deeper context before moving forward.",
    },
    {
      title: "Generate or polish a resume",
      description: `Open the Studio to generate a draft, copy the text, or download documents. Exports remain available anytime, regardless of score.`,
    },
    {
      title: "Apply and log the progress",
      description: "Capture the opportunity in your tracker, confirm next steps, and secure the application window.",
    },
    {
      title: "Prepare for interviews",
      description: "Once you've decided to apply, leverage the Interview Toolkit to practice around the gaps exposed above.",
    },
  ];
};

type AnyObject = Record<string, unknown>;

function resolveUnknownMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { message?: unknown; error?: unknown };
  if (typeof candidate.message === "string" && candidate.message.length) {
    return candidate.message;
  }
  if (typeof candidate.error === "string" && candidate.error.length) {
    return candidate.error;
  }
  return undefined;
}

function stripInternalKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalKeys);

  if (value && typeof value === "object") {
    const obj = value as AnyObject;
    const out: AnyObject = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();

      const looksInternal =
        key.includes("audit") ||
        key.includes("hash") ||
        key === "jobid" ||
        key === "baselineid" ||
        key === "baselineversionid" ||
        key.endsWith("_id") ||
        key === "id";

      if (looksInternal) continue;

      out[k] = stripInternalKeys(v);
    }
    return out;
  }

  return value;
}

function coercePreviewText(payload: unknown): string | null {
  const p = payload as AnyObject | null;

  const candidates = ["previewText", "preview_text", "text", "rawText", "raw_text", "content"];

  for (const key of candidates) {
    const v = p?.[key];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }

  return null;
}

function safeJsonPreview(payload: unknown): string {
  try {
    const stripped = stripInternalKeys(payload);
    return JSON.stringify(stripped, null, 2);
  } catch {
    return "Preview unavailable";
  }
}

type ResumeSectionLike = {
  type?: string | null;
  title?: string | null;
  content?: unknown;
  text?: unknown;
  lines?: unknown;
  bullets?: unknown;
};

function stringsOnly(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractSectionText(section: ResumeSectionLike): string {
  const candidates: unknown[] = [section.content, section.text];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length) return c.trim();
  }

  const lines = stringsOnly(section.lines);
  if (lines.length) return lines.join("\n");

  const bullets = stringsOnly(section.bullets);
  if (bullets.length) return bullets.map((b) => `• ${b}`).join("\n");

  return "";
}

function extractBestResumeText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  try {
    const direct = typeof coercePreviewText === "function" ? coercePreviewText(payload) : null;
    if (typeof direct === "string" && direct.trim().length) return direct.trim();
  } catch {
    // ignore
  }

  const sectionsRaw = obj["sections"];
  if (!Array.isArray(sectionsRaw)) return null;

  const sections = sectionsRaw as ResumeSectionLike[];

  const rawSection =
    sections.find((s) => (s.type ?? "").toString().toUpperCase() === "RAW") ??
    sections.find((s) => (s.title ?? "").toString().toUpperCase() === "RAW");

  const picked = rawSection ?? sections[0];
  if (!picked) return null;

  const text = extractSectionText(picked);
  return text.length ? text : null;
}

export default function ResultsPage() {
  const [baselineId, setBaselineId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [latest, setLatest] = useState<LatestAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [complianceError, setComplianceError] = useState<ParsedComplianceError | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"manual" | "latest">("manual");
  const [lastLoadedRunIdentifier, setLastLoadedRunIdentifier] = useState<string | null>(null);
  const [autoGenerateThreshold] = useAutoGenerateThreshold();
  const [calibrationProfile, setCalibrationProfile] = useState<CalibrationProfile>("balanced");
  const [calibrationResult, setCalibrationResult] = useState<CalibratedResult | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [useCalibratedScore, setUseCalibratedScore] = useState(false);
  const [debugCopyStatus, setDebugCopyStatus] = useState<string | null>(null);
  // Prevent SSR hydration mismatches for locale and timezone dependent formatting.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
  const [experienceActionTarget, setExperienceActionTarget] = useState<string | null>(null);
  const confidenceSettingsRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const runIdentifier = useMemo(() => {
    const candidate =
      searchParams?.get("assessmentId") ??
      searchParams?.get("analysisId") ??
      searchParams?.get("fitScoreId");
    return candidate?.trim() ?? null;
  }, [searchParams]);

  const setManualBaselineId = (value: string) => {
    setBaselineId(value);
    setAnalysisSource("manual");
  };

  const setManualJobId = (value: string) => {
    setJobId(value);
    setAnalysisSource("manual");
  };

  const getDocumentPayload = () => {
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? "";
    return { jobId: jobIdValue, baselineVersionId: baselineVersionIdValue };
  };

  const latestScore: number | null = useMemo(() => {
    if (!latest) return null;
    const scoringV2Score = latest.scoring_v2?.score;
    if (typeof scoringV2Score === "number") return scoringV2Score;
    const fallback =
      latest.overallScore ??
      (typeof latest.score === "number" ? latest.score : latest.score ?? null);
    return typeof fallback === "number" ? fallback : null;
  }, [latest]);

  const activeAnalysis = useMemo(() => {
    if (useCalibratedScore && calibrationResult) return calibrationResult;
    return latest;
  }, [useCalibratedScore, calibrationResult, latest]);

  const activeScore = useMemo(() => {
    if (!activeAnalysis) return null;
    const scoringV2Score = activeAnalysis.scoring_v2?.score;
    if (typeof scoringV2Score === "number") return scoringV2Score;
    const fallback =
      activeAnalysis.overallScore ??
      (typeof activeAnalysis.score === "number" ? activeAnalysis.score : activeAnalysis.score ?? null);
    return typeof fallback === "number" ? fallback : null;
  }, [activeAnalysis]);

  const analysis = latest;
  const scoringV2 = analysis?.scoring_v2 ?? null;
  const scoringRubric = scoringV2?.rubric ?? null;
  const debugFields = scoringV2?.debug ?? null;
  const analysisKeys = analysis ? Object.keys(analysis) : [];
  const hasAnalysis = Boolean(analysis);
  const diagnosticAssessmentId = analysis?.assessmentId ?? runIdentifier ?? "N/A";

  const activeVerdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(activeAnalysis?.verdict ?? null),
    [activeAnalysis?.verdict],
  );

  const gaugeVerdictLabel = activeVerdictInfo.label.toUpperCase();

  const fitReviewPath = useMemo(() => {
    const candidateJobId = (latest?.jobId || jobId || "").trim();
    if (!candidateJobId) return "/fit-review";
    return `/fit-review?jobId=${encodeURIComponent(candidateJobId)}`;
  }, [jobId, latest?.jobId]);

  const readyForDocument = useMemo(() => {
    return analysisSource === "latest" && !!latest?.jobId && !!latest?.baselineVersionId;
  }, [analysisSource, latest?.baselineVersionId, latest?.jobId]);

  const latestBaselineVersionId = latest?.baselineVersionId?.trim() ?? "";
  const studioHref = useMemo(() => {
    const candidateJobId = latest?.jobId?.trim();
    if (!candidateJobId) return "/studio";
    const params = new URLSearchParams();
    params.set("jobId", candidateJobId);
    if (latestBaselineVersionId) {
      params.set("baselineVersionId", latestBaselineVersionId);
    }
    return `/studio?${params.toString()}`;
  }, [latest?.jobId, latestBaselineVersionId]);

  const nextSteps = useMemo(
    () =>
      getNextSteps({
        score: activeScore,
        verdict: activeAnalysis?.verdict ?? null,
        hasAnalysis: !!latest,
        autoGenerateThreshold,
      }),
    [activeAnalysis?.verdict, activeScore, autoGenerateThreshold, latest],
  );

  const selectedCalibrationProfile = useMemo(
    () => CALIBRATION_PROFILE_OPTIONS.find((option) => option.value === calibrationProfile),
    [calibrationProfile],
  );

  const calibrationDeltaText = useMemo(() => {
    const delta = calibrationResult?.calibration?.delta;
    if (typeof delta !== "number") return null;
    if (delta > 0) return `+${delta.toFixed(1)}`;
    if (delta < 0) return delta.toFixed(1);
    return "0.0";
  }, [calibrationResult?.calibration?.delta]);

  const calibrationConfidenceSummary = useMemo(() => {
    if (!calibrationResult) {
      return "Run a calibration when you want to pressure-test how confident you feel about this score.";
    }
    const delta = calibrationResult.calibration?.delta;
    if (typeof delta !== "number") {
      return "Calibration complete. Compare the adjusted score above.";
    }
    if (delta > 0) {
      return `Confidence increased by ${delta.toFixed(1)} points.`;
    }
    if (delta < 0) {
      return `Confidence decreased by ${Math.abs(delta).toFixed(1)} points.`;
    }
    return "Confidence steady.";
  }, [calibrationResult]);

  const calibrationConfidenceRecommendation = useMemo(() => {
    if (!calibrationResult) {
      return "Keep the stored score unchanged; revisit calibration when you want to try a different weighting.";
    }
    const delta = calibrationResult.calibration?.delta;
    if (typeof delta !== "number") {
      return "Compare the calibrated score before you export.";
    }
    if (delta > 0) {
      return "Confidence is higher—move toward document generation while highlighting the strengths above.";
    }
    if (delta < 0) {
      return "Confidence dipped—address the gaps highlighted above before exporting.";
    }
    return "Confidence is unchanged—proceed with the next action.";
  }, [calibrationResult]);

  const normalizedDimensionScores = useMemo(
    () => normalizeDimensionScores(activeAnalysis ?? null),
    [activeAnalysis],
  );
  const dimensionEntries = useMemo(() => {
    const keys = Object.keys(DIMENSION_LABELS) as Array<keyof FitDimensionScores>;
    return keys.map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      value:
        typeof normalizedDimensionScores[key] === "number"
          ? normalizedDimensionScores[key]
          : null,
    }));
  }, [normalizedDimensionScores]);
  const rubricDimensionEntries = useMemo(() => {
    if (!scoringRubric) return [];
    return SCORING_DIMENSION_ORDER.map((key) => ({
      key,
      label: SCORING_DIMENSION_LABELS[key],
      percent:
        typeof scoringRubric.dimensionPercents[key] === "number"
          ? scoringRubric.dimensionPercents[key]
          : null,
      points:
        typeof scoringRubric.dimensionPoints[key] === "number" ? scoringRubric.dimensionPoints[key] : null,
      weight:
        typeof scoringRubric.weights[key] === "number" ? scoringRubric.weights[key] : null,
    }));
  }, [scoringRubric]);

  const debugJsonPayload = useMemo(() => {
    if (!scoringV2) return null;
    return JSON.stringify(
      {
        baselineId: latest?.baselineId ?? null,
        baselineVersionHash: latest?.baselineVersionHash ?? null,
        jobId: latest?.jobId ?? null,
        scoring_v2: scoringV2,
      },
      null,
      2,
    );
  }, [scoringV2, latest?.baselineId, latest?.baselineVersionHash, latest?.jobId]);

  const handleCopyDebugJson = useCallback(async () => {
    if (!debugJsonPayload) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(debugJsonPayload);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = debugJsonPayload;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setDebugCopyStatus("Copied to clipboard");
    } catch (error) {
      setDebugCopyStatus("Copy failed; select the JSON below manually.");
    }
  }, [debugJsonPayload]);

  const summaryCopy = useMemo(() => {
    if (!latest) {
      return "Load the latest analysis to surface how the score reflects your context.";
    }
    const raw = typeof latest.summary === "string" ? latest.summary.trim() : "";
    if (raw.length && !/key term/i.test(raw)) {
      return raw;
    }
    return "Load the latest analysis to surface how the score reflects your context.";
  }, [latest]);

  const rubricDescription = useMemo(
    () =>
      scoringV2?.rubric
        ? "The scoring_contract_v1 rubric captures how each dimension contributes to the CX Fit score."
        : summaryCopy,
    [scoringV2?.rubric, summaryCopy],
  );

  const keyTermDetails = useMemo(() => {
    if (!latest) {
      return { matchedKeyTerms: [], missingKeyTerms: [] };
    }
    const payload = latest as AnyObject;
    const matchedRaw = payload.matchedTerms ?? payload.matched_terms;
    const missingRaw = payload.missingTerms ?? payload.missing_terms;
    const matchedKeyTerms = Array.isArray(matchedRaw)
      ? matchedRaw.filter((term): term is string => typeof term === "string")
      : [];
    const missingKeyTerms = Array.isArray(missingRaw)
      ? missingRaw.filter((term): term is string => typeof term === "string")
      : [];
    return { matchedKeyTerms, missingKeyTerms };
  }, [latest]);
  const keyTermDetailsAvailable =
    keyTermDetails.matchedKeyTerms.length > 0 || keyTermDetails.missingKeyTerms.length > 0;
  const evaluationNotes = useMemo(() => {
    if (!latest) return [];
    const candidates = [latest.systemConstraints, latest.evaluationNotes];
    for (const candidate of candidates) {
      const normalized = stringsOnly(candidate);
      if (normalized.length) return normalized;
    }
    if (typeof latest.note === "string" && latest.note.trim()) {
      return latest.note
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length);
    }
    return [];
  }, [latest]);
  const evaluationNotesAvailable = evaluationNotes.length > 0;
  const keyTermSummary = useMemo(() => {
    const totalTerms =
      keyTermDetails.matchedKeyTerms.length + keyTermDetails.missingKeyTerms.length;
    if (!totalTerms) return "Key term data is not available for this run.";
    return `Matched ${keyTermDetails.matchedKeyTerms.length} of ${totalTerms} key terms from the job description.`;
  }, [keyTermDetails]);

  const complianceFlagList = useMemo(
    () => sortComplianceFlagsBySeverity(mapComplianceFlags(latest?.complianceFlags ?? undefined)),
    [latest?.complianceFlags],
  );

  const strengthItems = useMemo(() => {
    if (!latest?.strengths?.length) return [];
    return latest.strengths
      .map((item) => item?.trim?.())
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .slice(0, 4);
  }, [latest?.strengths]);

  const gapItems = useMemo(() => {
    const normalizedGaps = (latest?.gaps ?? [])
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item): item is string => item.length > 0)
      .map(sanitizeGapMessage);

    const complianceEntries = complianceFlagList.map((flag) => {
      const label = flag.severity === "block" ? "Required boundary" : "Advisory boundary";
      return `${label}: ${flag.message}`;
    });

    return [...normalizedGaps, ...complianceEntries].slice(0, 4);
  }, [latest?.gaps, complianceFlagList]);

  const debugMode = debugUiEnabled;

  const latestStatusMessage = useMemo(() => {
    if (loadingLatest) return "Loading latest analysis...";
    if (!jobId) return "Enter a job ID to load the latest analysis.";
    if (!baselineId) return "Select a baseline to load the latest analysis.";
    if (analysisSource === "latest" && latest) return "Latest analysis loaded.";
    return "Load latest analysis to populate the score and unlock one tap export.";
  }, [analysisSource, jobId, baselineId, latest, loadingLatest]);

  const loadAssessmentById = useCallback(
    async (assessmentId: string) => {
      if (loadingLatest) return;
      if (!assessmentId) {
        setError("Assessment ID is required to load analysis.");
        return;
      }

      setLoadingLatest(true);
      setError(null);
      setLatest(null);
      setComplianceError(null);

      try {
        const res = await fetch(
          `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`,
          { cache: "no-store" },
        );

        const payload = await readResponsePayload(res.clone());

        if (!res.ok) {
          const compliance = parseComplianceError({ status: res.status, payload });
          if (compliance) {
            setComplianceError(compliance);
            return;
          }

          const message = formatErrorMessage(payload, "Unable to load the requested analysis.");
          throw new Error(message);
        }

        const data: LatestAnalysis = await res.json();
        setLatest(data);
        setBaselineId(data.baselineId ?? "");
        setJobId(data.jobId ?? "");
        setAnalysisSource("latest");
      } catch (error: unknown) {
        setError(resolveUnknownMessage(error) ?? "Failed to load analysis");
      } finally {
        setLoadingLatest(false);
      }
    },
    [loadingLatest],
  );

  async function loadLatest() {
    if (loadingLatest) return;
    if (!jobId) {
      setError("Job ID is required to load analysis.");
      return;
    }
    if (!baselineId) {
      setError("Baseline ID is required to load analysis.");
      return;
    }

    const hasManualSelection = baselineId.trim().length > 0 || jobId.trim().length > 0;
    const shouldConfirm = analysisSource === "manual" && hasManualSelection;

    if (shouldConfirm) {
      const proceed =
        typeof window !== "undefined"
          ? window.confirm(
              "Loading the latest analysis will replace the baseline and job IDs you currently have selected. Continue?",
            )
          : true;
      if (!proceed) return;
    }

    setLoadingLatest(true);
    setError(null);
    setLatest(null);
    setComplianceError(null);

    try {
      const res = await fetch(
        `/api/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(baselineId)}/latest`,
        { cache: "no-store" },
      );

      const payload = await readResponsePayload(res.clone());

      if (!res.ok) {
        const compliance = parseComplianceError({ status: res.status, payload });
        if (compliance) {
          setComplianceError(compliance);
          return;
        }

        const message = formatErrorMessage(payload, "Unable to load latest analysis.");
        throw new Error(message);
      }

      const data: LatestAnalysis = await res.json();
      if (!data.assessmentId) {
        throw new Error("Latest assessment is missing an assessment ID.");
      }

      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("jobId");
      params.delete("baselineId");
      params.set("assessmentId", data.assessmentId);
      const query = params.toString();
      const path = query ? `/results?${query}` : "/results";
      await router.replace(path);
    } catch (error: unknown) {
      setError(resolveUnknownMessage(error) ?? "Failed to load analysis");
    } finally {
      setLoadingLatest(false);
    }
  }

  const handleExperienceAction = useCallback((area: string) => {
    setExperienceActionTarget(area);
  }, []);

  useEffect(() => {
    if (!runIdentifier) {
      setLastLoadedRunIdentifier(null);
      return;
    }

    if (runIdentifier === lastLoadedRunIdentifier) return;

    setLastLoadedRunIdentifier(runIdentifier);
    void loadAssessmentById(runIdentifier);
  }, [loadAssessmentById, runIdentifier, lastLoadedRunIdentifier]);

  useEffect(() => {
    setCalibrationResult(null);
    setUseCalibratedScore(false);
    setCalibrationError(null);
  }, [latest?.assessmentId]);

  const handleCalibrate = useCallback(async () => {
    if (!latest?.assessmentId) return;

    const profileOption = selectedCalibrationProfile;
    if (!profileOption?.weights) {
      setCalibrationError("Calibration failed. The selected profile is missing weights.");
      setCalibrationResult(null);
      return;
    }

    setCalibrating(true);
    setCalibrationError(null);

    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: latest.assessmentId,
          profileName: calibrationProfile,
          weights: profileOption.weights,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        await res.text();
        setCalibrationError(
          "Calibration failed. The server returned an unexpected response. This is usually a routing or auth issue.",
        );
        setCalibrationResult(null);
        return;
      }

      const payload = await readResponsePayload(res.clone());

      if (!res.ok) {
        const message = formatErrorMessage(payload, "Unable to calibrate the latest analysis.");
        setCalibrationError(message);
        setCalibrationResult(null);
        return;
      }

      const data = await res.json();
      setCalibrationResult(data as CalibratedResult);
    } catch (error: unknown) {
      setCalibrationError(resolveUnknownMessage(error) ?? "Calibration failed.");
      setCalibrationResult(null);
    } finally {
      setCalibrating(false);
    }
  }, [calibrationProfile, latest?.assessmentId, selectedCalibrationProfile]);

  useEffect(() => {
    const job = searchParams?.get("jobId");
    if (job) setManualJobId(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Results"
          description="Review your score and the reasons behind it, then choose your next move."
        />

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          {!latest ? (
            <EmptyState
              title="No analysis yet"
              body="Load the latest analysis to reveal the fit score summary."
              cta={
                <FormButton
                  variant="ghost"
                  onClick={() => void loadLatest()}
                  disabled={!jobId || loading || loadingLatest}
                >
                  {loadingLatest ? "Loading latest..." : "Load analysis"}
                </FormButton>
              }
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          ) : (
            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] items-start">
              <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-6">
                <div className="flex flex-col items-center gap-4">
                  <ScoreGauge
                    score={activeScore ?? undefined}
                    loading={activeScore === null}
                    label={gaugeVerdictLabel}
                  />
                  <p className="text-center text-sm text-slate-200">{activeVerdictInfo.description}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    Strengths
                  </p>
                  {strengthItems.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-slate-100">
                      {strengthItems.map((item, index) => (
                        <li key={`${item}-${index}`} className="flex items-start gap-2">
                          <span className="text-emerald-300">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">
                      No strengths surfaced yet; run the latest analysis to reveal them.
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">
                    Gaps
                  </p>
                  {gapItems.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-slate-100">
                      {gapItems.map((item, index) => (
                        <li key={`${item}-${index}`} className="flex items-start gap-2">
                          <span className="text-amber-300">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">
                      No gaps surfaced yet; run the latest analysis to highlight where to tighten the story.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {evaluationNotesAvailable ? (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Evaluation notes
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Evaluation notes</h2>
              <p className="mt-1 text-sm text-slate-300">
                Evaluation notes describe the guardrails or context the scoring model followed; they are usually informational and do not require action unless you see a compliance flag.
              </p>
            </div>
            <ul className="space-y-2 text-sm text-slate-200">
              {evaluationNotes.map((note, index) => (
                <li
                  key={`${note}-${index}`}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3"
                >
                  {note}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {complianceError ? <ComplianceViolationPanel error={complianceError} /> : null}

        <section ref={confidenceSettingsRef} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Confidence Check Settings
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Stress-test the score</h2>
              <p className="mt-1 text-sm text-slate-300">
                Confidence Check reruns the score with the profile you select so you can see how the result shifts while keeping the stored score untouched.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Optional</span>
          </div>

          {latest ? (
            <div className="space-y-4">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-3">
                  <label
                    className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400"
                    htmlFor="calibration-profile"
                  >
                    Confidence profile
                  </label>
                  <select
                    id="calibration-profile"
                    value={calibrationProfile}
                    onChange={(event) => setCalibrationProfile(event.target.value as CalibrationProfile)}
                    className="rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 outline-none transition hover:border-white/30 focus:border-emerald-400"
                  >
                    {CALIBRATION_PROFILE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-400 space-y-1">
                    {CALIBRATION_PROFILE_OPTIONS.map((option) => (
                      <p key={option.value} className="flex gap-2">
                        <span
                          className={`font-semibold ${option.value === calibrationProfile ? "text-slate-100" : "text-slate-400"}`}
                        >
                          {option.label}:
                        </span>
                        <span>{option.description}</span>
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  {calibrationResult ? (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                        Latest result
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">
                        {calibrationResult.overallScore?.toFixed(1) ?? "Not available"}
                      </p>
                      <p className="text-sm text-slate-300">
                        {calibrationConfidenceSummary}
                        {calibrationDeltaText ? ` (${calibrationDeltaText} vs current score)` : ""}
                      </p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        Recommendation
                      </p>
                      <p className="text-sm text-slate-300">{calibrationConfidenceRecommendation}</p>
                      <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
                        <input
                          id="use-calibrated-score"
                          type="checkbox"
                          checked={useCalibratedScore}
                          onChange={(event) => setUseCalibratedScore(event.target.checked)}
                          className="h-4 w-4 cursor-pointer rounded border border-white/20 bg-slate-950 text-emerald-300 focus:ring-emerald-400"
                        />
                        <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                          Apply this confidence lens for downstream actions
                        </span>
                      </label>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Run a confidence check to preview how a different lens shifts the score.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <FormButton onClick={() => void handleCalibrate()} disabled={calibrating}>
                  {calibrating ? "Calibrating..." : "Run Confidence Check"}
                </FormButton>
                <p className="text-xs text-slate-400">
                  Confidence check reruns the analysis under the selected profile without overwriting the stored score.
                </p>
              </div>
              {calibrationError ? (
                <Alert intent="error" title="Calibration failed">
                  {calibrationError}
                </Alert>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Load the latest analysis to configure the confidence check.
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Scoring contract
            </p>
            <h2 className="text-lg font-semibold text-slate-100">Rubric breakdown</h2>
            <p className="mt-1 text-sm text-slate-300">{rubricDescription}</p>
          </div>
          {scoringV2?.rubric ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {rubricDimensionEntries.map((dimension) => (
                  <div
                    key={dimension.key}
                    className="rounded-2xl border border-white/10 bg-slate-900/30 p-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      {dimension.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {dimension.percent !== null ? `${dimension.percent.toFixed(1)}%` : "Pending"}
                    </p>
                    <p className="text-xs text-slate-400">
                      Points {dimension.points !== null ? dimension.points.toFixed(1) : "—"} /{" "}
                      {dimension.weight !== null ? dimension.weight.toFixed(1) : "—"} weight
                    </p>
                    {dimension.percent !== null && dimension.percent < LOW_EXPERIENCE_THRESHOLD ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleExperienceAction(dimension.label)}
                          className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300 hover:text-amber-200"
                        >
                          Add or clarify experience
                        </button>
                        <p className="mt-2 text-[11px] text-slate-400">
                          Coming soon: this action will launch the Baseline Expansion Interview. In the meantime, refine the baseline in{" "}
                          <Link href={fitReviewPath} className="text-amber-300 underline">
                            Fit Review
                          </Link>
                          .
                        </p>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    Subtotal
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {scoringRubric?.subtotal.toFixed(1)}
                  </p>
                  <p className="text-xs text-slate-400">Subtotal before penalties</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    Penalties
                  </p>
                  {scoringRubric?.penalties.length ? (
                    <ul className="mt-2 space-y-2 text-sm text-slate-200">
                      {scoringRubric.penalties.map((penalty) => (
                        <li key={`${penalty.code}-${penalty.points}`} className="flex gap-2">
                          <span className="font-semibold text-amber-300">
                            {penalty.points.toFixed(1)} pts
                          </span>
                          <span className="text-slate-300">
                            <span className="font-semibold text-white">{penalty.code}</span> — {penalty.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">No penalties applied.</p>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    Final score
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {typeof scoringV2?.score === "number" ? scoringV2.score.toFixed(1) : "Pending"}
                  </p>
                  <p className="text-xs text-slate-400">Rounded via {scoringRubric?.rounding}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-rose-600/40 bg-rose-950/10 p-4 text-sm text-rose-200">
              <p className="font-semibold text-rose-100">
                scoring_v2 missing from analysis payload
              </p>
              <p className="text-rose-300">
                <strong>Assessment ID:</strong> {diagnosticAssessmentId}
              </p>
              <p className="text-rose-300">
                <strong>Analysis loaded:</strong> {hasAnalysis ? "true" : "false"}
              </p>
              <p className="text-rose-300">
                <strong>Top-level keys:</strong> {analysisKeys.length ? analysisKeys.join(", ") : "none"}
              </p>
              <p className="mt-2 text-xs text-rose-300">
                Rubric breakdown requires scoring_v2.rubric. Refresh or rerun the analysis to load that payload.
              </p>
            </div>
          )}
          {scoringV2?.rubric ? (
            <details className="group rounded-2xl border border-white/10 bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                Debug details
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Baseline band</p>
                  <p className="text-sm text-white">{debugFields?.baselineBand ?? "n/a"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Role band</p>
                  <p className="text-sm text-white">{debugFields?.roleBand ?? "n/a"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Baseline coverage</p>
                  <p className="text-sm text-white">
                    {formatPercentValue(debugFields?.baselineCoveragePercent)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Responsibility overlap</p>
                  <p className="text-sm text-white">
                    {formatPercentValue(debugFields?.responsibilityOverlapPercent)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Job scoring source</p>
                  <p className="text-sm text-white">
                    {debugFields?.jobScoringTextSource ?? scoringV2.jobTextSource ?? "n/a"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Baseline ID</p>
                  <p className="text-sm text-white">{latest?.baselineId ?? "n/a"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Baseline version hash</p>
                  <p className="text-sm text-white">{latest?.baselineVersionHash ?? "n/a"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Job ID</p>
                  <p className="text-sm text-white">{latest?.jobId ?? "n/a"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Tooling coverage</p>
                  <p className="text-sm text-white">
                    Required {formatPercentValue(debugFields?.toolingCoverage?.requiredCoverage)} • Preferred{" "}
                    {formatPercentValue(debugFields?.toolingCoverage?.preferredCoverage)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Domain tags (role)</p>
                  <p className="text-sm text-white">
                    {debugFields?.domainTagsRole?.join(", ") || "None"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Domain tags (baseline)</p>
                  <p className="text-sm text-white">
                    {debugFields?.domainTagsBaseline?.join(", ") || "None"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col items-start gap-2">
                <button
                  type="button"
                  onClick={handleCopyDebugJson}
                  className="rounded-full border border-white/20 bg-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 hover:border-white/40"
                >
                  Copy debug JSON
                </button>
                {debugCopyStatus ? <p className="text-xs text-slate-400">{debugCopyStatus}</p> : null}
              </div>
            </details>
          ) : null}
        </section>


        {!scoringV2?.rubric ? (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Experience areas</p>
              <h2 className="text-lg font-semibold text-slate-100">Score breakdown</h2>
              <p className="mt-1 text-sm text-slate-300">{summaryCopy}</p>
            <p className="text-sm text-slate-300">
              Experience areas describe how your background contributes to each category while the key terms below track whether the job language also appears; focus on the lower contributors to clarify authentic experience.
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {dimensionEntries.map((dimension) => (
              <div
                key={dimension.key}
                className="rounded-2xl border border-white/10 bg-slate-900/30 p-3"
              >
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                  {dimension.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {dimension.value !== null ? dimension.value.toFixed(1) : "Not available"}
                </p>
                {dimension.value !== null && dimension.value < LOW_EXPERIENCE_THRESHOLD ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleExperienceAction(dimension.label)}
                      className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300 hover:text-amber-200"
                    >
                      Add or clarify experience
                    </button>
                    <p className="mt-2 text-[11px] text-slate-400">
                      Coming soon: this action will launch the Baseline Expansion Interview. In the meantime, refine the baseline in{" "}
                      <Link href={fitReviewPath} className="text-amber-300 underline">
                        Fit Review
                      </Link>
                      .
                    </p>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Key terms</p>
                <p className="text-sm text-slate-300">
                  Key terms track the job-specific language that appears in your baseline content while experience areas describe how your background contributes to the role.
                </p>
                <p className="mt-2 text-xs text-slate-400">{keyTermSummary}</p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Context</span>
            </div>
            {keyTermDetailsAvailable ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Matched terms</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-100">
                    {keyTermDetails.matchedKeyTerms.slice(0, 6).map((term) => (
                      <li key={`matched-${term}`} className="flex items-center gap-2">
                        <span className="text-emerald-300">•</span>
                        <span>{term}</span>
                      </li>
                    ))}
                    {!keyTermDetails.matchedKeyTerms.length ? (
                      <li className="text-sm text-slate-500">Not provided.</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Missing or weak terms</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-100">
                    {keyTermDetails.missingKeyTerms.slice(0, 6).map((term) => (
                      <li key={`missing-${term}`} className="flex items-center gap-2">
                        <span className="text-amber-300">•</span>
                        <span>{term}</span>
                      </li>
                    ))}
                    {!keyTermDetails.missingKeyTerms.length ? (
                      <li className="text-sm text-slate-500">Not documented.</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Key term details are not available for this run.</p>
            )}
            <p className="mt-3 text-xs text-slate-300">
              Clarify or expand the baseline evidence in{" "}
              <Link href={fitReviewPath} className="text-amber-300 underline">
                Fit Review
              </Link>{" "}
              so the same experience language shows up naturally and the matched terms reflect the story you tell elsewhere.
            </p>
            </div>
          </section>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Recommended next move
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Follow this path</h2>
              <p className="mt-1 text-sm text-slate-300">
                This sequence mirrors the real-life cadence: understand the score, decide if and how to apply, polish your materials, apply, then prep for interviews.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Ordered flow</span>
          </div>

          <ol className="list-decimal space-y-4 pl-4 text-sm text-slate-300 marker:text-slate-500">
            {nextSteps.map((step, index) => (
              <li key={step.title + "-" + index} className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">{step.title}</p>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>

          <p className="text-sm text-slate-300">
            Tools in this flow include the document generation controls below and the Interview Toolkit mentioned in step 5.
          </p>
        </section>

        {error ? (
          <Alert intent="error" title="Uh oh">
            {error}
          </Alert>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Resume and Cover Letter Studio
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Open the Studio</h2>
              <p className="mt-1 text-sm text-slate-300">
                Generate curated drafts and exportable documents that reflect the score above.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-400">
                Studio pulls in the latest job, baseline, and analysis data so you can keep the momentum going.
              </p>
              <FormButton
                onClick={() => {
                  void router.push(studioHref);
                }}
                disabled={!latest?.jobId || !latestBaselineVersionId}
              >
                Open Resume and Cover Letter Studio
              </FormButton>
            </div>
          </div>
        </section>

        {debugMode ? (
          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Selection</p>
                <h2 className="text-lg font-semibold text-slate-100">Latest IDs</h2>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Baseline
                  </label>
                  <TextInput
                    value={baselineId}
                    onChange={(event) => setManualBaselineId(event.target.value)}
                    placeholder="Baseline ID"
                    readOnly={analysisSource === "latest"}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Job
                  </label>
                  <TextInput
                    value={jobId}
                    onChange={(event) => setManualJobId(event.target.value)}
                    placeholder="Job ID"
                  />
                </div>
              </div>

              {!baselineId ? (
                <Alert intent="warning">
                  Enter a baseline ID or visit the{" "}
                  <Link href="/baseline" className="text-sky-300 underline">
                    baseline library
                  </Link>{" "}
                  to add one before generating resumes.
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <FormButton variant="secondary" onClick={() => void loadLatest()} disabled={!jobId || loading || loadingLatest}>
                  {loadingLatest ? "Loading latest..." : "Load latest analysis"}
                </FormButton>
                <span className="text-xs text-slate-400">{latestStatusMessage}</span>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Latest analysis
                  </p>
                  <h2 className="text-lg font-semibold text-slate-100">Raw JSON</h2>
                </div>
              </div>

              {latest ? (
                <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-200">
                  {JSON.stringify(latest, null, 2)}
                </pre>
              ) : (
                <EmptyState
                  title="No analysis yet"
                  body="Load the latest analysis to inspect the JSON payload."
                  cta={
                    <FormButton variant="ghost" onClick={() => void loadLatest()} disabled={!jobId || loading || loadingLatest}>
                      {loadingLatest ? "Loading latest..." : "Load analysis"}
                    </FormButton>
                  }
                  className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
                />
              )}
            </section>
          </div>
        ) : null}
        {experienceActionTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="experience-cta-title"
              className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-black/80"
            >
              <h2 id="experience-cta-title" className="text-xl font-semibold text-slate-100">
                Coming soon
              </h2>
              <p className="mt-3 text-sm text-slate-300">
                Adding or clarifying experience for {experienceActionTarget} is coming soon. We&apos;ll open the Baseline Expansion Interview for this action in a future release.
              </p>
              <div className="mt-6 flex justify-end">
                <FormButton onClick={() => setExperienceActionTarget(null)}>Got it</FormButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
