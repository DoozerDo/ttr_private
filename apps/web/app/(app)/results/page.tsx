"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { sanitizeScoreExplanationLine, sanitizeScoreExplanationList } from "@/lib/scoreExplanationCopy";
import { getDecisionFromFitScore } from "@/lib/fit-verdict";
import { buildStrategicBrief } from "@/lib/resultsInsights";
import { buildResultsSignalAlignment } from "@/lib/professionalSignals";
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
  rawScore?: number | null;
  adjustedScore?: number | null;
  scoreAdjustmentApplied?: boolean;
  scoreAdjustmentReasons?: string[] | null;
  scoreAdjustmentSummary?: string | null;
  scoreAdjustmentType?:
    | "none"
    | "role_track_cap"
    | "core_function_cap"
    | "seniority_cap"
    | "domain_penalty"
    | "combined"
    | null;
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
  const adjustedScore = latest.adjustedScore;
  if (typeof adjustedScore === "number") return adjustedScore;
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
  adjustment: {
    applied: boolean;
    rawScore: number | null;
    adjustedScore: number | null;
    summary: string | null;
    reasons: string[];
  } | null;
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
      }
    | null;
  scoreAnalysisHref: string;
};

export function OpportunityMapSection({
  score,
  adjustment,
  verdict,
  advantageSignals,
  primaryCta,
  scoreAnalysisHref,
}: OpportunityMapSectionProps) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-7 shadow-[0_26px_90px_rgba(2,6,23,0.38)]">
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-end gap-4">
              <p className="text-[76px] font-black leading-none tracking-[-0.07em] text-white">
                {typeof score === "number" ? Math.round(score) : "--"}
              </p>
              <div className="space-y-1 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                  Match strength
                </p>
                <p className="text-3xl font-semibold tracking-tight text-white">{verdict.label}</p>
                <p className="max-w-sm text-sm leading-6 text-slate-300">{verdict.explanation}</p>
                {adjustment?.applied ? (
                  <div className="max-w-sm rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    <p>
                      {adjustment.summary ??
                        "Raw overlap scored higher, but this role was adjusted for role alignment."}
                    </p>
                    {typeof adjustment.rawScore === "number" &&
                    typeof adjustment.adjustedScore === "number" ? (
                      <p className="mt-1 text-slate-300">
                        Raw {Math.round(adjustment.rawScore)}. Adjusted {Math.round(adjustment.adjustedScore)}.
                      </p>
                    ) : null}
                    {adjustment.reasons.length ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-slate-300">Why adjusted?</summary>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                          {adjustment.reasons.map((reason, index) => (
                            <li key={`adjustment-reason-${index}`}>{reason}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <a
              href={scoreAnalysisHref}
              className="text-sm font-medium text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
            >
              View score analysis
            </a>
            {primaryCta ? (
              primaryCta.disabled ? (
                <span className="inline-flex min-w-[260px] cursor-not-allowed items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-400">
                  {primaryCta.label}
                </span>
              ) : (
                <a
                  href={primaryCta.href}
                  className="inline-flex min-w-[260px] items-center justify-center rounded-[var(--button-radius)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--verdict-apply-text)] transition hover:bg-[var(--accent-primary-hover)]"
                >
                  {primaryCta.label}
                </a>
              )
            ) : null}
          </div>
        </header>

        {advantageSignals.length ? (
          <article className="rounded-[26px] border border-white/10 bg-slate-950/38 p-6">
            <h3 className="text-xl font-semibold uppercase tracking-[0.16em] text-slate-100">
              YOUR ADVANTAGE
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              The strongest evidence already working in your favor for this role.
            </p>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {advantageSignals.map((strength) => (
                <li
                  key={strength}
                  className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-200"
                >
                  {strength}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
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
  strongSignals: string[];
  weakerSignals: string[];
  summary: string;
};

function AdvancedInsightsCard({
  scoreBreakdown,
  showScoreDrivers,
  renderDriverGrid,
}: AdvancedInsightsCardProps) {
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
        <p className="max-w-2xl text-sm leading-6 text-slate-300">
          Deeper score analysis for when you want to inspect the contributing dimensions and the
          highest-impact levers behind this result.
        </p>
      </header>

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
    </section>
  );
}

export function SignalAlignmentSection({
  strongSignals,
  weakerSignals,
  summary,
}: SignalAlignmentSectionProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] p-6 shadow-[0_18px_50px_rgba(2,6,23,0.22)]">
      <header className="space-y-2 border-b border-white/10 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          SIGNAL ALIGNMENT
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          Why this role scored the way it did
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">{summary}</p>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-[22px] border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/80">
            Strong For This Role
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            {strongSignals.map((signal) => (
              <li key={signal} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                {signal}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[22px] border border-amber-300/15 bg-amber-400/[0.05] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100/80">
            Weaker For This Role
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            {weakerSignals.map((signal) => (
              <li key={signal} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
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
  const scoreAdjustmentInfo = useMemo(() => {
    if (!latest) return null;
    return {
      applied: Boolean(latest.scoreAdjustmentApplied),
      rawScore: typeof latest.rawScore === "number" ? latest.rawScore : null,
      adjustedScore:
        typeof latest.adjustedScore === "number"
          ? latest.adjustedScore
          : typeof latest.overallScore === "number"
          ? latest.overallScore
          : null,
      summary:
        typeof latest.scoreAdjustmentSummary === "string"
          ? latest.scoreAdjustmentSummary
          : null,
      reasons: Array.isArray(latest.scoreAdjustmentReasons)
        ? latest.scoreAdjustmentReasons.filter((value) => typeof value === "string")
        : [],
    };
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

  const isLowScore = typeof activeScore === "number" && activeScore < LOW_EXPERIENCE_THRESHOLD;
  const isExceptionalScore = typeof activeScore === "number" && activeScore >= 90;
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
  const primaryResultsCta = useMemo(() => {
    if (typeof activeScore !== "number") return null;

    if (activeScore >= 70) {
      return {
        label: "Open Resume and Cover Letter Studio",
        href: studioHref,
        disabled: !canOpenStudio,
      };
    }

    return {
      label: "Strengthen this match in Fit Review",
      href: fitReviewPath,
      disabled: false,
    };
  }, [activeScore, canOpenStudio, fitReviewPath, studioHref]);
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

        <section className="space-y-6 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6 shadow-[0_16px_50px_rgba(2,6,23,0.18)]">
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
            <div className="space-y-7">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_340px] xl:items-start">
                <div className="space-y-6">
                  <OpportunityMapSection
                    score={activeScore}
                    adjustment={scoreAdjustmentInfo}
                    verdict={opportunityVerdict}
                    advantageSignals={advantageSignals}
                    primaryCta={primaryResultsCta}
                    scoreAnalysisHref="#advanced-insights"
                  />

                  {signalAlignment.renderable ? (
                    <SignalAlignmentSection
                      strongSignals={signalAlignment.strongForRole}
                      weakerSignals={signalAlignment.weakerForRole}
                      summary={signalAlignment.summary}
                    />
                  ) : null}
                </div>

                <div className="space-y-4 xl:sticky xl:top-6">
                  <FitImprovementOpportunities
                    assessmentId={latest.assessmentId ?? null}
                    actionHref={fitReviewPath}
                    compact
                  />
                  <CareerAlignmentProgress showProgressSection={false} />
                </div>
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


