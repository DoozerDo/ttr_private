"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ComplianceViolationPanel } from "@/components/ComplianceViolationPanel";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { AnalyzeAnotherRoleBar } from "./components/AnalyzeAnotherRoleBar";
import { OpportunityRadarChart } from "./components/OpportunityRadarChart";
import { CareerAlignmentProgress } from "./components/CareerAlignmentProgress";
import { CareerGravity } from "./components/CareerGravity";
import { CareerInsightEmerging } from "./components/CareerInsightEmerging";
import { FitImprovementOpportunities } from "./components/FitImprovementOpportunities";
import { FitVerdictReveal } from "./components/FitVerdictReveal";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { getDecisionFromFitScore } from "@/lib/fit-verdict";
import { buildStrategicBrief } from "@/lib/resultsInsights";
import type { RiskFactor } from "@/lib/resultsInsights";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";

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
};

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
const COMPATIBILITY_ANALYSIS_ERROR =
  "We couldn't complete the compatibility analysis. Please try running the analysis again.";

const formatPercentValue = (value?: number | null) =>
  typeof value === "number" ? `${value.toFixed(1)}%` : "n/a";

function mapFitClassification(score?: number | null): string {
  if (typeof score !== "number") return "Assessment Pending";
  if (score >= 95) return "Elite Match";
  if (score >= 85) return "Top Tier Candidate";
  if (score >= 70) return "Competitive Alignment";
  if (score >= 50) return "Developing Fit";
  return "Misaligned Role";
}

function getScoreTierLabel(score?: number | null): string {
  if (typeof score !== "number") return "Pending";
  if (score >= 85) return "Strong Target";
  if (score >= 70) return "Competitive";
  return "Needs Work";
}

function getScoreInterpretation(score?: number | null): string {
  if (typeof score !== "number") return "Run an analysis to see where you stand.";
  if (score >= 85) {
    return "You have strong alignment for this role based on the experience reflected in your resume.";
  }
  if (score >= 70) {
    return "You are a plausible candidate, but there are visible gaps that may weaken your competitiveness.";
  }
  return "This role appears to stretch beyond your current fit. The strongest opportunity may be nearby roles where your experience aligns better.";
}

function getRecommendedNextStep(score?: number | null): { title: string; body: string } {
  if (typeof score !== "number") {
    return {
      title: "Run analysis",
      body: "Complete an analysis first so you can act on clear strengths and gaps.",
    };
  }
  if (score >= 85) {
    return {
      title: "Apply with confidence",
      body: "This role appears well aligned with your background. Save this analysis and move into tailored materials.",
    };
  }
  if (score >= 70) {
    return {
      title: "Apply strategically",
      body: "You may still be competitive, but your application should address visible gaps with stronger positioning.",
    };
  }
  return {
    title: "Explore stronger-fit roles",
    body: "You may have better odds targeting adjacent roles where your experience is more directly aligned.",
  };
}

function normalizeOpportunityLine(value: string): string {
  return value.replace(/^[^:]+:\s*/, "").replace(/[.]+$/, "").trim();
}

export function getOpportunityVerdict(score?: number | null): {
  label: string;
  explanation: string;
} {
  if (typeof score !== "number") {
    return {
      label: "Pending",
      explanation: "Run an analysis to see how strong this role looks for you.",
    };
  }
  if (score >= 90) {
    return {
      label: "Prime Opportunity",
      explanation: "You are exceptionally well aligned for this role.",
    };
  }
  if (score >= 80) {
    return {
      label: "Strong Match",
      explanation: "You are highly competitive for this role.",
    };
  }
  if (score >= 70) {
    return {
      label: "Competitive Match",
      explanation: "You have a realistic shot if you tailor carefully.",
    };
  }
  if (score >= 60) {
    return {
      label: "Possible Fit",
      explanation: "You may need stronger positioning before applying.",
    };
  }
  return {
    label: "Low Match",
    explanation: "This role appears weakly aligned with your current baseline.",
  };
}

export function getOpportunityNextMove(score?: number | null): {
  title: string;
  body: string;
} {
  if (typeof score !== "number") {
    return {
      title: "Run analysis",
      body: "Complete an analysis first so you can turn this role into a clear decision.",
    };
  }
  if (score >= 90) {
    return {
      title: "Apply now",
      body: "Your background is already strong enough to pursue this role with confidence.",
    };
  }
  if (score >= 80) {
    return {
      title: "Tailor and apply",
      body: "Your background is strong enough to pursue this role with focused positioning.",
    };
  }
  if (score >= 70) {
    return {
      title: "Tailor before applying",
      body: "You have a viable path here, but sharper positioning will matter before you apply.",
    };
  }
  if (score >= 60) {
    return {
      title: "Strengthen baseline before applying",
      body: "The role has some overlap, but your current baseline does not yet make the strongest case.",
    };
  }
  return {
    title: "Consider skipping or repositioning",
    body: "This role appears materially outside your strongest lane right now.",
  };
}

export function getFitLevel(score?: number | null): "High" | "Moderate" | "Low" {
  if (typeof score !== "number") return "Low";
  if (score >= 80) return "High";
  if (score >= 70) return "Moderate";
  return "Low";
}

export function getRiskLevel(
  score?: number | null,
  highestGapSeverity?: number | null,
): "Low" | "Moderate" | "High" {
  if (typeof highestGapSeverity === "number") {
    if (highestGapSeverity >= 0.75) return "High";
    if (highestGapSeverity >= 0.5) return "Moderate";
    return typeof score === "number" && score >= 85 ? "Low" : "Moderate";
  }
  if (typeof score !== "number") return "High";
  if (score >= 90) return "Low";
  if (score >= 70) return "Moderate";
  return "High";
}

export function getReadinessLevel(
  score?: number | null,
  confidenceLevel?: "High" | "Moderate" | "Low",
): "High" | "Moderate" | "Low" {
  if (typeof score !== "number") return "Low";
  if (score >= 85 && confidenceLevel !== "Low") return "High";
  if (score >= 70) return "Moderate";
  return "Low";
}

function resolveConfidenceLevel(input: {
  confidenceScore?: number | null;
  scoreBreakdown?: ScoreBreakdownShape | null;
  summary?: string | null;
}): "High" | "Moderate" | "Low" {
  if (typeof input.confidenceScore === "number") {
    if (input.confidenceScore >= 80) return "High";
    if (input.confidenceScore >= 50) return "Moderate";
    return "Low";
  }

  const breakdownAverage =
    input.scoreBreakdown?.dimensions?.length
      ? input.scoreBreakdown.dimensions.reduce((sum, dimension) => {
          const percent = dimension.weight > 0 ? (dimension.score / dimension.weight) * 100 : 0;
          return sum + Math.max(0, Math.min(100, percent));
        }, 0) / input.scoreBreakdown.dimensions.length
      : 0;
  const summaryLength = (input.summary ?? "").trim().length;

  if (breakdownAverage >= 80 && summaryLength >= 80) return "High";
  if (breakdownAverage >= 50) return "Moderate";
  return "Low";
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
  watchoutSignals: string[];
  nextMove: {
    title: string;
    body: string;
  };
  compactIndicators: Array<{
    label: string;
    value: string;
  }>;
};

export function OpportunityMapSection({
  score,
  verdict,
  advantageSignals,
  watchoutSignals,
  nextMove,
  compactIndicators,
}: OpportunityMapSectionProps) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Opportunity Map</p>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Your executive summary for whether this role is worth pursuing.
          </p>
        </div>

        <article className="rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Score and verdict</p>
              <div className="mt-4 flex items-end gap-4">
                <p className="text-[68px] font-black leading-none tracking-[-0.06em] text-white">
                  {typeof score === "number" ? Math.round(score) : "--"}
                </p>
                <div className="pb-2">
                  <p className="text-2xl font-semibold text-white">{verdict.label}</p>
                  <p className="mt-1 text-sm text-slate-300">{verdict.explanation}</p>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-[24px] border border-white/10 bg-slate-950/35 p-5">
          <h3 className="text-lg font-semibold text-slate-100">Your advantage</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {advantageSignals.length ? (
              advantageSignals.map((strength) => <li key={strength}>• {strength}</li>)
            ) : (
              <li>• Verified baseline advantages are not available for this run yet.</li>
            )}
          </ul>
        </article>

        <article className="rounded-[24px] border border-white/10 bg-slate-950/35 p-5">
          <h3 className="text-lg font-semibold text-slate-100">Watchouts</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {watchoutSignals.length ? (
              watchoutSignals.map((watchout) => <li key={watchout}>• {watchout}</li>)
            ) : (
              <li>• No major mismatch areas are surfaced for this run.</li>
            )}
          </ul>
        </article>

        <article className="rounded-[24px] border border-white/10 bg-slate-950/35 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Best next move</p>
          <p className="mt-4 text-2xl font-semibold text-white">{nextMove.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{nextMove.body}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {compactIndicators.map((indicator) => (
              <div
                key={indicator.label}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {indicator.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{indicator.value}</p>
              </div>
            ))}
          </div>
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
  const lastAssessmentHydrationAttempted = useRef(false);
  const trackedCompletionKeysRef = useRef<Set<string>>(new Set());

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

  const executionMode = typeof activeScore === "number" && activeScore > 70;
  const isLowScore = typeof activeScore === "number" && activeScore < LOW_EXPERIENCE_THRESHOLD;
  const isExceptionalScore = typeof activeScore === "number" && activeScore >= 90;
  const dimensionCardBaseClass = "rounded-2xl border border-white/10 bg-slate-900/30 p-3";
  const dimensionCardClassName = dimensionCardBaseClass;
  const verdictClassification = useMemo(() => mapFitClassification(activeScore), [activeScore]);
  const confidenceLevel = useMemo(
    () =>
      resolveConfidenceLevel({
        confidenceScore: latest?.confidenceScore ?? null,
        scoreBreakdown,
        summary: latest?.summary ?? null,
      }),
    [latest?.confidenceScore, latest?.summary, scoreBreakdown],
  );
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
    return Array.from(
      new Set(
        [...strategicStrengths, ...evidenceSignals]
          .map((item) => normalizeOpportunityLine(item))
          .filter(Boolean),
      ),
    ).slice(0, 3);
  }, [scoreBreakdown, strategicStrengths]);
  const highestGapSeverity = useMemo(() => {
    if (!criticalGapDetails.length) return null;
    return criticalGapDetails.reduce<number | null>(
      (highest, gap) =>
        typeof gap.severityScore === "number" && (highest === null || gap.severityScore > highest)
          ? gap.severityScore
          : highest,
      null,
    );
  }, [criticalGapDetails]);
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
  const riskItems: RiskFactor[] =
    strategicBrief.whatMayHurtYou.length > 0
      ? strategicBrief.whatMayHurtYou
      : [
          {
            id: "risk-fallback-1",
            title: "Top role risks unavailable",
            riskType: "Evidence Gap",
            detail:
              "Run a fresh analysis to surface role-specific risks and evidence-level gaps.",
            isCriticalRequirement: false,
            impactLine: undefined,
          },
        ];
  const watchoutSignals = useMemo(() => {
    const rankedCriticalGaps = [...criticalGapDetails]
      .sort((a, b) => (b.severityScore ?? 0) - (a.severityScore ?? 0))
      .map((gap) => normalizeOpportunityLine(gap.title));
    const fallbackRisks = riskItems.map((risk) => normalizeOpportunityLine(risk.title));
    return Array.from(new Set([...rankedCriticalGaps, ...fallbackRisks].filter(Boolean))).slice(0, 3);
  }, [criticalGapDetails, riskItems]);
  const scoreTierLabel = useMemo(() => getScoreTierLabel(activeScore), [activeScore]);
  const scoreInterpretation = useMemo(() => getScoreInterpretation(activeScore), [activeScore]);
  const recommendedNextStep = useMemo(() => getRecommendedNextStep(activeScore), [activeScore]);
  const opportunityVerdict = useMemo(() => getOpportunityVerdict(activeScore), [activeScore]);
  const opportunityNextMove = useMemo(() => getOpportunityNextMove(activeScore), [activeScore]);
  const compactIndicators = useMemo(
    () => [
      { label: "Fit", value: getFitLevel(activeScore) },
      { label: "Risk", value: getRiskLevel(activeScore, highestGapSeverity) },
      { label: "Readiness", value: getReadinessLevel(activeScore, confidenceLevel) },
    ],
    [activeScore, confidenceLevel, highestGapSeverity],
  );
  const isAuthenticatedContext = Boolean(latest?.baselineId);
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
    params.set("entrySource", "results");
    return `/studio?${params.toString()}`;
  }, [latest?.jobId, latestBaselineVersionId]);

  const navigateToStudio = useCallback(() => {
    void router.push(studioHref);
  }, [router, studioHref]);

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
  const compatibilityMapSignals = useMemo(() => {
    const strengthCorpus = strategicStrengths.join(" ").toLowerCase();
    const gapCorpus = riskItems
      .map((item) => `${item.title} ${item.detail ?? ""}`)
      .join(" ")
      .toLowerCase();

    const base = typeof activeScore === "number" ? activeScore : 60;

    const areas = [
      {
        id: "customer_support_leadership",
        label: "Customer Support Leadership",
        keywords: ["support", "leadership", "team", "manager", "director"],
      },
      {
        id: "customer_operations",
        label: "Customer Operations",
        keywords: ["operations", "process", "workflow", "onboarding", "sla"],
      },
      {
        id: "incident_management",
        label: "Incident Management",
        keywords: ["incident", "outage", "triage", "response", "reliability"],
      },
      {
        id: "escalation_management",
        label: "Escalation Management",
        keywords: ["escalation", "severity", "complex", "risk", "critical"],
      },
      {
        id: "support_programs",
        label: "Support Programs",
        keywords: ["program", "enablement", "kpi", "quality", "coaching"],
      },
      {
        id: "cx_service_delivery",
        label: "CX / Service Delivery",
        keywords: ["customer experience", "cx", "service", "journey", "delivery"],
      },
    ] as const;

    return areas.map((area) => {
      const positiveMatches = area.keywords.filter((keyword) => strengthCorpus.includes(keyword)).length;
      const negativeMatches = area.keywords.filter((keyword) => gapCorpus.includes(keyword)).length;
      const estimatedScore = Math.max(
        25,
        Math.min(95, Math.round(base + positiveMatches * 7 - negativeMatches * 5)),
      );
      return {
        id: area.id,
        label: area.label,
        score: estimatedScore,
      };
    });
  }, [activeScore, riskItems, strategicStrengths]);

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
    Boolean(scoringRubric && scoreDrivers.length) &&
    !isExceptionalScore &&
    !isLowScore &&
    !executionMode;

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
                    if (cta.href.startsWith("/studio")) {
                      navigateToStudio();
                      return;
                    }
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
    } catch {
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

  return (
    <PageShell className="results-page-theme">
      <div className="space-y-8">
        <PageHeader
          title="Results"
          description="Review your Compatibility Score and take the next step."
        />

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {!latest ? (
            <EmptyState
              title="No compatibility analysis yet"
              body={
                loadingLatest
                  ? "Preparing compatibility report…"
                  : "Load the latest Compatibility Analysis to reveal your Fit Verdict and Compatibility Score."
              }
              cta={
                <FormButton
                  variant="ghost"
                  onClick={() => void loadLatest()}
                  disabled={!jobId || loading || loadingLatest}
                >
                  {loadingLatest ? "Preparing report..." : "Load Compatibility Analysis"}
                </FormButton>
              }
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          ) : (
            <div className="space-y-6">
              <OpportunityMapSection
                score={activeScore}
                verdict={opportunityVerdict}
                advantageSignals={advantageSignals}
                watchoutSignals={watchoutSignals}
                nextMove={opportunityNextMove}
                compactIndicators={compactIndicators}
              />

              <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Role positioning</p>
                    <p className="mt-2 text-xl font-semibold text-slate-100">{scoreTierLabel}</p>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
                      {scoreInterpretation}
                    </p>
                    <p className="mt-3 text-sm text-slate-400">
                      {recommendedNextStep.body}
                    </p>
                  </div>
                  <div>
                    <div className="mb-3">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Opportunity Radar</p>
                      <p className="mt-1 text-sm text-slate-300">
                        Shows where your background appears most viable across adjacent areas.
                      </p>
                    </div>
                    <OpportunityRadarChart areas={compatibilityMapSignals} />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/45 p-6">
                <h3 className="text-2xl font-semibold text-slate-100">
                  {isAuthenticatedContext ? "Continue your workflow" : "Save this analysis and keep building"}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-300">
                  {isAuthenticatedContext
                    ? "Save this analysis, revisit comparisons, and move directly into tailored materials."
                    : "Create a free account to save your compatibility results, revisit role comparisons, and continue into tailored materials."}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {isAuthenticatedContext ? (
                    executionMode ? (
                      <FormButton onClick={() => navigateToStudio()} disabled={!canOpenStudio}>
                        Continue in Studio
                      </FormButton>
                    ) : (
                      <FormButton onClick={() => void router.push(fitReviewPath)}>Open Fit Review</FormButton>
                    )
                  ) : (
                    <Link
                      href="/auth/signup"
                      className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
                    >
                      Create Free Account
                    </Link>
                  )}
                  <Link
                    href="/opportunities"
                    className="inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white"
                  >
                    Continue Exploring
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <article className="rounded-xl bg-slate-950/60 p-4">
                    <p className="text-base font-semibold text-slate-100">Save analysis history</p>
                    <p className="mt-1 text-sm text-slate-400">Keep your role comparisons in one place.</p>
                  </article>
                  <article className="rounded-xl bg-slate-950/60 p-4">
                    <p className="text-base font-semibold text-slate-100">Build tailored materials</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Turn strong fit roles into grounded resumes and cover letters.
                    </p>
                  </article>
                  <article className="rounded-xl bg-slate-950/60 p-4">
                    <p className="text-base font-semibold text-slate-100">Find better fit roles faster</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Use your results to focus where your profile is strongest.
                    </p>
                  </article>
                </div>
              </section>

              <section className="space-y-4">
                <CareerInsightEmerging />
                <CareerGravity />
                <FitImprovementOpportunities assessmentId={latest.assessmentId ?? null} />

                {scoreBreakdown ? (
                  <details className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                      Supporting score breakdown
                    </summary>
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
                              <div className="h-1.5 rounded bg-white/40" style={{ width: `${percent}%` }} />
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
                  </details>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4 text-sm text-slate-300">
                    Supporting score breakdown is unavailable for this run.
                  </div>
                )}
              </section>
            </div>
          )}
        </section>

        <CareerAlignmentProgress />
        <AnalyzeAnotherRoleBar baselineVersionId={latest?.baselineVersionId ?? null} />

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


