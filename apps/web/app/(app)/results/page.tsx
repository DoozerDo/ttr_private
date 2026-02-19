"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ComplianceViolationPanel } from "@/components/ComplianceViolationPanel";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { ScoreGauge } from "@/components/ScoreGauge";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TextInput } from "@/components/TextInput";
import type { Achievement } from "@/types/achievement";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { getVerdictDisplayOrDefault } from "@/lib/fit-verdict";

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
  narrative?: {
    headline: string;
    summary: string;
    strengths: string[];
    gaps: string[];
  } | null;
};

const INTERVIEW_TOOLKIT_PATH = "/interview-toolkit";

const LAST_ASSESSMENT_STORAGE_KEY = "ttr-last-assessment-id";

function readLastAssessmentFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_ASSESSMENT_STORAGE_KEY);
}

function writeLastAssessmentToStorage(value: string | null) {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(LAST_ASSESSMENT_STORAGE_KEY, value);
    return;
  }
  window.localStorage.removeItem(LAST_ASSESSMENT_STORAGE_KEY);
}

const debugUiEnabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";

const DIMENSION_LABELS: Record<keyof FitDimensionScores, string> = {
  experienceAlignment: "Experience alignment",
  leadershipLevel: "Leadership level",
  technicalPlatformFit: "Technical platform fit",
  industryContext: "Industry and context",
  strategicTacticalFit: "Strategic vs tactical",
};

const SCORING_DIMENSION_ORDER: ScoringContractV1DimensionKey[] = [
  "role_scope_and_seniority",
  "support_operations_and_process_rigor",
  "tooling_and_platform_experience",
  "domain_and_business_context",
  "change_leadership_and_customer_advocacy",
];

const PUBLIC_DIMENSION_LABELS: Record<ScoringContractV1DimensionKey, string> = {
  role_scope_and_seniority: "Leadership Level",
  support_operations_and_process_rigor: "Support Operations",
  tooling_and_platform_experience: "Tools and Systems",
  domain_and_business_context: "Industry Experience",
  change_leadership_and_customer_advocacy: "Change and Customer Impact",
};

const LOW_EXPERIENCE_THRESHOLD = 70;

const formatPercentValue = (value?: number | null) =>
  typeof value === "number" ? `${value.toFixed(1)}%` : "n/a";

type ScoreDriver = {
  key: ScoringContractV1DimensionKey;
  label: string;
  percent: number | null;
  points: number | null;
  weight: number | null;
  bucket: DriverBucket;
  why: string;
  action: string;
  evidence: string[];
  extraLine?: string;
  cta: { label: string; href: string } | null;
  showNoChangesMessage: boolean;
  ctaDisabled?: boolean;
};

type DriverBucket = "strong" | "watch" | "fix" | "pending";

type DriverCopy = {
  why: string;
  action: string;
};

const DRIVER_COPY: Record<
  ScoringContractV1DimensionKey,
  Record<Exclude<DriverBucket, "pending">, DriverCopy>
> = {
  role_scope_and_seniority: {
    strong: {
      why: `${PUBLIC_DIMENSION_LABELS.role_scope_and_seniority} sits at {percent} and matches the leadership level the role demands.`,
      action: "Document a recent enterprise initiative in Resume Studio so the leadership story stays current.",
    },
    watch: {
      why: `${PUBLIC_DIMENSION_LABELS.role_scope_and_seniority} sits at {percent}, leaving the verdict on the fence until large scale ownership stands out.`,
      action: "Add a leadership narrative in Fit Review that spells out your ownership of critical outcomes.",
    },
    fix: {
      why: `${PUBLIC_DIMENSION_LABELS.role_scope_and_seniority} sits at {percent} and is the biggest limiter before apply.`,
      action: "Clarify the senior scope and outcome in Fit Review to unlock this dimension.",
    },
  },
  support_operations_and_process_rigor: {
    strong: {
      why: `${PUBLIC_DIMENSION_LABELS.support_operations_and_process_rigor} sits at {percent}, showing you sustain the reliability the role expects.`,
      action: "Review the process stories in Resume Studio to keep these examples tied to current work.",
    },
    watch: {
      why: `${PUBLIC_DIMENSION_LABELS.support_operations_and_process_rigor} sits at {percent}, so deeper process detail would raise confidence.`,
      action: "Add a process example in Resume Studio and connect the steps in Fit Review.",
    },
    fix: {
      why: `${PUBLIC_DIMENSION_LABELS.support_operations_and_process_rigor} sits at {percent} and is the main gap slowing readiness.`,
      action: "Map the process leadership evidence inside Fit Review before moving toward apply.",
    },
  },
  tooling_and_platform_experience: {
    strong: {
      why: `${PUBLIC_DIMENSION_LABELS.tooling_and_platform_experience} sits at {percent}, aligning with the technical checklist.`,
      action: "Keep tooling ownership language current in Resume Studio so the story stays sharp.",
    },
    watch: {
      why: `${PUBLIC_DIMENSION_LABELS.tooling_and_platform_experience} sits at {percent} which means depth on key systems would tip it upward.`,
      action: "Outline how you led platform migrations in Fit Review to raise this signal.",
    },
    fix: {
      why: `${PUBLIC_DIMENSION_LABELS.tooling_and_platform_experience} sits at {percent} and keeps the score from rising.`,
      action: "Detail the missing platform coverage in Fit Review before reapplying.",
    },
  },
  domain_and_business_context: {
    strong: {
      why: `${PUBLIC_DIMENSION_LABELS.domain_and_business_context} sits at {percent} and mirrors the employer language.`,
      action: "Refresh domain language in Resume Studio to keep this alignment visible.",
    },
    watch: {
      why: `${PUBLIC_DIMENSION_LABELS.domain_and_business_context} sits at {percent}, so clarifying industry stories would lift the score.`,
      action: "Highlight the immediate business impact of past work inside Fit Review.",
    },
    fix: {
      why: `${PUBLIC_DIMENSION_LABELS.domain_and_business_context} sits at {percent} and is suppressing the verdict.`,
      action: "Add domain context and customer outcomes inside Fit Review before moving forward.",
    },
  },
  change_leadership_and_customer_advocacy: {
    strong: {
      why: `${PUBLIC_DIMENSION_LABELS.change_leadership_and_customer_advocacy} sits at {percent} and shows strategic momentum.`,
      action: "Summarize the latest change leadership wins in Resume Studio for ongoing polish.",
    },
    watch: {
      why: `${PUBLIC_DIMENSION_LABELS.change_leadership_and_customer_advocacy} sits at {percent} and would move up with fresher impact stories.`,
      action: "Highlight those wins in Fit Review so this signal stops slipping.",
    },
    fix: {
      why: `${PUBLIC_DIMENSION_LABELS.change_leadership_and_customer_advocacy} sits at {percent} and is the readiness limiter.`,
      action: "Build targeted Interview Toolkit practice around these change leadership moments.",
    },
  },
};

const WATCH_FIX_CTA_DESTINATIONS: Record<
  ScoringContractV1DimensionKey,
  { label: string; target: "fitReview" | "studio" | "interviewToolkit" }
> = {
  role_scope_and_seniority: { label: "Open Fit Review", target: "fitReview" },
  support_operations_and_process_rigor: { label: "Generate in Resume Studio", target: "studio" },
  tooling_and_platform_experience: { label: "Open Fit Review", target: "fitReview" },
  domain_and_business_context: { label: "Open Fit Review", target: "fitReview" },
  change_leadership_and_customer_advocacy: { label: "Open Interview Toolkit", target: "interviewToolkit" },
};

function percentLabelForCopy(percent?: number | null): string {
  return typeof percent === "number" ? `${percent.toFixed(1)}%` : "pending";
}

function getBucketFromPercent(percent?: number | null): DriverBucket {
  if (typeof percent !== "number") return "pending";
  if (percent >= 90) return "strong";
  if (percent >= 80) return "watch";
  return "fix";
}

function buildDriverWhy(
  key: ScoringContractV1DimensionKey,
  bucket: DriverBucket,
  percentLabel: string,
): string {
  if (bucket === "pending") {
    return "This dimension is still pending a percent so hold before acting.";
  }
  const templates = DRIVER_COPY[key];
  const copy = templates?.[bucket];
  if (!copy) return "This dimension requires a closer look.";
  return copy.why.replace("{percent}", percentLabel);
}

function buildDriverAction(key: ScoringContractV1DimensionKey, bucket: DriverBucket): string {
  if (bucket === "pending") {
    return "Wait for the percent to appear before updating this dimension.";
  }
  const templates = DRIVER_COPY[key];
  const copy = templates?.[bucket];
  if (!copy) return "Review this dimension in the next step.";
  return copy.action;
}

function getCtaForDimension(
  key: ScoringContractV1DimensionKey,
  bucket: DriverBucket,
  paths: {
    fitReviewPath: string;
    studioHref: string;
    interviewToolkitHref: string;
  },
) {
  if (bucket === "strong") {
    return { label: "Polish in Resume Studio", href: paths.studioHref };
  }
  if (bucket === "pending") return null;
  const mapping = WATCH_FIX_CTA_DESTINATIONS[key];
  if (!mapping) return null;
  const href =
    mapping.target === "fitReview"
      ? paths.fitReviewPath
      : mapping.target === "interviewToolkit"
      ? paths.interviewToolkitHref
      : paths.studioHref;
  return { label: mapping.label, href };
}

function pickEvidenceForDimension(
  debugFields: ScoringV2DebugInfo | null,
  key: ScoringContractV1DimensionKey,
  summary?: string | null,
): string[] {
  const evidence: string[] = [];
  if (debugFields) {
    switch (key) {
      case "role_scope_and_seniority":
        if (debugFields.roleBand) evidence.push(`Role band ${debugFields.roleBand}`);
        if (typeof debugFields.bandDelta === "number") {
          evidence.push(`Band delta ${debugFields.bandDelta.toFixed(1)} compared to baseline`);
        }
        break;
      case "support_operations_and_process_rigor":
        if (typeof debugFields.baselineCoveragePercent === "number") {
          evidence.push(
            `Baseline coverage ${debugFields.baselineCoveragePercent.toFixed(1)} percent`,
          );
        }
        if (typeof debugFields.responsibilityOverlapPercent === "number") {
          evidence.push(
            `Responsibility overlap ${debugFields.responsibilityOverlapPercent.toFixed(1)} percent`,
          );
        }
        break;
      case "tooling_and_platform_experience":
        if (typeof debugFields.toolingCoverage?.requiredCoverage === "number") {
          evidence.push(
            `Required tooling coverage ${debugFields.toolingCoverage.requiredCoverage.toFixed(1)} percent`,
          );
        }
        if (typeof debugFields.toolingCoverage?.preferredCoverage === "number") {
          evidence.push(
            `Preferred tooling coverage ${debugFields.toolingCoverage.preferredCoverage.toFixed(1)} percent`,
          );
        }
        break;
      case "domain_and_business_context":
        if (debugFields.domainTagsRole?.length) {
          evidence.push(`Role tags ${debugFields.domainTagsRole.join(", ")}`);
        }
        if (debugFields.domainTagsBaseline?.length) {
          evidence.push(`Baseline tags ${debugFields.domainTagsBaseline.join(", ")}`);
        }
        break;
      case "change_leadership_and_customer_advocacy":
        if (debugFields.jobScoringTextSource) {
          evidence.push(`Job scoring source ${debugFields.jobScoringTextSource}`);
        }
        if (debugFields.domainTagsBaseline?.length) {
          evidence.push(`Domain checkpoint ${debugFields.domainTagsBaseline.join(", ")}`);
        }
        break;
    }
  }
  if (!evidence.length && typeof summary === "string" && summary.trim().length) {
    const snippet = summary.trim().split(/\r?\n/)[0];
    if (snippet) evidence.push(snippet);
  }
  return evidence.slice(0, 2);
}

function pickLeverForDimension(
  debugFields: ScoringV2DebugInfo | null,
  key: ScoringContractV1DimensionKey,
  bucket: DriverBucket,
): string | undefined {
  if (bucket !== "watch") return undefined;
  switch (key) {
    case "role_scope_and_seniority": {
      if (debugFields?.roleBand) {
        return `Tie the ${debugFields.roleBand} band story to a senior outcome`;
      }
      return "Tie a senior outcome to the role scope story";
    }
    case "support_operations_and_process_rigor": {
      if (typeof debugFields?.baselineCoveragePercent === "number") {
        return `Map the ${debugFields.baselineCoveragePercent.toFixed(1)} percent baseline coverage to a process impact`;
      }
      return "Link a process improvement story to the expectations for support operations";
    }
    case "tooling_and_platform_experience": {
      if (typeof debugFields?.toolingCoverage?.requiredCoverage === "number") {
        return `Highlight the ${debugFields.toolingCoverage.requiredCoverage.toFixed(1)} percent required tooling coverage you owned`;
      }
      return "Specify the core platform work that shows you own the tooling";
    }
    case "domain_and_business_context": {
      if (debugFields?.domainTagsRole?.length) {
        return `Frame a story around ${debugFields.domainTagsRole[0]} to match the domain language`;
      }
      return "Describe the business context that connects you to the role";
    }
    case "change_leadership_and_customer_advocacy": {
      return "Link a change leadership win to the customer impact you delivered";
    }
    default:
      return undefined;
  }
}

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
  const [debugCopyStatus, setDebugCopyStatus] = useState<string | null>(null);
  const lastAssessmentHydrationAttempted = useRef(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const runIdentifier = useMemo(() => {
    const candidate =
      searchParams?.get("assessmentId") ??
      searchParams?.get("analysisId") ??
      searchParams?.get("fitScoreId");
    return candidate?.trim() ?? null;
  }, [searchParams]);

  const persistLastAssessmentId = useCallback(async (assessmentId: string | null) => {
    writeLastAssessmentToStorage(assessmentId);
    try {
      await fetch("/api/users/me/last-assessment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId }),
        credentials: "include",
      });
    } catch {
      // best effort; silence failures
    }
  }, []);

  const clearLastAssessmentId = useCallback(async () => {
    await persistLastAssessmentId(null);
  }, [persistLastAssessmentId]);

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

  const activeScore = useMemo(() => {
    if (!latest) return null;
    const scoringV2Score = latest.scoring_v2?.score;
    if (typeof scoringV2Score === "number") return scoringV2Score;
    const fallback =
      latest.overallScore ??
      (typeof latest.score === "number" ? latest.score : latest.score ?? null);
    return typeof fallback === "number" ? fallback : null;
  }, [latest]);

  const scoringV2 = latest?.scoring_v2 ?? null;
  const resultsAssessmentId = latest?.assessmentId ?? null;
  const scoringRubric = scoringV2?.rubric ?? null;
  const debugFields = scoringV2?.debug ?? null;
  const analysisKeys = latest ? Object.keys(latest) : [];
  const hasAnalysis = Boolean(latest);
  const diagnosticAssessmentId = latest?.assessmentId ?? runIdentifier ?? "N/A";

  const activeVerdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(latest?.verdict ?? null),
    [latest?.verdict],
  );

  const executionMode = typeof activeScore === "number" && activeScore >= 70;
  const isLowScore = typeof activeScore === "number" && activeScore < LOW_EXPERIENCE_THRESHOLD;
  const heroScoreText = `Score: ${activeScore?.toFixed(1) ?? "Pending"}`;
  const narrativeHeadline = latest?.narrative?.headline ?? null;
  const narrativeSummary = latest?.narrative?.summary ?? null;
  const heroHeadingFallback = executionMode ? "You're Clear to Apply" : "Alignment Needs Attention";
  const heroHeading = narrativeHeadline ?? heroHeadingFallback;
  const heroSupportTextFallback = executionMode
    ? "This role aligns with your verified baseline."
    : "Review gaps and strengthen alignment before applying.";
  const isExceptionalScore = typeof activeScore === "number" && activeScore >= 90;
  const lowScoreHeroText =
    "Review your score and go to Fit Review to raise it before applying.";
  const heroSupportText = narrativeSummary
    ? null
    : isLowScore
      ? lowScoreHeroText
      : heroSupportTextFallback;
  const dimensionCardBaseClass = "rounded-2xl border bg-slate-900/30 p-3";
  const dimensionCardSuccessExtras = "border-[#22c55e] shadow-[0_0_40px_rgba(34,197,94,0.25)]";
  const dimensionCardDefaultClass = "border-white/10";
  const dimensionCardClassName = `${dimensionCardBaseClass} ${
    executionMode ? dimensionCardSuccessExtras : dimensionCardDefaultClass
  }`;
  const achievementForScore = useMemo<Achievement | null>(() => {
    if (!executionMode) return null;
    return {
      id: "clear_to_apply",
      title: "Achievement Unlocked",
      description:
        "You are clear to apply. You have unlocked personalized document creation.",
      tier: "",
      tone: "success",
      iconKey: "✓",
    };
  }, [executionMode]);

  const jobTrackerHref = "/job-tracker";
  const interviewToolkitHref = useMemo(() => {
    const params = new URLSearchParams({ source: "results" });
    if (resultsAssessmentId) {
      params.set("assessmentId", resultsAssessmentId);
    }
    return `${INTERVIEW_TOOLKIT_PATH}?${params.toString()}`;
  }, [resultsAssessmentId]);

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

  const normalizedDimensionScores = useMemo(
    () => normalizeDimensionScores(latest ?? null),
    [latest],
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
      label: PUBLIC_DIMENSION_LABELS[key],
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

  const canOpenStudio = Boolean(latest?.jobId && latestBaselineVersionId);
  const formatDriverValue = (value?: number | null) =>
    typeof value === "number" ? value.toFixed(1) : "n/a";
  const summarySnippet = typeof latest?.summary === "string" ? latest.summary.trim() : null;
  const scoreDrivers = useMemo<ScoreDriver[]>(() => {
    if (!scoringRubric) return [];
    return rubricDimensionEntries.map((dimension) => {
      const bucket = getBucketFromPercent(dimension.percent);
      const percentLabel = percentLabelForCopy(dimension.percent);
      const why = buildDriverWhy(dimension.key, bucket, percentLabel);
      const action = buildDriverAction(dimension.key, bucket);
      const evidence = pickEvidenceForDimension(debugFields, dimension.key, summarySnippet);
      const cta = getCtaForDimension(dimension.key, bucket, {
        fitReviewPath,
        studioHref,
        interviewToolkitHref,
      });
      const lever = pickLeverForDimension(debugFields, dimension.key, bucket);
      const extraLine =
        bucket === "watch"
          ? lever
            ? `Biggest lever: ${lever}`
            : undefined
          : bucket === "fix"
          ? "This is the main limiter right now."
          : undefined;
      const ctaDisabled = Boolean(cta?.label.includes("Studio") && !canOpenStudio);
      return {
        ...dimension,
        bucket,
        why,
        action,
        evidence,
        extraLine,
        cta,
        ctaDisabled,
        showNoChangesMessage: bucket === "strong" && !cta,
      };
    });
  }, [
    rubricDimensionEntries,
    scoringRubric,
    debugFields,
    fitReviewPath,
    studioHref,
    interviewToolkitHref,
    summarySnippet,
    canOpenStudio,
  ]);

  const showScoreDrivers =
    Boolean(scoringRubric && scoreDrivers.length) && !isExceptionalScore && !isLowScore;

  const renderDriverGrid = (showExtraLine: boolean) => (
    <div className="grid gap-4 lg:grid-cols-2">
      {scoreDrivers.map((driver) => {
        const cta = driver.cta;
        return (
          <article
            key={driver.key}
            className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4"
          >
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{driver.label}</p>
            <p className="text-sm text-slate-400">
              Current score {formatDriverValue(driver.points)} of {formatDriverValue(driver.weight)} points
            </p>
            <div className="space-y-2 text-sm text-slate-200">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Why this mattered</p>
              <p>{driver.why}</p>
              {driver.evidence.length ? (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Evidence</p>
                  <ul className="space-y-1 text-sm text-slate-200 list-disc list-inside">
                    {driver.evidence.map((item, index) => (
                      <li key={`${driver.key}-evidence-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Evidence unavailable for this dimension.</p>
              )}
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Next action</p>
              <p>{driver.action}</p>
              {showExtraLine && driver.extraLine ? (
                <p className="text-xs text-slate-400">{driver.extraLine}</p>
              ) : null}
            </div>
            {cta ? (
              <div>
                <FormButton
                  onClick={() => void router.push(cta.href)}
                  disabled={!!driver.ctaDisabled}
                >
                  {cta.label}
                </FormButton>
              </div>
            ) : driver.showNoChangesMessage ? (
              <p className="text-xs text-slate-400">No changes needed here.</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );

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

  const debugMode = debugUiEnabled;

  const latestStatusMessage = useMemo(() => {
    if (loadingLatest) return "Loading latest analysis...";
    if (!jobId) return "Enter a job ID to load the latest analysis.";
    if (!baselineId) return "Select a baseline to load the latest analysis.";
    if (analysisSource === "latest" && latest) return "Latest analysis loaded.";
    return "Load latest analysis to populate the score and clarify your next move.";
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

          if (res.status === 404) {
            setError("Assessment not found.");
            await clearLastAssessmentId();
            setLatest(null);
            setAnalysisSource("manual");
            setLastLoadedRunIdentifier(null);

            if (typeof window !== "undefined") {
              const params = new URLSearchParams(window.location.search);
              params.delete("assessmentId");
              params.delete("analysisId");
              params.delete("fitScoreId");
              const query = params.toString();
              const destination = query ? `/results?${query}` : "/results";
              await router.replace(destination);
            }

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
        await persistLastAssessmentId(data.assessmentId ?? assessmentId);
      } catch (error: unknown) {
        setError(resolveUnknownMessage(error) ?? "Failed to load analysis");
      } finally {
        setLoadingLatest(false);
      }
    },
    [
      loadingLatest,
      persistLastAssessmentId,
      clearLastAssessmentId,
      router,
    ],
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
    const job = searchParams?.get("jobId");
    if (job) setManualJobId(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (runIdentifier || lastAssessmentHydrationAttempted.current) return;
    if (typeof window === "undefined") return;

    lastAssessmentHydrationAttempted.current = true;

    const hydrateLastAssessment = async () => {
      let serverId: string | null = null;
      let serverLoaded = false;
      try {
        const res = await fetch("/api/users/me/last-assessment", { cache: "no-store" });
        if (res.ok) {
          const payload = await res.json();
          serverId = payload?.lastAssessmentId ?? null;
          serverLoaded = true;
          writeLastAssessmentToStorage(serverId);
        }
      } catch {
        // best effort; we rely on local storage fallback next
      }

      let candidateId = serverId;
      if (candidateId === null && !serverLoaded) {
        candidateId = readLastAssessmentFromStorage();
      }

      if (!candidateId) return;

      const params = new URLSearchParams(window.location.search);
      params.delete("analysisId");
      params.delete("fitScoreId");
      params.set("assessmentId", candidateId);
      const query = params.toString();
      const destination = query ? `/results?${query}` : "/results";
      await router.replace(destination);
    };

    void hydrateLastAssessment();
  }, [runIdentifier, router]);

  return (
    <PageShell className="results-page-theme">
      <div className="space-y-6">
        <PageHeader
          title="Results"
          description="Review your score and the reasons behind it and then advance to your personalized document creation."
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
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-slate-900/30 p-6 shadow-inner">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                  <div className="flex justify-center lg:justify-start lg:w-[240px]">
                    <ScoreGauge score={activeScore ?? undefined} loading={activeScore === null} />
                  </div>
                  <div className="space-y-4 text-center lg:text-left">
                    <p className="text-3xl font-semibold text-white">{heroHeading}</p>
                    <p className="text-xl font-semibold text-white">{heroScoreText}</p>
                    {heroSupportText ? (
                      <p className="text-sm text-slate-300">{heroSupportText}</p>
                    ) : null}
                    {achievementForScore ? (
                      <div className="rounded-3xl border border-emerald-500/40 bg-emerald-900/60 p-4 text-sm text-slate-200">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl text-emerald-200">✓</span>
                          <p className="text-sm text-slate-200">
                            You are clear to apply. You have unlocked personalized document creation.
                          </p>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                      {isLowScore ? (
                        <FormButton onClick={() => void router.push(fitReviewPath)}>
                          Open Fit Review
                        </FormButton>
                      ) : executionMode ? (
                        <FormButton
                          onClick={() => void router.push(studioHref)}
                          disabled={!canOpenStudio}
                        >
                          Open Resume &amp; Cover Letter Studio
                        </FormButton>
                      ) : (
                        <>
                          <FormButton onClick={() => void router.push(fitReviewPath)}>
                            Open Fit Review
                          </FormButton>
                          <FormButton
                            variant="secondary"
                            onClick={() => void router.push(studioHref)}
                            disabled={!canOpenStudio}
                          >
                            Open Resume &amp; Cover Letter Studio
                          </FormButton>
                        </>
                      )}
                    </div>
                    {isLowScore ? (
                      <p className="text-xs text-slate-300">
                        Your next step is Fit Review. Close the primary gaps and recheck your score here.
                      </p>
                    ) : null}
                  </div>
              </div>
            </div>
              {narrativeSummary ? (
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 text-sm text-slate-300">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Why this score
                  </p>
                  <p className="mt-2 text-sm text-slate-300">{narrativeSummary}</p>
                </div>
              ) : null}
              {scoringRubric ? (
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {rubricDimensionEntries.map((dimension) => (
                    <div key={dimension.key} className={dimensionCardClassName}>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                          {dimension.label}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-white">
                          {dimension.percent !== null ? `${dimension.percent.toFixed(1)}%` : "Pending"}
                        </p>
                        <p className="text-xs text-slate-400">
                        {dimension.points !== null ? dimension.points.toFixed(1) : "—"} /{" "}
                        {dimension.weight !== null ? dimension.weight.toFixed(1) : "—"} points
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-rose-600/40 bg-rose-950/10 p-4 text-sm text-rose-200">
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
            </div>
          )}
        </section>

        {showScoreDrivers ? (
          executionMode ? (
            <details className="group rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-100">
                <span>Score drivers</span>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Tap to expand</span>
              </summary>
              <div className="mt-4">{renderDriverGrid(false)}</div>
            </details>
          ) : (
            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Score drivers</p>
              </div>
              {renderDriverGrid(true)}
            </section>
          )
        ) : null}

        {evaluationNotesAvailable ? (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Evaluation notes
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Evaluation notes</h2>
              <p className="mt-1 text-sm text-slate-300">
                Evaluation notes capture the context or guardrails tied to this run; review them if compliance notices appear.
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

        {complianceError?.type === "insufficient_extracted_text" ? (
          <InsufficientExtractedText error={complianceError} />
        ) : complianceError ? (
          <ComplianceViolationPanel error={complianceError} />
        ) : null}

        

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
              <div key={dimension.key} className={dimensionCardClassName}>
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                  {dimension.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {dimension.value !== null ? dimension.value.toFixed(1) : "Not available"}
                </p>
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

        {executionMode ? (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Next move</p>
              <h2 className="text-lg font-semibold text-slate-100">Next Move</h2>
              <p className="mt-1 text-sm text-slate-300">
                Follow these five steps to translate the score into execution.
              </p>
            </div>
            <div className="grid gap-4">
              <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-slate-100">1. Understand the Score</p>
              <p className="text-sm text-slate-300">
                {hasAnalysis
                  ? "Review the rubric and driver cards above to see how the verdict formed."
                  : "Load the latest analysis to populate the score and supporting context."}
              </p>
            </article>
            <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-slate-100">2. Decide Whether to Apply</p>
              <p className="text-sm text-slate-300">
                Use Fit Review to weigh the highlighted gaps and confirm the path forward.
              </p>
              <div className="mt-2">
                <FormButton onClick={() => void router.push(fitReviewPath)}>Open Fit Review</FormButton>
              </div>
            </article>
            <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-slate-100">3. Generate or Polish Resume</p>
              <p className="text-sm text-slate-300">
                Generate a tailored resume and cover letter from this job and your selected baseline. This does not change the fit score.
              </p>
              <div className="mt-2">
                <FormButton onClick={() => void router.push(studioHref)} disabled={!canOpenStudio}>
                  Open Resume &amp; Cover Letter Studio
                </FormButton>
              </div>
            </article>
            <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-slate-100">4. Apply and Log</p>
              <p className="text-sm text-slate-300">
                Capture the opportunity in your tracker so the next steps stay visible.
              </p>
              <div className="mt-2">
                <FormButton onClick={() => void router.push(jobTrackerHref)}>Add to Tracker</FormButton>
              </div>
            </article>
            <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-slate-100">5. Prepare for Interviews</p>
              <p className="text-sm text-slate-300">
                Practice around the highlighted gaps with the Interview Toolkit.
              </p>
              <div className="mt-2">
                <FormButton onClick={() => void router.push(interviewToolkitHref)}>
                  Open Interview Toolkit
                </FormButton>
              </div>
              </article>
            </div>
          </section>
        ) : null}

        {error ? (
          <Alert intent="error" title="Uh oh">
            {error}
          </Alert>
        ) : null}

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

        </div>
      </PageShell>
    );
  }
