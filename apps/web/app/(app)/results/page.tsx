"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ComplianceViolationPanel } from "@/components/ComplianceViolationPanel";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { CareerAlignmentProgress } from "./components/CareerAlignmentProgress";
import { FitImprovementOpportunities } from "./components/FitImprovementOpportunities";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import {
  applyTargetingExclusionsToReadiness,
  buildVerificationIssuesFromCanonicalClaims,
  combineGenerationReadinessFromServer,
  type GenerationReadiness,
  deriveVerificationCoverage,
  normalizeUserFacingRequirementLabel,
  type VerificationCoverage,
} from "@/lib/generationReadiness";
import { normalizeClaimVerifications } from "@/lib/claimVerification";
import { sanitizeScoreExplanationLine, sanitizeScoreExplanationList } from "@/lib/scoreExplanationCopy";
import { getDecisionFromFitScore } from "@/lib/fit-verdict";
import { buildStrategicBrief } from "@/lib/resultsInsights";
import { buildResultsSignalAlignment } from "@/lib/professionalSignals";
import { appendStrengtheningAddition } from "@/lib/baselines";
import { buildEvidenceSuggestion } from "@/lib/evidenceSuggestions";
import { getNextMove, type NextMove } from "@/lib/nextMove";
import { buildScoreDelta, hasBaselineUpdated } from "@/lib/reanalysis";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";
import { getScoreBand, ScoreBand } from "@/src/lib/score-band";

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
  claims?: unknown;
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
  title?: string | null;
  companyName?: string | null;
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
  criticalGaps?: Array<{
    gapId: string;
    title: string;
    description: string;
    severityScore: number;
    requirementEvidence: string;
    baselineEvidence: string | null;
    reasoning: string;
  }>;
  recommendedActions?: string[];
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
  confidenceScore?: number | null;
  confidenceReasons?: string[] | null;
  supportingSignals?: unknown;
  baselineEvidence?: unknown;
  score_breakdown?: {
    total_score: number;
    dimensions: Array<{
      key:
        | "role_scope_and_seniority"
        | "support_operations_and_process_rigor"
        | "tooling_and_platform_experience"
        | "domain_and_business_context"
        | "change_leadership_and_customer_advocacy";
      label: string;
      score: number;
      weight: number;
    }>;
  } | null;
  verification_coverage?: {
    totalClaims?: number | null;
    verifiedClaims?: number | null;
    inferredClaims?: number | null;
    unverifiedClaims?: number | null;
    unverifiedRequirements?: string[] | null;
    verifiedRequirements?: string[] | null;
    inferredRequirements?: string[] | null;
    supportedRequirements?: string[] | null;
  } | null;
};

type ApplicationInsight = {
  message?: string;
  type?: "warning" | "success" | "gap" | string;
};

type DiscoveredRole = {
  roleTitle: string;
  rank: number;
  estimatedFitScore: number;
  fitLevel: "High" | "Medium" | "Stretch";
  verificationCoverageLevel: "high" | "moderate" | "low";
  keySupportingSignals: string[];
  missingGaps: string[];
  explanation: string;
  analyzeHref: string;
};

const ROLE_DISCOVERY_TEMPLATES: Array<{
  roleTitle: string;
  keywords: string[];
  tools: string[];
  explanation: string;
}> = [
  {
    roleTitle: "Director of Customer Support",
    keywords: ["leadership", "support", "operations", "escalation"],
    tools: ["salesforce", "zendesk", "five9", "service cloud"],
    explanation: "Strong leadership + support operations background aligns well with this role.",
  },
  {
    roleTitle: "Head of Customer Operations",
    keywords: ["operations", "leadership", "cross functional", "process"],
    tools: ["salesforce", "servicenow", "zendesk", "hubspot"],
    explanation: "Your operational rigor and cross-functional execution map to customer ops leadership.",
  },
  {
    roleTitle: "CX Strategy Lead",
    keywords: ["strategy", "cx", "change", "program"],
    tools: ["salesforce", "tableau", "looker", "zendesk"],
    explanation: "Change leadership and CX signal coverage make this a viable strategic path.",
  },
  {
    roleTitle: "Support Operations Manager",
    keywords: ["support", "operations", "workflow", "incident"],
    tools: ["zendesk", "salesforce", "jira", "five9"],
    explanation: "Process ownership and tooling signals indicate strong support ops execution fit.",
  },
];

function toSignalText(supportingSignals: unknown, baselineEvidence: unknown): string {
  const parts: string[] = [];
  if (Array.isArray(supportingSignals)) {
    supportingSignals.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) parts.push(entry.trim());
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        if (typeof record.label === "string" && record.label.trim()) parts.push(record.label.trim());
        if (typeof record.name === "string" && record.name.trim()) parts.push(record.name.trim());
      }
    });
  }
  if (typeof baselineEvidence === "string" && baselineEvidence.trim()) parts.push(baselineEvidence.trim());
  if (Array.isArray(baselineEvidence)) {
    baselineEvidence.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) parts.push(entry.trim());
    });
  }
  return parts.join(" ").toLowerCase();
}

function deriveVerificationCoverageLevel(missingGapCount: number): DiscoveredRole["verificationCoverageLevel"] {
  if (missingGapCount === 0) return "high";
  if (missingGapCount <= 2) return "moderate";
  return "low";
}

function deriveFitLevel(input: {
  fitScore: number;
  verificationCoverageLevel: DiscoveredRole["verificationCoverageLevel"];
}): DiscoveredRole["fitLevel"] {
  if (input.fitScore >= 84 && input.verificationCoverageLevel === "high") return "High";
  if (input.fitScore >= 72) return "Medium";
  return "Stretch";
}

export function discoverCompetitiveRoles(input: {
  analysis: LatestAnalysis | null;
  applicationInsights: ApplicationInsight[];
  activeScore: number | null;
}): DiscoveredRole[] {
  const { analysis, applicationInsights, activeScore } = input;
  if (!analysis || typeof activeScore !== "number") return [];

  const coverage = analysis.verification_coverage;
  const supportedRequirements = Array.isArray(coverage?.supportedRequirements)
    ? coverage.supportedRequirements
    : [];
  const unverifiedRequirements = Array.isArray(coverage?.unverifiedRequirements)
    ? coverage.unverifiedRequirements
    : [];
  const signalText = toSignalText(analysis.supportingSignals, analysis.baselineEvidence ?? analysis.summary);
  const outcomeBoost = applicationInsights.some(
    (insight) => typeof insight.message === "string" && insight.message.toLowerCase().includes("received interviews"),
  )
    ? 4
    : 0;

  const roles: DiscoveredRole[] = ROLE_DISCOVERY_TEMPLATES.map((template) => {
    const keywordMatches = template.keywords.filter((keyword) => signalText.includes(keyword)).length;
    const toolMatches = template.tools.filter((tool) =>
      supportedRequirements.some((signal) => signal.toLowerCase().includes(tool)),
    ).length;
    const missingGaps = template.tools.filter((tool) =>
      unverifiedRequirements.some((gap) => gap.toLowerCase().includes(tool)),
    );
    const fitScore = Math.max(
      45,
      Math.min(
        97,
        Math.round(activeScore * 0.65 + keywordMatches * 6 + toolMatches * 5 - missingGaps.length * 4 + outcomeBoost),
      ),
    );
    const verificationCoverageLevel = deriveVerificationCoverageLevel(missingGaps.length);
    const fitLevel = deriveFitLevel({ fitScore, verificationCoverageLevel });
    const params = new URLSearchParams({
      suggestedRole: template.roleTitle,
      source: "results",
    });
    return {
      roleTitle: template.roleTitle,
      rank: 0,
      estimatedFitScore: fitScore,
      fitLevel,
      verificationCoverageLevel,
      keySupportingSignals: supportedRequirements.slice(0, 3),
      missingGaps,
      explanation: template.explanation,
      analyzeHref: `/analyze?${params.toString()}`,
    };
  })
    .sort((a, b) => b.estimatedFitScore - a.estimatedFitScore)
    .slice(0, 4)
    .map((role, index): DiscoveredRole => ({ ...role, rank: index + 1 }));

  return roles;
}

export function resolveDisplayedFitScore(latest: LatestAnalysis | null): number | null {
  if (!latest) return null;
  const breakdownTotal = latest.score_breakdown?.total_score;
  if (typeof breakdownTotal === "number") return breakdownTotal;
  const scoringV2Score = latest.scoring_v2?.score;
  if (typeof scoringV2Score === "number") return scoringV2Score;
  const fallback =
    latest.overallScore ??
    (typeof latest.score === "number" ? latest.score : latest.score ?? null);
  return typeof fallback === "number" ? fallback : null;
}

type ScoreBreakdownShape = {
  total_score: number;
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
  }>;
};

const EVIDENCE_LABEL_BY_KEY: Record<string, string> = {
  role_scope_and_seniority: "Leadership scope alignment",
  support_operations_and_process_rigor: "Operational domain alignment",
  tooling_and_platform_experience: "Tooling/platform alignment",
  domain_and_business_context: "Customer environment alignment",
  change_leadership_and_customer_advocacy: "Change leadership alignment",
};

function trimEvidenceLine(line: string, maxLength = 80): string {
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildEvidenceLines(scoreBreakdown: ScoreBreakdownShape | null): string[] {
  if (!scoreBreakdown?.dimensions?.length) return [];

  return scoreBreakdown.dimensions
    .map((dimension) => {
      const contribution = dimension.weight > 0 ? dimension.score / dimension.weight : 0;
      return {
        ...dimension,
        contribution,
      };
    })
    .filter((dimension) => dimension.score > 0 && dimension.contribution > 0)
    .sort((a, b) => {
      if (b.contribution !== a.contribution) return b.contribution - a.contribution;
      return b.score - a.score;
    })
    .slice(0, 3)
    .map((dimension) =>
      trimEvidenceLine(
        `${EVIDENCE_LABEL_BY_KEY[dimension.key] ?? "Role alignment signal"}: ${dimension.label}.`,
      ),
    );
}

const INTERVIEW_TOOLKIT_PATH = "/interview-toolkit";
const RESULTS_GAPS_SECTION_ANCHOR = "#fit-improvement-opportunities";

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

const COMPATIBILITY_ANALYSIS_ERROR =
  "We couldn't complete the compatibility analysis. Please try running the analysis again.";

const READINESS_LOADING_STATE: GenerationReadiness = {
  status: "limited",
  blocked: false,
  reasonCodes: ["readiness_pending"],
  reasons: [
    {
      code: "personalization_limitation",
      message: "Verifying generation readiness against compliance rules for this analyzed context.",
    },
  ],
  badgeLabel: "LIMITED",
  summary: "Fit score and generation readiness are separate. Tailored generation is currently limited.",
  verificationIssues: [],
};

const formatPercentValue = (value?: number | null) =>
  typeof value === "number" ? `${value.toFixed(1)}%` : "n/a";

function normalizeOpportunityLine(value: string): string {
  return sanitizeScoreExplanationLine(value, "supporting") ?? "";
}

export function getOpportunityVerdict(score?: number | null): {
  label: string;
  explanation: string;
} {
  if (typeof score !== "number") {
    return {
      label: "Pending",
      explanation: "Run an analysis to see how this role aligns with your baseline.",
    };
  }
  const band = getScoreBand(score);
  if (band === ScoreBand.TOP) {
    return {
      label: "Prime Opportunity",
      explanation: "You're a strong match for this role.",
    };
  }
  if (band === ScoreBand.MID) {
    return {
      label: "Competitive Match",
      explanation: "You’re close. Focused tailoring can strengthen this application.",
    };
  }
  return {
    label: "Low Match",
    explanation: "This role currently shows meaningful gaps against your baseline.",
  };
}

export function buildStudioHrefFromResultsContext(input: {
  jobId?: string | null;
  baselineId?: string | null;
  baselineVersionId?: string | null;
  analysisId?: string | null;
}): string {
  const jobId = input.jobId?.trim() ?? "";
  const params = new URLSearchParams();
  if (jobId) {
    params.set("jobId", jobId);
  }

  const analysisId = input.analysisId?.trim() ?? "";
  if (analysisId) {
    params.set("analysisId", analysisId);
  }

  const baselineId = input.baselineId?.trim() ?? "";
  if (baselineId) {
    params.set("baselineId", baselineId);
  }

  const baselineVersionId = input.baselineVersionId?.trim() ?? "";
  if (baselineVersionId) {
    params.set("baselineVersionId", baselineVersionId);
  }

  if (!params.toString()) {
    return "/studio";
  }

  return `/studio?${params.toString()}`;
}

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

type OpportunityMapSectionProps = {
  score: number | null;
  verdict: {
    label: string;
    explanation: string;
  };
  advantageSignals: string[];
  primaryCta:
    | {
        label: string;
        href: string;
        disabled?: boolean;
        description: string;
      }
    | null;
  scoreAnalysisHref: string;
  readiness: GenerationReadiness;
  verificationCoverage: VerificationCoverage;
  canonicalCoverage: LatestAnalysis["verification_coverage"];
  predictiveUnlock:
    | {
        unverifiedRequirements: string[];
        predictedOutcome: "full" | "partial";
        removeAndContinueHref: string;
        reviewInStudioHref: string;
      }
    | null;
  reliabilityFacts: {
    baselineCompleteness: string;
    matchedSignals: number;
    scoreImproved: boolean | null;
    gapsResolvable: boolean;
  };
};

export function buildStudioHrefWithExcludedRequirements(
  studioHref: string,
  excludedRequirements: string[],
): string {
  const [path, query = ""] = studioHref.split("?");
  const params = new URLSearchParams(query);
  excludedRequirements.forEach((requirement) => {
    params.append("excludedRequirements", requirement);
  });
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

type PrimaryResultsCtaInput = {
  activeScore: number | null;
  studioHref: string;
  canOpenStudio: boolean;
  fitReviewPath: string;
  analysisId?: string | null;
};

type PrimaryResultsCtaOutput = {
  label: string;
  href: string;
  disabled: boolean;
  description: string;
};

export function getPrimaryResultsCta({
  activeScore,
  studioHref,
  canOpenStudio,
  fitReviewPath,
  analysisId,
}: PrimaryResultsCtaInput): PrimaryResultsCtaOutput {
  if (typeof activeScore !== "number") {
    return {
      label: "Start Fit Improvement",
      href: fitReviewPath,
      disabled: false,
      description: "You're close, but missing key signals. Improve fit before applying.",
    };
  }

  const nextMove = getNextMove(activeScore);
  if ((nextMove.action === "generate" || nextMove.action === "studio") && !analysisId) {
    console.warn("[results] Missing analysisId for Next Move studio routing fallback.");
  }

  if (nextMove.action === "generate" || nextMove.action === "studio") {
    return {
      label: nextMove.ctaText,
      href: studioHref,
      disabled: !canOpenStudio,
      description: nextMove.description,
    };
  }

  if (nextMove.action === "improve") {
    return {
      label: nextMove.ctaText,
      href: fitReviewPath,
      disabled: false,
      description: nextMove.description,
    };
  }

  return {
    label: nextMove.ctaText,
    href: RESULTS_GAPS_SECTION_ANCHOR,
    disabled: false,
    description: nextMove.description,
  };
}

function resolveLatestBaselineVersionId(baseline: { versions?: Array<{ id: string; versionNumber: number }> } | null): string | null {
  if (!baseline?.versions?.length) return null;
  const [latestVersion] = [...baseline.versions].sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0));
  return typeof latestVersion?.id === "string" && latestVersion.id.trim() ? latestVersion.id.trim() : null;
}

export async function getPreviousAnalysis(
  jobId: string,
  _userId?: string,
  currentAssessmentId?: string | null,
): Promise<LatestAnalysis | null> {
  const targetJobId = jobId.trim();
  if (!targetJobId) return null;
  const response = await fetch(`/api/analysis/fit-assessments?jobId=${encodeURIComponent(targetJobId)}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as LatestAnalysis[];
  const assessments = Array.isArray(payload) ? payload : [];
  const excludedAssessmentId = currentAssessmentId?.trim() ?? "";
  const previous = assessments.find((entry) => {
    const candidateAssessmentId = entry?.assessmentId?.trim() ?? "";
    return candidateAssessmentId.length > 0 && candidateAssessmentId !== excludedAssessmentId;
  });
  return previous ?? null;
}

export function OpportunityMapSection({
  score,
  verdict,
  primaryCta,
  scoreAnalysisHref,
  readiness,
  verificationCoverage,
  canonicalCoverage,
  predictiveUnlock,
}: OpportunityMapSectionProps) {
  const toCanonicalLabels = (labels: string[] | null | undefined): string[] =>
    Array.isArray(labels)
      ? Array.from(
          new Set(
            labels
              .map((label) =>
                normalizeUserFacingRequirementLabel(label, {
                  sourceContext: null,
                  issueCode: "unsupported_technology_claim",
                }),
              )
              .filter((label): label is string => typeof label === "string" && label.length > 0),
          ),
        )
      : [];
  const unverifiedSignals = useMemo(
    () => toCanonicalLabels(canonicalCoverage?.unverifiedRequirements).slice(0, 3),
    [canonicalCoverage?.unverifiedRequirements],
  );
  const readinessToneClass =
    readiness.status === "blocked"
      ? "border-rose-300/30 bg-rose-500/8 text-rose-100"
      : readiness.status === "limited"
        ? "border-slate-500/50 bg-slate-800/80 text-slate-100"
        : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
  const readinessMessage =
    readiness.status === "blocked"
      ? "Generation is currently blocked until key verification gaps are resolved."
      : readiness.status === "limited"
        ? "Some requirements need stronger verification. You can still generate documents, and improving evidence will strengthen results."
        : "Your evidence supports generation for this role.";
  return (
    <section className="rounded-3xl bg-slate-900/65 px-6 py-9 sm:px-8 sm:py-10">
      <div className="max-w-4xl space-y-9">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Decision summary</p>
        <div className="space-y-5">
          <p className="text-[86px] font-black leading-[0.95] tracking-[-0.055em] text-white md:text-[98px] xl:text-[110px] 2xl:text-[118px]">
            {typeof score === "number" ? Math.round(score) : "--"}
          </p>
          <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white md:text-4xl xl:text-5xl">
            {verdict.label}
          </h2>
          <p className="max-w-2xl text-base leading-7 text-slate-100 md:text-lg">{verdict.explanation}</p>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">Built from your validated baseline and role requirements.</p>
        </div>
        <p className="max-w-2xl text-sm text-slate-300">{primaryCta?.description}</p>
        <div className="space-y-4">
          {primaryCta ? (
            primaryCta.disabled ? (
              <span
                data-testid="results-hero-primary-cta"
                className="inline-flex min-h-[52px] min-w-[300px] cursor-not-allowed items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-6 py-3 text-base font-semibold text-slate-400 md:min-w-[320px]"
              >
                {primaryCta.label}
              </span>
            ) : (
              <a
                data-testid="results-hero-primary-cta"
                href={primaryCta.href}
                className="inline-flex min-h-[52px] min-w-[300px] items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 md:min-w-[320px]"
              >
                {primaryCta.label}
              </a>
            )
          ) : null}
          <div>
            <a
              data-testid="results-hero-secondary-action"
              href={scoreAnalysisHref}
              className="text-sm font-medium text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
            >
              View detailed scoring breakdown
            </a>
          </div>
        </div>
        <div
          id="generation-readiness-details"
          className={`rounded-xl border px-4 py-3 text-sm ${readinessToneClass}`}
        >
          <p className="text-xs font-medium tracking-[0.08em] text-slate-300">
            Generation readiness: {readiness.badgeLabel}
          </p>
          <p className="mt-1 text-slate-100">{readinessMessage}</p>
          {readiness.reasons[0]?.message ? (
            <p className="mt-1 text-xs text-slate-300">{readiness.reasons[0].message}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">
            Verification coverage: {verificationCoverage.status.toUpperCase()} · {verificationCoverage.verifiedClaims} /{" "}
            {verificationCoverage.totalClaims > 0 ? verificationCoverage.totalClaims : "?"} verified claims
          </p>
          {unverifiedSignals.length > 0 ? (
            <p className="mt-1 text-xs text-slate-300">Needs stronger verification: {unverifiedSignals.join(", ")}</p>
          ) : null}
          {predictiveUnlock ? (
            <p className="mt-2 text-xs text-slate-300">
              Removing unsupported requirements from targeting can{" "}
              {predictiveUnlock.predictedOutcome === "full"
                ? "fully unlock generation."
                : "improve generation quality while you add stronger evidence."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type AdvancedInsightsCardProps = {
  scoreBreakdown: ScoreBreakdownShape | null;
  showScoreDrivers: boolean;
  renderDriverGrid: (showExtraLine: boolean) => ReactNode;
};

type SignalAlignmentSectionProps = {
  strengths: string[];
  gaps: string[];
  summary: string;
};

export function AdvancedInsightsCard({
  scoreBreakdown,
  showScoreDrivers,
  renderDriverGrid,
}: AdvancedInsightsCardProps) {
  const [expanded, setExpanded] = useState(false);
  if (!showScoreDrivers && !scoreBreakdown) {
    return null;
  }

  return (
    <section
      id="advanced-insights"
      className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))] p-7 shadow-[0_20px_70px_rgba(2,6,23,0.3)]"
    >
      <header className="space-y-3 border-b border-white/10 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Advanced Insights
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          Deeper score analysis
        </h2>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="text-sm font-medium text-slate-200 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
        >
          {expanded ? "Hide detailed scoring breakdown" : "View detailed scoring breakdown"}
        </button>
      </header>

      {expanded ? (
        <>
          {showScoreDrivers ? <div className="mt-5">{renderDriverGrid(false)}</div> : null}

          {scoreBreakdown ? (
            <section className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/38 p-5">
              <h3 className="text-base font-semibold text-slate-100">Supporting score breakdown</h3>
              <div className="mt-4 space-y-3">
                {scoreBreakdown.dimensions.map((dimension) => {
                  const percent =
                    dimension.weight > 0
                      ? Math.max(0, Math.min(100, (dimension.score / dimension.weight) * 100))
                      : 0;
                  return (
                    <div key={`score-breakdown-${dimension.key}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-200">{dimension.label}</span>
                        <span className="font-semibold text-white">
                          {dimension.score.toFixed(1)} / {dimension.weight}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-white/10">
                        <div className="h-1.5 rounded bg-cyan-200/70" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-white/10 pt-2 text-sm">
                  <span className="font-semibold text-slate-200">Total</span>
                  <span className="font-semibold text-white">
                    {scoreBreakdown.total_score.toFixed(1)} / 100
                  </span>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-400">Collapsed by default to keep the decision flow focused.</p>
      )}
    </section>
  );
}

export function SignalAlignmentSection({
  strengths,
  gaps,
  summary,
}: SignalAlignmentSectionProps) {
  if (!strengths.length && !gaps.length) return null;
  return (
    <section className="rounded-3xl bg-slate-900/55 p-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          Why this role fits you
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">{summary}</p>
      </header>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <article className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Strengths
          </p>
          <ul className="space-y-2 text-sm text-slate-100">
            {(strengths.length ? strengths : ["No strong signals were extracted for this run yet."]).map((signal) => (
              <li key={`strength-${signal}`} className="border-b border-white/10 pb-2 last:border-0">
                {signal}
              </li>
            ))}
          </ul>
        </article>
        <article className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
            Gaps to be aware of
          </p>
          <ul className="space-y-2 text-sm text-slate-100">
            {(gaps.length ? gaps : ["No material gaps were identified in this run."]).map((signal) => (
              <li key={`gap-${signal}`} className="border-b border-white/10 pb-2 last:border-0">
                {signal}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

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
      why: `${PUBLIC_DIMENSION_LABELS.support_operations_and_process_rigor} sits at {percent}, so deeper process detail would strengthen alignment.`,
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
  const [generationReadiness, setGenerationReadiness] =
    useState<GenerationReadiness>(READINESS_LOADING_STATE);
  const lastAssessmentHydrationAttempted = useRef(false);
  const trackedCompletionKeysRef = useRef<Set<string>>(new Set());
  const autoLoadPairRef = useRef<string | null>(null);
  const [expandingRequirement, setExpandingRequirement] = useState<string | null>(null);
  const [expansionContext, setExpansionContext] = useState("");
  const [expansionDescription, setExpansionDescription] = useState("");
  const [expansionImpact, setExpansionImpact] = useState("");
  const [expansionConfirmedAccurate, setExpansionConfirmedAccurate] = useState(false);
  const [expansionSubmitting, setExpansionSubmitting] = useState(false);
  const [showReliabilitySignals, setShowReliabilitySignals] = useState(false);
  const [expansionError, setExpansionError] = useState<string | null>(null);
  const [expansionSuccessByRequirement, setExpansionSuccessByRequirement] = useState<Record<string, string>>({});
  const [dismissedSuggestionRequirements, setDismissedSuggestionRequirements] = useState<Set<string>>(new Set());
  const [applicationInsights, setApplicationInsights] = useState<ApplicationInsight[]>([]);
  const [opportunitySaved, setOpportunitySaved] = useState(false);
  const [currentBaselineVersionId, setCurrentBaselineVersionId] = useState<string | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = useState<LatestAnalysis | null>(null);
  const [reanalysisRunning, setReanalysisRunning] = useState(false);
  const savedOpportunityKeysRef = useRef<Set<string>>(new Set());
  const upgradedOpportunityKeysRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    let cancelled = false;
    const loadInsights = async () => {
      try {
        const response = await fetch("/api/applications/insights", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!Array.isArray(payload) || cancelled) return;
        setApplicationInsights(
          payload.filter(
            (item): item is ApplicationInsight =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as { message?: unknown }).message === "string",
          ),
        );
      } catch {
        // non-blocking
      }
    };
    void loadInsights();
    return () => {
      cancelled = true;
    };
  }, []);

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
    return resolveDisplayedFitScore(latest);
  }, [latest]);

  const scoreBreakdown = useMemo(() => {
    if (latest?.score_breakdown?.dimensions?.length) {
      return latest.score_breakdown;
    }
    const rubric = latest?.scoring_v2?.rubric;
    if (!rubric?.dimensionPoints) return null;
    const dimensions = [
      {
        key: "role_scope_and_seniority",
        label: "Role Scope and Seniority",
        score: rubric.dimensionPoints.role_scope_and_seniority ?? 0,
        weight: 25,
      },
      {
        key: "support_operations_and_process_rigor",
        label: "Support Operations and Process Rigor",
        score: rubric.dimensionPoints.support_operations_and_process_rigor ?? 0,
        weight: 25,
      },
      {
        key: "tooling_and_platform_experience",
        label: "Tooling and Platform Experience",
        score: rubric.dimensionPoints.tooling_and_platform_experience ?? 0,
        weight: 20,
      },
      {
        key: "domain_and_business_context",
        label: "Domain and Business Context",
        score: rubric.dimensionPoints.domain_and_business_context ?? 0,
        weight: 15,
      },
      {
        key: "change_leadership_and_customer_advocacy",
        label: "Change Leadership and Customer Advocacy",
        score: rubric.dimensionPoints.change_leadership_and_customer_advocacy ?? 0,
        weight: 15,
      },
    ];
    const total_score = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
    return { total_score, dimensions };
  }, [latest?.score_breakdown, latest?.scoring_v2?.rubric]);

  const scoringV2 = latest?.scoring_v2 ?? null;
  const resultsAssessmentId = latest?.assessmentId ?? null;
  const scoringRubric = scoringV2?.rubric ?? null;
  const debugFields = scoringV2?.debug ?? null;
  const analysisKeys = latest ? Object.keys(latest) : [];
  const hasAnalysis = Boolean(latest);
  const diagnosticAssessmentId = latest?.assessmentId ?? runIdentifier ?? "N/A";

  const activeVerdictDecision = useMemo(
    () => getDecisionFromFitScore(activeScore),
    [activeScore],
  );
  const scoreBand = useMemo(
    () => (typeof activeScore === "number" ? getScoreBand(activeScore) : null),
    [activeScore],
  );
  const baselineUpdatedForReanalysis = useMemo(
    () => hasBaselineUpdated(latest, currentBaselineVersionId),
    [currentBaselineVersionId, latest],
  );
  const reanalysisDelta = useMemo(
    () => buildScoreDelta(previousAnalysis, latest),
    [previousAnalysis, latest],
  );

  useEffect(() => {
    const baselineIdValue = latest?.baselineId?.trim() ?? "";
    if (!baselineIdValue) {
      setCurrentBaselineVersionId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/baselines/${encodeURIComponent(baselineIdValue)}/versions`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setCurrentBaselineVersionId(null);
          return;
        }
        const versions = (await response.json()) as Array<{ id: string; versionNumber: number }>;
        const resolved = resolveLatestBaselineVersionId({ versions });
        if (!cancelled) setCurrentBaselineVersionId(resolved);
      } catch {
        if (!cancelled) setCurrentBaselineVersionId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latest?.baselineId]);

  useEffect(() => {
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const assessmentIdValue = latest?.assessmentId?.trim() ?? "";
    if (!jobIdValue || !assessmentIdValue) {
      setPreviousAnalysis(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const previous = await getPreviousAnalysis(jobIdValue, undefined, assessmentIdValue);
        if (!cancelled) {
          setPreviousAnalysis(previous ?? null);
        }
      } catch {
        if (!cancelled) setPreviousAnalysis(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latest?.assessmentId, latest?.jobId]);
  useEffect(() => {
    const analysisId = latest?.assessmentId?.trim() ?? "";
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const baselineIdValue = latest?.baselineId?.trim() ?? "";
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? "";

    if (!analysisId || !jobIdValue || !baselineIdValue || !baselineVersionIdValue) {
      setGenerationReadiness(READINESS_LOADING_STATE);
      return;
    }

    let cancelled = false;
    setGenerationReadiness(READINESS_LOADING_STATE);

    const body = {
      analysisId,
      jobId: jobIdValue,
      baselineId: baselineIdValue,
      baselineVersionId: baselineVersionIdValue,
    };

    void (async () => {
      try {
        const [resumeResponse, coverResponse] = await Promise.all([
          fetch("/api/resume/readiness", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
          fetch("/api/cover-letters/readiness", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        ]);
        const resumePayload = (await readResponsePayload(resumeResponse)) as
          | Record<string, unknown>
          | null;
        const coverPayload = (await readResponsePayload(coverResponse)) as
          | Record<string, unknown>
          | null;
        if (!resumeResponse.ok || !coverResponse.ok) {
          if (!cancelled) setGenerationReadiness(READINESS_LOADING_STATE);
          return;
        }
        const resolved = combineGenerationReadinessFromServer(
          resumePayload as any,
          coverPayload as any,
        );
        if (!cancelled) setGenerationReadiness(resolved);
      } catch {
        if (!cancelled) setGenerationReadiness(READINESS_LOADING_STATE);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [latest?.assessmentId, latest?.baselineId, latest?.baselineVersionId, latest?.jobId]);

  const isLowScore = scoreBand === ScoreBand.LOW;
  const isExceptionalScore = scoreBand === ScoreBand.TOP;
  const strategicStrengths = useMemo(() => {
    const fromNarrative = Array.isArray(latest?.narrative?.strengths) ? latest.narrative.strengths : [];
    const fromLatest = Array.isArray(latest?.strengths) ? latest.strengths : [];
    return Array.from(new Set([...fromNarrative, ...fromLatest]))
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .slice(0, 4);
  }, [latest?.narrative?.strengths, latest?.strengths]);
  const criticalGapDetails = useMemo(() => {
    if (!Array.isArray(latest?.criticalGaps)) return [];
    return latest.criticalGaps
      .filter((gap) => gap && typeof gap.title === "string")
      .map((gap) => ({
        title: gap.title,
        requirementEvidence: gap.requirementEvidence,
        baselineEvidence: gap.baselineEvidence,
        severityScore: gap.severityScore,
      }));
  }, [latest?.criticalGaps]);
  const recommendedActions = useMemo(() => {
    return Array.isArray(latest?.recommendedActions)
      ? latest.recommendedActions.filter((item) => typeof item === "string" && item.trim().length > 0)
      : [];
  }, [latest?.recommendedActions]);
  const advantageSignals = useMemo(() => {
    const evidenceSignals = buildEvidenceLines(scoreBreakdown).map((line) => normalizeOpportunityLine(line));
    return sanitizeScoreExplanationList(
      [...strategicStrengths, ...evidenceSignals],
      "strength",
      3,
    );
  }, [scoreBreakdown, strategicStrengths]);
  const strategicBrief = useMemo(
    () =>
      buildStrategicBrief({
        verdict: activeVerdictDecision.verdict,
        verdictExplanation: activeVerdictDecision.verdictExplanation,
        strengths: strategicStrengths,
        criticalGaps: criticalGapDetails,
      }),
    [
      activeVerdictDecision.verdict,
      activeVerdictDecision.verdictExplanation,
      strategicStrengths,
      criticalGapDetails,
    ],
  );
  const opportunityVerdict = useMemo(() => getOpportunityVerdict(activeScore), [activeScore]);
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

  const latestBaselineId = latest?.baselineId?.trim() ?? "";
  const latestBaselineVersionId = latest?.baselineVersionId?.trim() ?? "";
  const studioHref = useMemo(() => {
    return buildStudioHrefFromResultsContext({
      jobId: latest?.jobId,
      baselineId: latestBaselineId,
      baselineVersionId: latestBaselineVersionId,
      analysisId: latest?.assessmentId ?? null,
    });
  }, [latest?.assessmentId, latest?.jobId, latestBaselineId, latestBaselineVersionId]);

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
  const canOpenStudio = Boolean(latest?.jobId && latestBaselineId);
  const claimVerifications = useMemo(
    () => normalizeClaimVerifications(debugFields?.toolingCoverage?.claims),
    [debugFields?.toolingCoverage?.claims],
  );
  const verificationCoverage = useMemo(
    () => deriveVerificationCoverage(generationReadiness, claimVerifications),
    [claimVerifications, generationReadiness],
  );
  const reliabilityFacts = useMemo(() => {
    const totalClaims = verificationCoverage.totalClaims;
    const verifiedClaims = verificationCoverage.verifiedClaims;
    const completenessPercent =
      totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 100) : null;
    const baselineCompleteness =
      completenessPercent == null
        ? "Baseline completeness is still being established."
        : completenessPercent >= 100
          ? "Your baseline is fully built for this role."
          : `Baseline completeness for this role is ${completenessPercent}%.`;
    const scoreImproved =
      typeof reanalysisDelta.delta === "number" ? reanalysisDelta.delta > 0 : null;
    const gapsResolvable = Boolean(
      fitReviewPath && (criticalGapDetails.length > 0 || recommendedActions.length > 0),
    );
    return {
      baselineCompleteness,
      matchedSignals: Math.max(advantageSignals.length, verifiedClaims),
      scoreImproved,
      gapsResolvable,
    };
  }, [
    verificationCoverage.totalClaims,
    verificationCoverage.verifiedClaims,
    reanalysisDelta.delta,
    fitReviewPath,
    criticalGapDetails.length,
    recommendedActions.length,
    advantageSignals.length,
  ]);
  const canonicalUnverifiedRequirements = useMemo(() => {
    const raw = latest?.verification_coverage?.unverifiedRequirements;
    if (!Array.isArray(raw) || raw.length === 0) return [] as string[];
    const normalized = raw
      .map((requirement) =>
        normalizeUserFacingRequirementLabel(requirement, {
          sourceContext: null,
          issueCode: "unsupported_technology_claim",
        }),
      )
      .filter((label): label is string => typeof label === "string" && label.length > 0);
    return Array.from(new Set(normalized));
  }, [latest?.verification_coverage?.unverifiedRequirements]);
  const predictiveUnlock = useMemo(() => {
    const scoreValue = typeof activeScore === "number" ? activeScore : null;
    const readinessIsConstrained =
      generationReadiness.status === "limited" || generationReadiness.status === "blocked";
    if (!scoreValue || scoreValue < 85 || !readinessIsConstrained || canonicalUnverifiedRequirements.length === 0) {
      return null;
    }
    const syntheticClaims = canonicalUnverifiedRequirements.map((label) => ({
      key: label.toLowerCase(),
      label,
      category: "unknown",
      sourceType: "job_required",
      status: "UNVERIFIED" as const,
      evidenceRefs: [] as string[],
      generationBlocking: true,
      scoreWeight: 0,
    }));
    const canonicalIssues = buildVerificationIssuesFromCanonicalClaims(syntheticClaims);
    const syntheticReadiness: GenerationReadiness = {
      ...generationReadiness,
      verificationIssues: canonicalIssues,
    };
    const adjusted = applyTargetingExclusionsToReadiness(
      syntheticReadiness,
      new Set(canonicalUnverifiedRequirements.map((label) => label.toLowerCase())),
    );
    return {
      unverifiedRequirements: canonicalUnverifiedRequirements,
      predictedOutcome: adjusted.readiness.status === "ready" ? ("full" as const) : ("partial" as const),
      removeAndContinueHref: buildStudioHrefWithExcludedRequirements(
        studioHref,
        canonicalUnverifiedRequirements,
      ),
      reviewInStudioHref: studioHref,
    };
  }, [activeScore, canonicalUnverifiedRequirements, generationReadiness, studioHref]);
  const canShowEvidenceExpansion = useMemo(
    () =>
      typeof activeScore === "number" &&
      activeScore >= 70 &&
      canonicalUnverifiedRequirements.length > 0,
    [activeScore, canonicalUnverifiedRequirements.length],
  );
  const resetExpansionForm = useCallback(() => {
    setExpansionContext("");
    setExpansionDescription("");
    setExpansionImpact("");
    setExpansionConfirmedAccurate(false);
    setExpansionError(null);
    setExpansionSubmitting(false);
  }, []);
  const submitEvidenceExpansion = useCallback(async (overrideRequirement?: string) => {
    const requirement = (overrideRequirement ?? expandingRequirement)?.trim() ?? "";
    if (!requirement) return;
    if (!latestBaselineId) {
      setExpansionError("Baseline context is missing. Reload Results and try again.");
      return;
    }
    if (!expansionContext.trim() || !expansionDescription.trim()) {
      setExpansionError("Please add where you used this and what you did.");
      return;
    }
    if (!expansionConfirmedAccurate && !overrideRequirement) {
      setExpansionError("Confirm this is accurate and reflects real experience.");
      return;
    }
    setExpansionSubmitting(true);
    setExpansionError(null);
    try {
      const rawText = [
        `${requirement} evidence`,
        `Context: ${expansionContext.trim()}`,
        `Description: ${expansionDescription.trim()}`,
        expansionImpact.trim() ? `Impact: ${expansionImpact.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      await appendStrengtheningAddition(latestBaselineId, {
        signalType: "experience_expansion",
        rawText,
      });
      setExpansionSuccessByRequirement((current) => ({
        ...current,
        [requirement]: `${requirement} is now verified`,
      }));
      setExpandingRequirement(null);
      resetExpansionForm();
      await loadLatest({ interactive: false, allowCreate: true });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "This evidence could not be added. Only include real, defensible experience.";
      setExpansionError(message);
      setExpansionSubmitting(false);
    }
  }, [
    expandingRequirement,
    expansionConfirmedAccurate,
    expansionContext,
    expansionDescription,
    expansionImpact,
    latestBaselineId,
    loadLatest,
    resetExpansionForm,
  ]);
  const autoEvidenceSuggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildEvidenceSuggestion>>();
    for (const requirement of canonicalUnverifiedRequirements) {
      map.set(
        requirement,
        buildEvidenceSuggestion({
          requirement,
          supportingSignals: latest?.supportingSignals,
          baselineEvidence: latest?.baselineEvidence ?? latest?.summary,
        }),
      );
    }
    return map;
  }, [canonicalUnverifiedRequirements, latest?.baselineEvidence, latest?.summary, latest?.supportingSignals]);
  const discoveredRoles = useMemo(
    () =>
      discoverCompetitiveRoles({
        analysis: latest,
        applicationInsights,
        activeScore: typeof activeScore === "number" ? activeScore : null,
      }),
    [activeScore, applicationInsights, latest],
  );
  const primaryResultsCta = useMemo(
    () =>
      typeof activeScore === "number"
        ? getPrimaryResultsCta({
            activeScore,
            studioHref,
            canOpenStudio,
            fitReviewPath,
            analysisId: latest?.assessmentId,
          })
        : null,
    [activeScore, studioHref, canOpenStudio, fitReviewPath, latest?.assessmentId],
  );
  const oneClickResultsCta = useMemo(() => {
    if (!predictiveUnlock) return primaryResultsCta;
    return {
      label: "Remove unsupported requirements and continue",
      href: predictiveUnlock.removeAndContinueHref,
      disabled: !canOpenStudio,
      description: "You're a strong match. Move forward and generate tailored materials.",
    };
  }, [canOpenStudio, predictiveUnlock, primaryResultsCta]);
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
    Boolean(scoringRubric && scoreDrivers.length) &&
    !isExceptionalScore &&
    !isLowScore;
  const signalAlignment = useMemo(
    () =>
      buildResultsSignalAlignment({
        strengths: advantageSignals,
        criticalGapTitles: criticalGapDetails.map((gap) => gap.title),
        recommendedActions,
        scoreBreakdownDimensions: scoreBreakdown?.dimensions ?? [],
        verdictLabel: opportunityVerdict.label,
      }),
    [
      advantageSignals,
      criticalGapDetails,
      recommendedActions,
      scoreBreakdown,
      opportunityVerdict.label,
    ],
  );

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
                  onClick={() => {
                    void router.push(cta.href);
                  }}
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
  const hasJobBaselineContext = useMemo(
    () => Boolean(jobId.trim() && baselineId.trim()),
    [jobId, baselineId],
  );

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
      } catch {
        trackEvent("analysis_load_failed", {
          source: "results",
          status: "assessment_exception",
        });
        setError(COMPATIBILITY_ANALYSIS_ERROR);
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

  async function loadLatest(options?: {
    jobIdOverride?: string;
    baselineIdOverride?: string;
    allowCreate?: boolean;
    interactive?: boolean;
  }) {
    if (loadingLatest) return;
    const targetJobId = options?.jobIdOverride?.trim() || jobId.trim();
    const targetBaselineId = options?.baselineIdOverride?.trim() || baselineId.trim();
    const allowCreate = options?.allowCreate ?? false;
    const interactive = options?.interactive ?? false;

    if (!targetJobId) {
      setError("Job ID is required to load analysis.");
      return;
    }
    if (!targetBaselineId) {
      setError("Baseline ID is required to load analysis.");
      return;
    }

    const hasManualSelection = targetBaselineId.length > 0 || targetJobId.length > 0;
    const shouldConfirm = interactive && analysisSource === "manual" && hasManualSelection;

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
    console.info("[results] hydration_started", {
      stage: "results",
      jobId: targetJobId,
      baselineId: targetBaselineId,
      allowCreate,
    });

    try {
      const res = await fetch(
        `/api/analysis/job/${encodeURIComponent(targetJobId)}/baseline/${encodeURIComponent(targetBaselineId)}/latest`,
        { cache: "no-store" },
      );

      const payload = await readResponsePayload(res.clone());

      if (res.status === 404 && allowCreate) {
        console.info("[results] hydration_not_found_running_analysis", {
          stage: "results",
          jobId: targetJobId,
          baselineId: targetBaselineId,
        });
        const runResponse = await fetch("/api/analysis/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            jobId: targetJobId,
            baselineId: targetBaselineId,
          }),
        });

        const runPayload = await readResponsePayload(runResponse.clone());
        if (!runResponse.ok) {
          const compliance = parseComplianceError({
            status: runResponse.status,
            payload: runPayload,
          });
          if (compliance) {
            setComplianceError(compliance);
            return;
          }
          console.warn("[results] hydration_run_failed", {
            stage: "results",
            status: runResponse.status,
          });
          const message = formatErrorMessage(runPayload, "Unable to run compatibility analysis.");
          throw new Error(message);
        }

        const runObject =
          runPayload && typeof runPayload === "object"
            ? (runPayload as Record<string, unknown>)
            : null;
        const createdAssessmentId =
          (typeof runObject?.assessmentId === "string" ? runObject.assessmentId : null) ??
          (typeof runObject?.id === "string" ? runObject.id : null);

        if (!createdAssessmentId) {
          throw new Error("Compatibility analysis run did not return an assessment ID.");
        }

        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.delete("jobId");
        params.delete("baselineId");
        params.set("assessmentId", createdAssessmentId);
        const query = params.toString();
        const path = query ? `/results?${query}` : "/results";
        await router.replace(path);
        return;
      }

      if (!res.ok) {
        console.warn("[results] hydration_failed", {
          stage: "results",
          status: res.status,
        });
        const compliance = parseComplianceError({ status: res.status, payload });
        if (compliance) {
          setComplianceError(compliance);
          return;
        }

        const message = formatErrorMessage(payload, "Unable to load latest analysis.");
        throw new Error(message);
      }

      const data: LatestAnalysis = await res.json();
      console.info("[results] hydration_succeeded", {
        stage: "results",
        assessmentId: data.assessmentId ?? null,
        jobId: data.jobId ?? null,
        baselineId: data.baselineId ?? null,
      });
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
    } catch {
      console.error("[results] hydration_failed", {
        stage: "results",
        status: "exception",
      });
      trackEvent("analysis_load_failed", {
        source: "results",
        status: "latest_exception",
      });
      setError(COMPATIBILITY_ANALYSIS_ERROR);
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
    const baseline = searchParams?.get("baselineId");
    if (baseline) setManualBaselineId(baseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (runIdentifier) return;
    const queryJobId = searchParams?.get("jobId")?.trim() ?? "";
    const queryBaselineId = searchParams?.get("baselineId")?.trim() ?? "";
    if (!queryJobId || !queryBaselineId) return;

    const pairKey = `${queryJobId}:${queryBaselineId}`;
    if (autoLoadPairRef.current === pairKey) return;
    autoLoadPairRef.current = pairKey;

    setManualJobId(queryJobId);
    setManualBaselineId(queryBaselineId);
    void loadLatest({
      jobIdOverride: queryJobId,
      baselineIdOverride: queryBaselineId,
      allowCreate: true,
      interactive: false,
    });
  }, [runIdentifier, searchParams]);

  useEffect(() => {
    if (runIdentifier || lastAssessmentHydrationAttempted.current) return;
    if (typeof window === "undefined") return;
    const queryJobId = searchParams?.get("jobId")?.trim() ?? "";
    const queryBaselineId = searchParams?.get("baselineId")?.trim() ?? "";
    if (queryJobId && queryBaselineId) return;

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
  }, [runIdentifier, router, searchParams]);

  useEffect(() => {
    if (!latest || typeof activeScore !== "number") {
      return;
    }

    const completionKey =
      latest.assessmentId?.trim() ||
      `${latest.jobId ?? "job"}:${latest.baselineId ?? "baseline"}:${activeScore}`;

    if (trackedCompletionKeysRef.current.has(completionKey)) {
      return;
    }

    trackedCompletionKeysRef.current.add(completionKey);
    trackEvent("role_analysis_completed", {
      source: "results",
      score: activeScore,
      scoreBucket: resolveScoreBucket(activeScore),
      jobId: latest.jobId ?? undefined,
      baselineId: latest.baselineId ?? undefined,
    });
  }, [activeScore, latest]);

  useEffect(() => {
    if (!latest || typeof activeScore !== "number") return;
    const jobIdValue = latest.jobId?.trim() ?? "";
    const analysisIdValue = latest.assessmentId?.trim() ?? "";
    const baselineIdValue = latest.baselineId?.trim() ?? "";
    if (!jobIdValue || !analysisIdValue || !baselineIdValue) return;

    const saveKey = `${analysisIdValue}:${activeScore}`;
    if (savedOpportunityKeysRef.current.has(saveKey)) return;
    savedOpportunityKeysRef.current.add(saveKey);

    const company =
      (typeof latest.companyName === "string" && latest.companyName.trim()) ||
      (typeof latest.company === "string" && latest.company.trim()) ||
      "Unknown company";
    const roleTitle =
      (typeof latest.jobTitle === "string" && latest.jobTitle.trim()) ||
      (typeof latest.title === "string" && latest.title.trim()) ||
      "Untitled role";

    void (async () => {
      try {
        const response = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: jobIdValue,
            analysisId: analysisIdValue,
            baselineId: baselineIdValue,
            score: Math.round(activeScore),
            company,
            roleTitle,
          }),
        });
        if (response.ok) {
          setOpportunitySaved(true);
        }
      } catch {
        // non-blocking
      }
    })();
  }, [activeScore, latest]);

  const rerunAnalysisForCurrentRole = useCallback(async () => {
    const targetJobId = latest?.jobId?.trim() ?? "";
    const targetBaselineId = latest?.baselineId?.trim() ?? "";
    if (!targetJobId || !targetBaselineId) return;
    setReanalysisRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobId: targetJobId,
          baselineId: targetBaselineId,
        }),
      });
      const payload = await readResponsePayload(response.clone());
      if (!response.ok) {
        const message = formatErrorMessage(payload, "Unable to run re-analysis.");
        throw new Error(message);
      }
      const assessmentId =
        (typeof (payload as { assessmentId?: unknown })?.assessmentId === "string"
          ? (payload as { assessmentId: string }).assessmentId
          : null) ??
        (typeof (payload as { id?: unknown })?.id === "string"
          ? (payload as { id: string }).id
          : null);
      if (!assessmentId) {
        throw new Error("Re-analysis did not return an assessment ID.");
      }
      await router.replace(`/results?assessmentId=${encodeURIComponent(assessmentId)}`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run re-analysis.");
    } finally {
      setReanalysisRunning(false);
    }
  }, [latest?.baselineId, latest?.jobId, router]);

  useEffect(() => {
    const previousScore = reanalysisDelta.previousScore;
    const currentScoreValue = reanalysisDelta.currentScore;
    if (typeof previousScore !== "number" || typeof currentScoreValue !== "number") return;
    const upgraded = (previousScore < 70 && currentScoreValue >= 70) || currentScoreValue >= 85;
    if (!upgraded) return;
    const baselineIdValue = latest?.baselineId?.trim() ?? "";
    const jobIdValue = latest?.jobId?.trim() ?? "";
    if (!baselineIdValue || !jobIdValue) return;

    const upgradeKey = `${jobIdValue}:${baselineIdValue}:${currentScoreValue}`;
    if (upgradedOpportunityKeysRef.current.has(upgradeKey)) return;
    upgradedOpportunityKeysRef.current.add(upgradeKey);

    void (async () => {
      try {
        const response = await fetch("/api/opportunities", { cache: "no-store" });
        if (!response.ok) return;
        const opportunities = (await response.json()) as Array<{
          id: string;
          jobId?: string | null;
          baselineId?: string | null;
          status?: string | null;
        }>;
        const match = opportunities.find((entry) => {
          const sameJob = (entry.jobId ?? "").trim() === jobIdValue;
          const sameBaseline = (entry.baselineId ?? "").trim() === baselineIdValue;
          return sameJob && sameBaseline;
        });
        if (!match?.id) return;
        if (typeof match.status === "string" && match.status.trim() === "ready_to_apply") return;
        await fetch(`/api/opportunities/${encodeURIComponent(match.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ready_to_apply" }),
        });
      } catch {
        // non-blocking
      }
    })();
  }, [latest?.baselineId, latest?.jobId, reanalysisDelta.currentScore, reanalysisDelta.previousScore]);

  return (
    <PageShell className="results-page-theme">
      <div className="space-y-5">
        <PageHeader title="Your result" description="Review your compatibility score and next best step." />
        {opportunitySaved ? (
          <p className="text-xs font-medium text-emerald-300">Saved to Opportunities</p>
        ) : null}
        {baselineUpdatedForReanalysis && latest ? (
          <section className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4">
            <p className="text-sm font-semibold text-cyan-100">Updated Baseline Detected</p>
            <p className="mt-1 text-sm text-slate-100">
              Your baseline changed since this analysis. Re-run this same role to measure progress.
            </p>
            <div className="mt-3">
              <FormButton onClick={() => void rerunAnalysisForCurrentRole()} disabled={reanalysisRunning}>
                {reanalysisRunning ? "Re-running..." : "Re-run Analysis"}
              </FormButton>
            </div>
          </section>
        ) : null}
        {previousAnalysis && typeof reanalysisDelta.delta === "number" ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-base font-semibold text-slate-100">Progress since last analysis</h2>
            <p
              className={`mt-2 text-sm font-medium ${
                reanalysisDelta.delta > 0
                  ? "text-emerald-300"
                  : reanalysisDelta.delta < 0
                    ? "text-rose-300"
                    : "text-slate-200"
              }`}
            >
              {reanalysisDelta.delta > 0 ? "+" : ""}
              {Math.round(reanalysisDelta.delta)} points (
              {Math.round(reanalysisDelta.previousScore ?? 0)} {"->"} {Math.round(reanalysisDelta.currentScore ?? 0)})
            </p>
            {reanalysisDelta.newSignals.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-100">New strengths identified:</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-200">
                  {reanalysisDelta.newSignals.map((signal) => (
                    <li key={`new-signal-${signal}`}>- {signal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {reanalysisDelta.lostSignals.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-100">Signals no longer detected:</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-200">
                  {reanalysisDelta.lostSignals.map((signal) => (
                    <li key={`lost-signal-${signal}`}>- {signal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {reanalysisDelta.noImprovement ? (
              <p className="mt-3 text-sm text-amber-200">
                Your updates did not add new signals relevant to this role.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-7 rounded-3xl bg-slate-950/55 p-6">
          {!latest ? (
            <EmptyState
              title="No compatibility analysis yet"
              body={
                loadingLatest
                  ? "Preparing compatibility report…"
                  : hasJobBaselineContext
                    ? "Preparing your Compatibility Analysis automatically…"
                    : "Load the latest Compatibility Analysis to reveal your Fit Verdict and Compatibility Score."
              }
              cta={
                !hasJobBaselineContext ? (
                  <FormButton
                    variant="ghost"
                    onClick={() => void loadLatest({ interactive: true, allowCreate: true })}
                    disabled={!jobId || !baselineId || loading || loadingLatest}
                  >
                    {loadingLatest ? "Preparing report..." : "Load Compatibility Analysis"}
                  </FormButton>
                ) : null
              }
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          ) : (
            <div className="space-y-7">
              <div className="space-y-7">
                  <OpportunityMapSection
                    score={activeScore}
                    verdict={opportunityVerdict}
                    advantageSignals={advantageSignals}
                    primaryCta={oneClickResultsCta}
                    scoreAnalysisHref="#advanced-insights"
                    readiness={generationReadiness}
                    verificationCoverage={verificationCoverage}
                    canonicalCoverage={latest?.verification_coverage ?? null}
                    predictiveUnlock={predictiveUnlock}
                    reliabilityFacts={reliabilityFacts}
                  />
                  {applicationInsights.length ? (
                    <section className="rounded-2xl border border-sky-300/30 bg-sky-500/10 p-4">
                      <h3 className="text-lg font-semibold text-slate-100">Based on your past applications</h3>
                      <ul className="mt-2 space-y-2 text-sm text-slate-100">
                        {applicationInsights.map((insight, index) => (
                          <li key={`application-insight-${index}`}>{insight.message}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {false ? (
                    <section className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4">
                      <h3 className="text-lg font-semibold text-slate-100">Where you are most competitive</h3>
                      <p className="mt-1 text-sm text-slate-200">
                        Based on your experience, these roles are strongest next targets.
                      </p>
                      <div className="mt-3 space-y-3">
                        {discoveredRoles.map((role) => (
                          <article
                            key={`discovered-role-${role.roleTitle}`}
                            className="rounded-xl border border-white/12 bg-slate-950/35 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-100">{role.roleTitle}</p>
                              <p className="text-xs text-slate-200">
                                {role.fitLevel} · {role.estimatedFitScore}
                              </p>
                            </div>
                            <p className="mt-1 text-sm text-slate-200">{role.explanation}</p>
                            {role.missingGaps.length ? (
                              <p className="mt-1 text-xs text-amber-200">
                                Gaps to address: {role.missingGaps.join(", ")}
                              </p>
                            ) : null}
                            <div className="mt-2">
                              <Link
                                href={role.analyzeHref}
                                className="inline-flex rounded-xl border border-emerald-300/45 px-3 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                              >
                                Analyze this role
                              </Link>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {canShowEvidenceExpansion ? (
                    <section className="rounded-2xl border border-white/12 bg-white/5 p-4">
                      <h3 className="text-lg font-semibold text-slate-100">Prove this experience instead</h3>
                      <p className="mt-1 text-sm text-slate-300">
                        Only include experience that is real and defensible.
                      </p>
                      <div className="mt-3 space-y-3">
                        {canonicalUnverifiedRequirements.map((requirement) => {
                          const isOpen = expandingRequirement === requirement;
                          const suggestion = autoEvidenceSuggestions.get(requirement) ?? null;
                          const isDismissed = dismissedSuggestionRequirements.has(requirement.toLowerCase());
                          return (
                            <article
                              key={`results-expansion-${requirement}`}
                              className="rounded-xl border border-white/10 bg-slate-950/35 p-3"
                            >
                              <p className="text-sm text-slate-100">{requirement} is not verified</p>
                              {suggestion && !isDismissed ? (
                                <div className="mt-2 rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-3 text-xs text-slate-100">
                                  <p className="font-semibold text-emerald-100">Suggested evidence:</p>
                                  <p className="mt-1">{suggestion.intro}</p>
                                  <p className="mt-1">
                                    <span className="font-semibold">Context:</span> {suggestion.context}
                                  </p>
                                  <p className="mt-1">
                                    <span className="font-semibold">Description:</span> {suggestion.description}
                                  </p>
                                  <p className="mt-1">
                                    <span className="font-semibold">Scope:</span> {suggestion.scope}
                                  </p>
                                  <div className="mt-2 flex gap-2">
                                    <FormButton
                                      onClick={() => {
                                        setExpansionContext(suggestion.context);
                                        setExpansionDescription(suggestion.description);
                                        setExpansionImpact(suggestion.scope);
                                        setExpansionConfirmedAccurate(true);
                                        void submitEvidenceExpansion(requirement);
                                      }}
                                      disabled={expansionSubmitting}
                                    >
                                      Accept and verify
                                    </FormButton>
                                    <FormButton
                                      variant="secondary"
                                      onClick={() => {
                                        setExpandingRequirement(requirement);
                                        setExpansionContext(suggestion.context);
                                        setExpansionDescription(suggestion.description);
                                        setExpansionImpact(suggestion.scope);
                                        setExpansionConfirmedAccurate(false);
                                        setExpansionError(null);
                                      }}
                                    >
                                      Edit before adding
                                    </FormButton>
                                    <FormButton
                                      variant="ghost"
                                      onClick={() =>
                                        setDismissedSuggestionRequirements((current) => {
                                          const next = new Set(current);
                                          next.add(requirement.toLowerCase());
                                          return next;
                                        })
                                      }
                                    >
                                      Dismiss
                                    </FormButton>
                                  </div>
                                </div>
                              ) : null}
                              <div className="mt-2">
                                <FormButton
                                  variant="secondary"
                                  onClick={() => {
                                    setExpandingRequirement(requirement);
                                    setExpansionError(null);
                                  }}
                                >
                                  Add supporting experience
                                </FormButton>
                              </div>
                              {expansionSuccessByRequirement[requirement] ? (
                                <p className="mt-2 text-sm text-emerald-200">
                                  {expansionSuccessByRequirement[requirement]}
                                </p>
                              ) : null}
                              {isOpen ? (
                                <div className="mt-3 space-y-2 rounded-lg border border-sky-300/30 bg-sky-500/10 p-3">
                                  <label className="block text-xs text-slate-200">
                                    Where did you use this?
                                    <textarea
                                      className="mt-1 w-full rounded-md border border-white/15 bg-slate-900/70 p-2 text-sm text-slate-100"
                                      value={expansionContext}
                                      onChange={(event) => setExpansionContext(event.target.value)}
                                      rows={2}
                                    />
                                  </label>
                                  <label className="block text-xs text-slate-200">
                                    What did you do with this tool?
                                    <textarea
                                      className="mt-1 w-full rounded-md border border-white/15 bg-slate-900/70 p-2 text-sm text-slate-100"
                                      value={expansionDescription}
                                      onChange={(event) => setExpansionDescription(event.target.value)}
                                      rows={3}
                                    />
                                  </label>
                                  <label className="block text-xs text-slate-200">
                                    What impact did this have? (optional)
                                    <textarea
                                      className="mt-1 w-full rounded-md border border-white/15 bg-slate-900/70 p-2 text-sm text-slate-100"
                                      value={expansionImpact}
                                      onChange={(event) => setExpansionImpact(event.target.value)}
                                      rows={2}
                                    />
                                  </label>
                                  <label className="flex items-center gap-2 text-xs text-slate-200">
                                    <input
                                      type="checkbox"
                                      checked={expansionConfirmedAccurate}
                                      onChange={(event) => setExpansionConfirmedAccurate(event.target.checked)}
                                    />
                                    This is accurate and reflects real experience
                                  </label>
                                  {expansionError ? (
                                    <p className="text-xs text-rose-200">{expansionError}</p>
                                  ) : null}
                                  <div className="flex gap-2">
                                    <FormButton
                                      onClick={() => void submitEvidenceExpansion()}
                                      disabled={expansionSubmitting}
                                    >
                                      {expansionSubmitting ? "Saving..." : "Save evidence"}
                                    </FormButton>
                                    <FormButton
                                      variant="ghost"
                                      onClick={() => {
                                        setExpandingRequirement(null);
                                        resetExpansionForm();
                                      }}
                                    >
                                      Cancel
                                    </FormButton>
                                  </div>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  <SignalAlignmentSection
                    strengths={Array.from(
                      new Set([...advantageSignals, ...signalAlignment.strongForRole]),
                    ).slice(0, 6)}
                    gaps={signalAlignment.weakerForRole}
                    summary={signalAlignment.summary}
                  />
                  <section className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4">
                    <button
                      type="button"
                      className="w-full text-left"
                      aria-expanded={showReliabilitySignals}
                      onClick={() => setShowReliabilitySignals((current) => !current)}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Profile signals
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        {showReliabilitySignals ? "Hide reliability context" : "See reliability context"}
                      </p>
                    </button>
                    {showReliabilitySignals ? (
                      <ul className="mt-3 space-y-1 text-sm text-slate-300">
                        <li>{reliabilityFacts.baselineCompleteness}</li>
                        <li>Matched signals from your experience: {reliabilityFacts.matchedSignals}</li>
                        <li>
                          {reliabilityFacts.scoreImproved == null
                            ? "No prior analysis to compare yet."
                            : reliabilityFacts.scoreImproved
                              ? "Your score improved from the previous analysis."
                              : "Your score has not improved from the previous analysis."}
                        </li>
                        <li>
                          {reliabilityFacts.gapsResolvable
                            ? "Current gaps are resolvable through Fit Review."
                            : "Current gaps are not yet resolvable through Fit Review."}
                        </li>
                      </ul>
                    ) : null}
                  </section>
                  {scoreBand !== ScoreBand.TOP ? (
                    <section id="fit-improvement-opportunities" className="rounded-2xl border border-slate-700/50 bg-slate-900/35 p-3">
                      <FitImprovementOpportunities
                        assessmentId={latest.assessmentId ?? null}
                        actionHref={fitReviewPath}
                        compact
                      />
                    </section>
                  ) : null}
                  <section className="rounded-2xl border border-slate-700/50 bg-slate-900/35 p-3">
                    <CareerAlignmentProgress showProgressSection={false} />
                  </section>
                </div>

              <AdvancedInsightsCard
                scoreBreakdown={scoreBreakdown}
                showScoreDrivers={showScoreDrivers}
                renderDriverGrid={renderDriverGrid}
              />
            </div>
          )}
        </section>

        {error ? (
          <Alert intent="error" title="Uh oh">
            <div className="space-y-2">
              <p>{error}</p>
              <FormButton
                variant="ghost"
                onClick={() => void loadLatest()}
                disabled={loadingLatest}
              >
                {loadingLatest ? "Preparing report..." : "Retry Compatibility Analysis"}
              </FormButton>
            </div>
          </Alert>
        ) : null}

        </div>
      </PageShell>
    );
  }


