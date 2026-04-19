"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ComplianceViolationPanel } from "@/components/ComplianceViolationPanel";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { RouteStateShell } from "@/components/RouteStateShell";
import { GuidedOverlay } from "@/components/GuidedOverlay";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { CareerAlignmentProgress } from "./components/CareerAlignmentProgress";
import { CareerGravity } from "./components/CareerGravity";
import { CareerAdjacencyRadar } from "./components/CareerAdjacencyRadar";
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
import {
  buildCompetitiveBlockedResultsState,
  buildResultsDecisionCopy,
  type ResultsBlockedState,
} from "@/lib/resultsMessaging";
import { sanitizeScoreExplanationLine, sanitizeScoreExplanationList } from "@/lib/scoreExplanationCopy";
import { getDecisionFromFitScore } from "@/lib/fit-verdict";
import { buildStrategicBrief } from "@/lib/resultsInsights";
import { buildResultsSignalAlignment } from "@/lib/professionalSignals";
import { appendStrengtheningAddition } from "@/lib/baselines";
import {
  buildEvidenceSuggestion,
  buildBaselineEvidencePreview,
  buildRequirementGapInsight,
  buildActionableImprovementSuggestion,
} from "@/lib/evidenceSuggestions";
import { buildScoreDelta, hasBaselineUpdated } from "@/lib/reanalysis";
import {
  FALLBACK_RENDERED_TEXT,
  sanitizeRenderedTextList,
  sanitizeRenderedTextValue,
  type RenderedTextSource,
} from "@/lib/renderedText";
import { buildProgressSummary } from "@/lib/progressSummary";
import { fetchLatestAssessmentForBaseline } from "@/lib/assessmentSource";
import { isSystemOwnedFinalizedGeneration, shouldGenerateDocuments } from "@/lib/documentGenerationContract";
import { buildExportPayload } from "../lib/exportPayload";
import { getGenerationCompletionStorageKey } from "@/lib/nextAction";
import { buildProductDecisionState } from "@/lib/productDecisionState";
import { resolveCanonicalState } from "@/lib/canonicalDecision";
import { logDecisionFlowEvent } from "@/lib/decisionFlowDebug";
import { isDocumentGenerationUnlocked, isMomentumGenerationAllowed } from "@/lib/documentGenerationGate";
import { ResumePreview } from "@/app/(app)/studio/ResumePreview";
import {
  buildWorkflowRequestKey,
  isWorkflowRequestStale,
  logWorkflowRequestEvent,
  type WorkflowRequestScope,
} from "@/lib/workflowRequestGuard";
import { deriveEvidenceLedger, type EvidenceLedger } from "@/lib/evidenceLedger";
import { readRecentIntentState } from "@/src/lib/recentIntent";
import { buildCoverLetterParagraphs } from "@/src/lib/studio/helpers";
import { useGuidedMode } from "@/hooks/useGuidedMode";
import { trackEvent } from "@/src/lib/analytics";
import { getScoreBand, ScoreBand } from "@/src/lib/score-band";
import type { ResultsPrimaryCtaReadinessStatus } from "@/src/lib/analytics";
import { getStudioHref } from "@/src/navigation/routes";

type ResultsArtifactStatus = "missing" | "in_progress" | "completed" | "failed";
type ResultsGenerationPhase = "not_started" | "generating" | "generated" | "failed" | "partial";

type ResultsGenerationRecoveryStage =
  | "idle"
  | "primary_attempt"
  | "retry_attempt"
  | "fallback_attempt"
  | "exhausted";

type BackendStudioArtifactRecord = {
  status?: string | null;
} | null;

type BackendStudioArtifactsResponse = {
  resume?: BackendStudioArtifactRecord;
  coverLetter?: BackendStudioArtifactRecord;
};

function hasAnyArtifactStatus(statuses: { resume: ResultsArtifactStatus; coverLetter: ResultsArtifactStatus }): boolean {
  return statuses.resume !== "missing" || statuses.coverLetter !== "missing";
}

function normalizeBackendArtifactStatus(status: unknown): ResultsArtifactStatus {
  const value = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (value === "completed") return "completed";
  if (value === "in_progress") return "in_progress";
  if (value === "failed") return "failed";
  return "missing";
}

function deriveResultsArtifactStatuses(payload: unknown): {
  resume: ResultsArtifactStatus;
  coverLetter: ResultsArtifactStatus;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { resume: "missing", coverLetter: "missing" };
  }
  const record = payload as BackendStudioArtifactsResponse;
  return {
    resume: normalizeBackendArtifactStatus(record.resume?.status),
    coverLetter: normalizeBackendArtifactStatus(record.coverLetter?.status),
  };
}

function deriveResultsGenerationPhase(statuses: {
  resume: ResultsArtifactStatus;
  coverLetter: ResultsArtifactStatus;
}, opts?: {
  recoveryInProgress?: boolean;
  generationStarted?: boolean;
  artifactScope?: "both" | "resume_only";
}): ResultsGenerationPhase {
  const { resume } = statuses;
  const coverLetter = opts?.artifactScope === "resume_only" ? "completed" : statuses.coverLetter;
  if (opts?.recoveryInProgress && (resume === "failed" || coverLetter === "failed")) {
    return "generating";
  }
  if (resume === "in_progress" || coverLetter === "in_progress") return "generating";
  if (resume === "completed" || coverLetter === "completed") return "generated";
  if (resume === "failed" && coverLetter === "failed") return "failed";
  const hasOutcome = resume === "failed" || coverLetter === "failed";
  if (opts?.generationStarted && !hasOutcome) {
    // After generation is kicked off, transient missing records shouldn't be treated as a terminal state.
    return "generating";
  }
  if (hasOutcome) return "partial";
  return "not_started";
}

function mapResultsAnalyticsActionType(
  type: ReturnType<typeof resolveCanonicalState>["primaryAction"]["type"],
): "fit_review" | "verify_examples" | "open_studio_draft" | "open_studio" {
  switch (type) {
    case "open_studio":
      return "open_studio";
    case "generate_documents":
      return "open_studio_draft";
    case "generate_score":
      return "verify_examples";
    case "start_fit_review":
    case "recover_selection":
      return "fit_review";
    default:
      return "fit_review";
  }
}

function mapResultsAnalyticsReadinessStatus(
  readinessState: ReturnType<typeof resolveCanonicalState>["readinessState"],
): ResultsPrimaryCtaReadinessStatus {
  if (readinessState === "READY") return "ready";
  if (readinessState === "LIMITED" || readinessState === "DRAFT") return "limited";
  return "blocked";
}

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
  scoreConfidence?: "high" | "medium" | "low";
  scoreConfidenceReasons?: string[];
  scoreSanityFlags?: string[];
  likelyUnderestimatedFit?: boolean;
  scorePresentationMode?: "normal" | "caution" | "fix_first";
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
  scoreConfidence?: "high" | "medium" | "low";
  scoreConfidenceReasons?: string[] | null;
  scoreSanityFlags?: string[] | null;
  likelyUnderestimatedFit?: boolean | null;
  scorePresentationMode?: "normal" | "caution" | "fix_first" | null;
  scoring_v2?: ScoringV2Result | null;
  narrative?: {
    headline: string;
    summary: string;
    strengths: string[];
    gaps: string[];
  } | null;
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
      if (typeof entry === "string" && entry.trim()) {
        const cleaned = sanitizeRenderedTextValue(entry, {
          endpoint: "results",
          field: "supportingSignals[]",
        });
        if (cleaned && cleaned !== FALLBACK_RENDERED_TEXT) parts.push(cleaned);
      }
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        if (typeof record.label === "string" && record.label.trim()) {
          const cleanedLabel = sanitizeRenderedTextValue(record.label, {
            endpoint: "results",
            field: "supportingSignals[].label",
          });
          if (cleanedLabel && cleanedLabel !== FALLBACK_RENDERED_TEXT) parts.push(cleanedLabel);
        }
        if (typeof record.name === "string" && record.name.trim()) {
          const cleanedName = sanitizeRenderedTextValue(record.name, {
            endpoint: "results",
            field: "supportingSignals[].name",
          });
          if (cleanedName && cleanedName !== FALLBACK_RENDERED_TEXT) parts.push(cleanedName);
        }
      }
    });
  }
  if (typeof baselineEvidence === "string" && baselineEvidence.trim()) {
    const cleaned = sanitizeRenderedTextValue(baselineEvidence, {
      endpoint: "results",
      field: "baselineEvidence",
    });
    if (cleaned && cleaned !== FALLBACK_RENDERED_TEXT) parts.push(cleaned);
  }
  if (Array.isArray(baselineEvidence)) {
    baselineEvidence.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        const cleaned = sanitizeRenderedTextValue(entry, {
          endpoint: "results",
          field: "baselineEvidence[]",
        });
        if (cleaned && cleaned !== FALLBACK_RENDERED_TEXT) parts.push(cleaned);
      }
    });
  }
  return parts.join(" ").toLowerCase();
}

function sanitizeAnalysisTextSource(
  value: unknown,
  context: { endpoint: string; field: string; payload: unknown },
): unknown {
  if (typeof value === "string") {
    return sanitizeRenderedTextValue(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (typeof entry === "string") {
        return sanitizeRenderedTextValue(entry, {
          ...context,
          field: `${context.field}[${index}]`,
        });
      }
      if (!entry || typeof entry !== "object") {
        return entry;
      }
      const record = { ...(entry as Record<string, unknown>) };
      for (const key of ["label", "name", "message", "text", "description"] as const) {
        if (typeof record[key] === "string") {
          record[key] = sanitizeRenderedTextValue(record[key], {
            ...context,
            field: `${context.field}[${index}].${key}`,
          });
        }
      }
      return record;
    });
  }

  return value;
}

function toRenderedTextSource(value: unknown): RenderedTextSource {
  if (typeof value === "string" || value === null || value === undefined) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && value && "type" in value && "content" in value) {
    const record = value as { type?: unknown; content?: unknown };
    if (
      (record.type === "plain_text" ||
        record.type === "structured" ||
        record.type === "markdown") &&
      typeof record.content === "string"
    ) {
      return {
        type: record.type,
        content: record.content,
      };
    }
  }
  return undefined;
}

function sanitizeLatestAnalysisResponse(data: LatestAnalysis, endpoint: string): LatestAnalysis {
  const context = { endpoint, payload: data };
  const sanitizeText = (value: unknown, field: string) =>
    sanitizeRenderedTextValue(toRenderedTextSource(value), { ...context, field });
  const sanitizeList = (value: unknown, field: string) =>
    Array.isArray(value)
      ? sanitizeRenderedTextList(
          value.filter((entry): entry is string => typeof entry === "string"),
          { ...context, field },
        )
      : [];

  return {
    ...data,
    jobTitle: sanitizeText(data.jobTitle, "jobTitle"),
    title: sanitizeText(data.title, "title"),
    companyName: sanitizeText(data.companyName, "companyName"),
    company: sanitizeText(data.company, "company"),
    verdict: sanitizeText(data.verdict, "verdict"),
    note: sanitizeText(data.note, "note"),
    summary: sanitizeText(data.summary, "summary"),
    strengths: sanitizeList(data.strengths, "strengths"),
    gaps: sanitizeList(data.gaps, "gaps"),
    recommendedActions: sanitizeList(data.recommendedActions, "recommendedActions"),
    evaluationNotes: sanitizeList(data.evaluationNotes, "evaluationNotes"),
    systemConstraints: sanitizeList(data.systemConstraints, "systemConstraints"),
    scoreConfidenceReasons: sanitizeList(data.scoreConfidenceReasons, "scoreConfidenceReasons"),
    scoreSanityFlags: sanitizeList(data.scoreSanityFlags, "scoreSanityFlags"),
    criticalGaps: Array.isArray(data.criticalGaps)
      ? data.criticalGaps.map((gap, index) => ({
          ...gap,
          title: sanitizeText(gap.title, `criticalGaps[${index}].title`),
          description: sanitizeText(gap.description, `criticalGaps[${index}].description`),
          requirementEvidence: sanitizeText(
            gap.requirementEvidence,
            `criticalGaps[${index}].requirementEvidence`,
          ),
          baselineEvidence: sanitizeText(
            gap.baselineEvidence,
            `criticalGaps[${index}].baselineEvidence`,
          ),
          reasoning: sanitizeText(gap.reasoning, `criticalGaps[${index}].reasoning`),
        }))
      : data.criticalGaps,
    narrative: data.narrative
      ? {
          headline: sanitizeText(data.narrative.headline, "narrative.headline"),
          summary: sanitizeText(data.narrative.summary, "narrative.summary"),
          strengths: sanitizeList(data.narrative.strengths, "narrative.strengths"),
          gaps: sanitizeList(data.narrative.gaps, "narrative.gaps"),
        }
      : data.narrative,
    supportingSignals: sanitizeAnalysisTextSource(data.supportingSignals, {
      ...context,
      field: "supportingSignals",
    }),
    baselineEvidence: sanitizeAnalysisTextSource(data.baselineEvidence, {
      ...context,
      field: "baselineEvidence",
    }),
  };
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
  const scoringV2Score = latest.scoring_v2?.score;
  if (typeof scoringV2Score === "number") return scoringV2Score;
  const breakdownTotal = latest.score_breakdown?.total_score;
  if (typeof breakdownTotal === "number") return breakdownTotal;
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
  const cleaned = sanitizeRenderedTextValue(line, {
    endpoint: "results",
    field: "evidenceLine",
  });
  if (cleaned.length <= maxLength) return cleaned;
  return sanitizeRenderedTextValue(`${cleaned.slice(0, maxLength - 1).trimEnd()}...`, {
    endpoint: "results",
    field: "evidenceLineTruncated",
  });
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

function safeReadStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage as
    | {
        getItem?: (itemKey: string) => string | null;
      }
    | null;
  if (!storage || typeof storage.getItem !== "function") return null;
  return storage.getItem(key);
}

function safeWriteStorageItem(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  const storage = window.localStorage as
    | {
        setItem?: (itemKey: string, itemValue: string) => void;
        removeItem?: (itemKey: string) => void;
      }
    | null;
  if (!storage) return;
  if (value) {
    if (typeof storage.setItem === "function") {
      storage.setItem(key, value);
    }
    return;
  }
  if (typeof storage.removeItem === "function") {
    storage.removeItem(key);
  }
}

function readLastAssessmentFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  return safeReadStorageItem(LAST_ASSESSMENT_STORAGE_KEY);
}

function writeLastAssessmentToStorage(value: string | null) {
  if (typeof window === "undefined") return;
  safeWriteStorageItem(LAST_ASSESSMENT_STORAGE_KEY, value);
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
  badgeLabel: "BLOCKED",
  summary: "Fit score and generation readiness are resolved before Studio is entered.",
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
      label: "Not analyzed",
      explanation: "Run Career Compatibility Analysis to see the verdict.",
    };
  }
  const band = getScoreBand(score);
  if (band === ScoreBand.TOP) {
    return {
      label: "Strong match",
      explanation: "This role is likely worth pursuing.",
    };
  }
  if (band === ScoreBand.MID) {
    return {
      label: "Competitive match",
      explanation:
        typeof score === "number" && score >= 80
          ? "You can win this role with focused tailoring."
          : "You can win this with focused tailoring.",
    };
  }
  return {
    label: "Below threshold",
    explanation: "The score shows clear gaps that need work.",
  };
}

export function buildStudioHrefFromResultsContext(input: {
  jobId?: string | null;
  baselineId?: string | null;
  baselineVersionId?: string | null;
  analysisId?: string | null;
  fromUnlock?: boolean;
}): string {
  return getStudioHref({
    jobId: input.jobId,
    baselineId: input.baselineId,
    baselineVersionId: input.baselineVersionId,
    analysisId: input.analysisId,
    fromUnlock: input.fromUnlock,
  });
}

function normalizeHrefForComparison(href: string): string {
  try {
    const url = new URL(href, "https://example.local");
    return `${url.pathname}${url.search}`;
  } catch {
    return href.trim();
  }
}

function resolveStudioNavigationHref(input: {
  studioHrefFromLatest: string;
  fallbackStudioHref: string;
  currentResultsHref?: string | null;
}): string {
  const candidate = input.studioHrefFromLatest?.trim() || input.fallbackStudioHref.trim() || "/studio";
  const normalizedCandidate = normalizeHrefForComparison(candidate);
  const normalizedFallback = normalizeHrefForComparison(input.fallbackStudioHref.trim() || "/studio");

  if (normalizedCandidate.startsWith("/results")) return normalizedFallback;

  const current = input.currentResultsHref?.trim() ?? null;
  if (current && normalizeHrefForComparison(current) === normalizedCandidate) {
    return normalizedFallback;
  }

  return candidate;
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
  assessmentId: string | null;
  score: number | null;
  scoreBreakdown: ScoreBreakdownShape | null;
  verdict: {
    label: string;
    explanation: string;
  };
  nextAction: ReturnType<typeof resolveCanonicalState>["nextAction"];
  advantageSignals: string[];
  primaryCta:
    | {
        label: string;
        href?: string;
        onClick?: () => void;
        disabled?: boolean;
        description: string;
      }
    | null;
  secondaryAction?: {
    label: string;
    href: string;
  } | null;
  evidenceLedger?: EvidenceLedger;
  scoreAnalysisHref: string;
  readiness: GenerationReadiness;
  verificationCoverage: VerificationCoverage;
  canonicalCoverage: LatestAnalysis["verification_coverage"];
  blockedState?: ResultsBlockedState | null;
  predictiveUnlock:
    | {
        unverifiedRequirements: string[];
        predictedOutcome: "full" | "partial";
        removeAndContinueHref: string;
      reviewInStudioHref: string;
      }
    | null;
  weakFitRecovery?:
    | {
        href: string;
        gapPreview: Array<{
          requirement: string;
          explanation: string;
        }>;
      }
    | null;
  reliabilityFacts: {
    baselineCompleteness: string;
    matchedSignals: number;
    scoreImproved: boolean | null;
    gapsResolvable: boolean;
  };
  generationPhase?: ResultsGenerationPhase;
  generationRecoveryUi?: "finalizing" | "exhausted" | null;
};

const GAP_EXPLANATION_FALLBACK = "Add concrete baseline evidence that proves this requirement.";

function ResolveGapsBlock({
  gapPreview,
}: {
  gapPreview: Array<{ requirement: string; explanation: string }>;
}) {
  return (
    <section className="rounded-2xl border border-amber-300/35 bg-amber-500/10 p-4" data-testid="resolve-gaps-block">
      <h3 className="text-lg font-semibold text-slate-100">You&apos;re not ready to apply yet.</h3>
      <p className="mt-2 text-sm text-slate-200">Strengthen your baseline before generating application materials.</p>
      {gapPreview.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-slate-100">
          {gapPreview.map((item) => (
            <li key={`resolve-gap-${item.requirement}`} className="rounded-lg border border-white/10 bg-slate-950/30 p-2">
              <p className="font-medium">{item.requirement}</p>
              <p className="mt-1 text-xs text-slate-300">{item.explanation || GAP_EXPLANATION_FALLBACK}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-sm font-medium text-slate-100">You&apos;ll address these gaps in Fit Review.</p>
    </section>
  );
}

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
  console.log("SCORING RESPONSE:", response);
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
  assessmentId,
  score,
  scoreBreakdown,
  verdict,
  nextAction,
  primaryCta,
  evidenceLedger,
  scoreAnalysisHref,
  readiness,
  verificationCoverage,
  secondaryAction,
  canonicalCoverage,
  blockedState,
  predictiveUnlock,
  weakFitRecovery,
  generationPhase = "not_started",
  generationRecoveryUi = null,
}: OpportunityMapSectionProps) {
  const resolvedEvidenceLedger: EvidenceLedger = evidenceLedger ?? {
    entries: [],
    remainingWeakAreas: [],
    generationAllowedReason: null,
  };
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
  const blockedByEvidence = readiness.status === "blocked";
  const lowFitScore = typeof score === "number" && !isDocumentGenerationUnlocked(score);
  const strongFitScore = typeof score === "number" && score >= 80;
  const isCompetitiveBlocked = Boolean(blockedState && blockedByEvidence && !lowFitScore && !strongFitScore);
  const readinessToneClass =
    readiness.status === "blocked"
      ? "border-rose-300/30 bg-rose-500/8 text-rose-100"
      : readiness.status === "limited"
        ? "border-slate-500/50 bg-slate-800/80 text-slate-100"
        : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
  const readinessBadgeLabel = readiness.badgeLabel;
  const fitDescriptor =
    typeof score === "number" && score >= 80
      ? "Strong fit"
      : typeof score === "number" && isDocumentGenerationUnlocked(score)
        ? "Competitive fit"
        : "This role needs more work";
  const readinessMessage =
    strongFitScore
      ? blockedState
        ? blockedState.supportSummary ?? "Complete Fit Review to clarify the evidence gaps below."
        : score !== null && score >= 90
          ? "Your profile is grounded enough to generate in Studio."
          : "Your materials are ready to generate now. Review them in Studio before applying."
      : readiness.status === "blocked"
        ? lowFitScore
          ? "This role needs stronger fit before Studio can open."
          : blockedState?.supportSummary ?? "Complete Fit Review to clarify the evidence gaps below."
        : readiness.status === "limited"
          ? lowFitScore
            ? "Studio can open in draft mode, but the fit still needs improvement."
            : "You can generate now. Tighten a few examples to strengthen the output."
          : "Your profile is grounded enough to generate in Studio.";
  const decisionNarrative = useMemo(() => {
    if (generationRecoveryUi === "finalizing") {
      return {
        headline: "Finalizing your documents...",
        body: "Keep this tab open. We’ll update as soon as the drafts are ready.",
      };
    }
    if (generationRecoveryUi === "exhausted") {
      return {
        headline: "We hit an issue generating your documents",
        body: "Please try again.",
      };
    }
    if (generationPhase !== "not_started") {
      if (generationPhase === "generating") {
        return {
          headline: "Generating your documents...",
          body: "We’re drafting your resume and cover letter now.",
        };
      }
      if (generationPhase === "generated") {
        return {
          headline: "Your documents are ready",
        body: "Your drafts are ready below. Refinement comes next.",
        };
      }
      return {
        headline: "Generation needs attention",
        body: "At least one draft did not complete. Open Studio to retry and review what’s available.",
      };
    }
    if (lowFitScore) {
      return {
        headline: "This role may not be a fit.",
        body: "The score is below the fit threshold, so the role looks weaker overall.",
      };
    }
    if (strongFitScore) {
      if (blockedState) {
        return {
          headline: blockedState?.headline ?? "Promising fit. Not ready to generate yet.",
          body:
            blockedState?.body ??
            "Your score is strong enough to continue, but we need clearer evidence before Studio can create accurate, defensible output.",
        };
      }
      return {
        headline:
          score !== null && score >= 90
            ? "Strong match. Ready to apply."
            : "Strong match. Ready for document generation.",
        body:
          score !== null && score >= 90
            ? "Your materials are ready to generate now. Review them in Studio before applying."
            : "Your materials are ready to generate now. Review them in Studio before applying.",
      };
    }
    if (readiness.status === "blocked") {
      return {
        headline: blockedState?.headline ?? "Promising fit. Not ready to generate yet.",
        body:
          blockedState?.body ??
          "Your score is strong enough to continue, but we need clearer evidence before Studio can create accurate, defensible output.",
      };
    }
    if (readiness.status === "limited") {
      return {
        headline: `${fitDescriptor}. Studio is available.`,
        body:
          score !== null && score >= 80
            ? "You can generate now. Add a few stronger examples to improve the result."
            : "Studio can open in draft mode now, and stronger grounding will improve the output.",
      };
    }
    if (readiness.status === "ready") {
      return {
        headline: `${fitDescriptor}. Studio is ready.`,
        body: "Your profile is grounded enough to generate in Studio.",
      };
    }
    return {
      headline: "This role is ready for review.",
      body: "Use the next step that matches the evidence state so Studio stays aligned with the profile.",
    };
  }, [
    blockedState?.body,
    blockedState?.headline,
    fitDescriptor,
    generationPhase,
    generationRecoveryUi,
    lowFitScore,
    readiness.status,
    score,
    strongFitScore,
  ]);
  const competitiveBlockedSummary =
    isCompetitiveBlocked
      ? blockedState?.supportSummary ?? "Complete Fit Review to clarify the evidence gaps below."
      : decisionNarrative.body;
  const competitiveBlockedScoreCardSummary = isCompetitiveBlocked
    ? "Generation is still blocked until the evidence below is clearer."
    : decisionNarrative.body;
  const baselineEvidencePreview = useMemo(
    () =>
      buildBaselineEvidencePreview({
        baselineEvidence: resolvedEvidenceLedger.entries.map((entry) => entry.text).join(" "),
        supportingSignals: resolvedEvidenceLedger.entries.map((entry) => entry.text),
        summary: verdict.explanation,
      }),
    [resolvedEvidenceLedger.entries, verdict.explanation],
  );
  return (
    <section className="rounded-3xl bg-slate-900/65 px-5 py-7 sm:px-6 sm:py-8">
      <div className="max-w-4xl space-y-6">
        {blockedByEvidence && !lowFitScore && !strongFitScore ? (
          <RouteStateShell
            testId="results-blocked-evidence-panel"
            tone="warning"
            eyebrow="Evidence readiness"
            title={decisionNarrative.headline}
            body={
              <div className="space-y-4">
                <p className="max-w-2xl text-base leading-7 text-amber-50 md:text-lg">{decisionNarrative.body}</p>
                {isCompetitiveBlocked && blockedState?.drivers.length ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {blockedState.drivers.map((driver) => (
                      <article
                        key={driver.id}
                        className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/35 p-4"
                      >
                        <p className="text-sm font-semibold text-slate-100">{driver.title}</p>
                        <p className="text-sm leading-6 text-slate-200">{driver.detail}</p>
                        <p className="text-sm font-semibold text-amber-100">{driver.actionLabel}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
                {isCompetitiveBlocked ? (
                  <p className="text-sm text-amber-50/80">
                    {blockedState?.trustLine ?? "Studio stays locked until the story is grounded enough to defend the output."}
                  </p>
                ) : null}
              </div>
            }
            cta={
              primaryCta ? (
                primaryCta.disabled ? (
                  <span
                    data-testid="results-hero-primary-cta"
                    className="inline-flex min-h-[52px] min-w-[300px] cursor-not-allowed items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-6 py-3 text-base font-semibold text-slate-400 md:min-w-[320px]"
                  >
                    {primaryCta.label}
                  </span>
                ) : primaryCta.href ? (
                  <a
                    data-testid="results-hero-primary-cta"
                    href={primaryCta.href}
                    onClick={primaryCta.onClick}
                    className="inline-flex min-h-[52px] min-w-[300px] items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 md:min-w-[320px]"
                  >
                    {primaryCta.label}
                  </a>
                ) : primaryCta.onClick ? (
                  <button
                    data-testid="results-hero-primary-cta"
                    onClick={primaryCta.onClick}
                    className="inline-flex min-h-[52px] min-w-[300px] items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 md:min-w-[320px]"
                  >
                    {primaryCta.label}
                  </button>
                ) : (
                  <a
                    data-testid="results-hero-primary-cta"
                    href={primaryCta.href ?? "#"}
                    className="inline-flex min-h-[52px] min-w-[300px] items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 md:min-w-[320px]"
                  >
                    {primaryCta.label}
                  </a>
                )
              ) : null
            }
          >
            <div className="flex flex-wrap gap-4 text-sm">
              <a
                data-testid="results-hero-secondary-action"
                href={blockedState?.secondaryActionHref ?? secondaryAction?.href ?? scoreAnalysisHref}
                className="font-medium text-slate-100 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white/60"
              >
                {blockedState?.secondaryActionLabel ?? secondaryAction?.label ?? "View top drivers"}
              </a>
              {nextAction.type === "studio_with_save" ? (
                <a
                  href="#opportunity-save"
                  className="font-medium text-slate-100 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white/60"
                >
                  Save to Opportunities
                </a>
              ) : null}
            </div>
          </RouteStateShell>
        ) : null}
        <div
          data-testid="results-score-verdict-card"
          className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Fit Verdict Reveal
          </p>
          <p className="text-[56px] font-black leading-[0.95] tracking-[-0.04em] text-white md:text-[64px]">
            {typeof score === "number" ? Math.round(score) : "--"}
          </p>
          <h3 className="text-2xl font-semibold tracking-tight text-white">
            {decisionNarrative.headline}
          </h3>
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            {competitiveBlockedScoreCardSummary}
          </p>
          <p className="max-w-2xl text-xs leading-5 text-slate-400">
            Fit verdict: {verdict.label}. {verdict.explanation}
          </p>
        </div>
        <CareerAdjacencyRadar
          analysisId={assessmentId}
          score={score}
          scoreBreakdown={scoreBreakdown}
        />
        {!lowFitScore ? (
          <>
            {!strongFitScore ? (
              <>
                <div className="space-y-3">
                  <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white md:text-4xl xl:text-5xl">
                    {decisionNarrative.headline}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-100 md:text-base">{competitiveBlockedSummary}</p>
                </div>
                <CareerGravity />
                <section className="space-y-3 rounded-[24px] border border-white/10 bg-slate-900/30 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {isCompetitiveBlocked ? "Next step" : "Strategic Next Move"}
                  </p>
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold tracking-tight text-slate-100">
                      {isCompetitiveBlocked
                        ? "Complete Fit Review to clear the evidence gaps."
                        : decisionNarrative.headline}
                    </h3>
                    <p className="max-w-2xl text-sm leading-6 text-slate-100 md:text-base">
                      {isCompetitiveBlocked
                        ? blockedState?.supportSummary ?? "Complete Fit Review to clarify the evidence gaps below."
                        : decisionNarrative.body}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <a
                        data-testid="results-hero-secondary-action"
                        href={secondaryAction?.href ?? scoreAnalysisHref}
                        className="font-medium text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
                      >
                        {secondaryAction?.label ?? "View top drivers"}
                      </a>
                      {nextAction.type === "studio_with_save" ? (
                        <a
                          href="#opportunity-save"
                          className="font-medium text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
                        >
                          Save to Opportunities
                        </a>
                      ) : null}
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
        {lowFitScore && weakFitRecovery ? (
        <ResolveGapsBlock gapPreview={weakFitRecovery.gapPreview} />
      ) : null}
        {generationPhase === "not_started" ? (
          <div
            id="generation-readiness-details"
            className={`rounded-xl border px-4 py-2.5 text-sm ${
              strongFitScore
                ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-50"
                : readinessToneClass
            }`}
          >
            <p
              className={`text-xs font-medium tracking-[0.08em] ${strongFitScore ? "text-emerald-100" : "text-slate-300"}`}
            >
              {strongFitScore
                ? `Confidence: ${readiness.status === "ready" ? "High" : "Medium"}`
                : `Generation readiness: ${readinessBadgeLabel}`}
            </p>
            <p className={`mt-1 ${strongFitScore ? "text-emerald-50" : "text-slate-100"}`}>
              {readinessMessage}
            </p>
            {isCompetitiveBlocked && blockedState?.drivers.length ? (
              <div
                id="results-readiness-drivers"
                className="mt-3 space-y-3 rounded-xl border border-white/10 bg-slate-950/35 p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
                  Top readiness drivers
                </p>
                <ul className="space-y-2">
                  {blockedState.drivers.map((driver) => (
                        <li key={driver.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <p className="text-sm font-semibold text-slate-100">{driver.title}</p>
                          <p className="mt-1 text-sm text-slate-300">{driver.detail}</p>
                          <p className="mt-2 text-sm font-semibold text-amber-100">{driver.actionLabel}</p>
                        </li>
                      ))}
                    </ul>
              <a
                href={blockedState.secondaryActionHref}
                className="inline-flex text-sm font-semibold text-slate-100 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
              >
                {blockedState.secondaryActionLabel}
              </a>
            </div>
          ) : !strongFitScore ? (
            <p className="mt-1 text-xs text-slate-400">
              Grounding coverage: {verificationCoverage.status.toUpperCase()} - {verificationCoverage.verifiedClaims} /{" "}
              {verificationCoverage.totalClaims > 0 ? verificationCoverage.totalClaims : "?"} grounded details
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-100/80">
              You can tighten a few details after generation in Studio.
            </p>
          )}
          {!strongFitScore && !isCompetitiveBlocked && unverifiedSignals.length > 0 ? (
            <p className="mt-1 text-xs text-slate-300">Needs stronger grounding: {unverifiedSignals.join(", ")}</p>
          ) : null}
          {!strongFitScore && !isCompetitiveBlocked && predictiveUnlock ? (
            <p className="mt-2 text-xs text-slate-300">
              Removing unsupported requirements from targeting can{" "}
              {predictiveUnlock.predictedOutcome === "full"
                ? "fully unlock generation."
                : "improve generation quality while you add stronger evidence."}
            </p>
          ) : null}
        </div>
        ) : null}
        {!strongFitScore ? (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Evidence used for this role</h3>
          {resolvedEvidenceLedger.entries.length ? (
            <ul className="mt-3 space-y-2">
              {resolvedEvidenceLedger.entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-white/10 bg-slate-950/35 p-2">
                  <p className="text-sm text-slate-100">{entry.text}</p>
                  {entry.sourceLabel ? (
                    <p className="mt-1 text-xs text-slate-400">{entry.sourceLabel}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : baselineEvidencePreview ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-slate-300">{baselineEvidencePreview.intro}</p>
              <ul className="space-y-1 text-sm text-slate-100">
                {baselineEvidencePreview.signals.map((signal) => (
                  <li key={signal}>- {signal}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-300">
              We’re still assembling the strongest baseline signals for this run.
            </p>
          )}
          </section>
        ) : null}
      </div>
    </section>
  );
}

type AdvancedInsightsCardProps = {
  scoreBreakdown: ScoreBreakdownShape | null;
  showScoreDrivers: boolean;
  renderDriverGrid: (config: {
    showExtraLine: boolean;
    limit?: number;
    offset?: number;
    forceShowExtraLine?: boolean;
  }) => ReactNode;
};

function buildDiagnosticsSummary(scoreBreakdown: ScoreBreakdownShape | null): string {
  if (!scoreBreakdown?.dimensions?.length) {
    return "No detailed scoring breakdown is available yet.";
  }

  const strongCount = scoreBreakdown.dimensions.filter((dimension) => {
    const percent = dimension.weight > 0 ? (dimension.score / dimension.weight) * 100 : 0;
    return percent >= 80;
  }).length;
  const reviewCount = scoreBreakdown.dimensions.length - strongCount;

  if (reviewCount === 0) {
    return `${strongCount} strong scoring signals and no review areas.`;
  }

  return `${strongCount} strong scoring signals and ${reviewCount} review areas.`;
}

type SignalAlignmentSectionProps = {
  title: string;
  strengths: string[];
  gaps: string[];
  summary: string;
  gapHeading: string;
  gapEmptyMessage: string;
};

export function AdvancedInsightsCard({
  scoreBreakdown,
  showScoreDrivers,
  renderDriverGrid,
}: AdvancedInsightsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAdditionalSignals, setShowAdditionalSignals] = useState(false);
  if (!showScoreDrivers && !scoreBreakdown) {
    return null;
  }

  const summary = buildDiagnosticsSummary(scoreBreakdown);
  const topSignalCount = 2;

  return (
    <section
      id="advanced-insights"
      className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.96))] p-4 shadow-[0_12px_30px_rgba(2,6,23,0.16)]"
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Advanced Insights
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-100">
          Deeper score analysis
        </h2>
        <p className="text-sm leading-6 text-slate-300">{summary}</p>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="text-sm font-semibold tracking-[0.16em] text-slate-200 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/50"
        >
          {expanded ? "HIDE DETAILS" : "VIEW DETAILS"}
        </button>
      </header>

      {expanded ? (
        <>
          {showScoreDrivers ? (
            <div className="mt-4 space-y-4">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Top signals
                  </h3>
                  <p className="text-xs text-slate-500">Most influential first</p>
                </div>
                {renderDriverGrid({ showExtraLine: true, limit: topSignalCount, offset: 0 })}
              </section>

              {showScoreDrivers && scoreBreakdown?.dimensions?.length ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Additional details
                    </h3>
                    <p className="text-xs text-slate-500">Lower emphasis</p>
                  </div>
                  {scoreBreakdown.dimensions.length > topSignalCount ? (
                    <>
                      {renderDriverGrid({
                        showExtraLine: true,
                        limit: showAdditionalSignals ? scoreBreakdown.dimensions.length : topSignalCount + 3,
                        offset: topSignalCount,
                        forceShowExtraLine: showAdditionalSignals,
                      })}
                      {scoreBreakdown.dimensions.length > topSignalCount + 3 ? (
                        <button
                          type="button"
                          onClick={() => setShowAdditionalSignals((current) => !current)}
                          className="text-xs font-semibold tracking-[0.16em] text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                        >
                          {showAdditionalSignals
                            ? "HIDE DETAILS"
                            : `+${scoreBreakdown.dimensions.length - topSignalCount} MORE`}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : null}

          {scoreBreakdown ? (
            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
              <h3 className="text-sm font-semibold text-slate-100">Score Breakdown</h3>
              <div className="mt-3 space-y-2.5">
                {scoreBreakdown.dimensions.map((dimension) => {
                  const percent =
                    dimension.weight > 0
                      ? Math.max(0, Math.min(100, (dimension.score / dimension.weight) * 100))
                      : 0;
                  return (
                    <div key={`score-breakdown-${dimension.key}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-xs md:text-sm">
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
                <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs md:text-sm">
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
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Collapsed by default to keep the decision flow focused.
        </p>
      )}
    </section>
  );
}

export function SignalAlignmentSection({
  title,
  strengths,
  gaps,
  summary,
  gapHeading,
  gapEmptyMessage,
}: SignalAlignmentSectionProps) {
  if (!strengths.length && !gaps.length) return null;
  return (
    <section className="rounded-3xl bg-slate-900/55 p-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">{title}</h2>
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
            {gapHeading}
          </p>
          <ul className="space-y-2 text-sm text-slate-100">
            {(gaps.length ? gaps : [gapEmptyMessage]).map((signal) => (
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
  role_scope_and_seniority: { label: "START FIT REVIEW", target: "fitReview" },
  support_operations_and_process_rigor: { label: "OPEN STUDIO", target: "studio" },
  tooling_and_platform_experience: { label: "START FIT REVIEW", target: "fitReview" },
  domain_and_business_context: { label: "START FIT REVIEW", target: "fitReview" },
  change_leadership_and_customer_advocacy: {
    label: "ADD EVIDENCE",
    target: "interviewToolkit",
  },
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
    return { label: "Open Resume + Cover Letter Studio", href: paths.studioHref };
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
  } catch (error) {
    console.error("Failed to build Results JSON preview", error);
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
    .map((s) =>
      sanitizeRenderedTextValue(s, {
        endpoint: "results",
        field: "stringsOnly[]",
      }),
    )
    .filter((s) => s.length > 0);
}

function extractSectionText(section: ResumeSectionLike): string {
  const candidates: unknown[] = [section.content, section.text];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length) {
      return sanitizeRenderedTextValue(c, {
        endpoint: "results",
        field: "sectionText",
      });
    }
  }

  const lines = stringsOnly(section.lines);
  if (lines.length) return lines.join("\n");

  const bullets = stringsOnly(section.bullets);
  if (bullets.length) return bullets.map((b) => `- ${b}`).join("\n");

  return "";
}

function extractBestResumeText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  try {
    const direct = typeof coercePreviewText === "function" ? coercePreviewText(payload) : null;
    if (typeof direct === "string" && direct.trim().length) return direct.trim();
  } catch (error) {
    console.error("Failed to extract best resume text", error);
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
  const [recentIntent, setRecentIntent] = useState(() => readRecentIntentState());
  const lastAssessmentHydrationAttempted = useRef(false);
  const autoLoadPairRef = useRef<string | null>(null);
  const resultsDecisionLogKeyRef = useRef<string | null>(null);
  const lastReadinessKeyRef = useRef<string | null>(null);
  const failedReadinessKeysRef = useRef<Set<string>>(new Set());
  const activeAssessmentLoadRef = useRef<{ requestId: string; requestKey: string } | null>(null);
  const activeLatestLoadRef = useRef<{ requestId: string; requestKey: string } | null>(null);
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

  const createRequestId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [applicationInsights, setApplicationInsights] = useState<ApplicationInsight[]>([]);
  const [opportunitySaved, setOpportunitySaved] = useState(false);
  const [generationCompleted, setGenerationCompleted] = useState(false);
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
    } catch (error) {
      console.error("Failed to persist last assessment", error);
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
      } catch (error) {
        console.error("Failed to load application insights", error);
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
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? currentBaselineVersionId?.trim() ?? "";
    return { jobId: jobIdValue, baselineVersionId: baselineVersionIdValue };
  };

  const activeScore = useMemo(() => {
    return resolveDisplayedFitScore(latest);
  }, [latest]);
  const isQualified = isDocumentGenerationUnlocked(activeScore);
  const studioLocked = searchParams?.get("locked") === "1";

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
  const scoreConfidenceReasons = latest?.scoreConfidenceReasons ?? scoringV2?.scoreConfidenceReasons ?? [];
  const scoringRubric = scoringV2?.rubric ?? null;
  const debugFields = scoringV2?.debug ?? null;
  const analysisKeys = latest ? Object.keys(latest) : [];
  const hasAnalysis = Boolean(latest);
  const data = latest as unknown;
  if (hasAnalysis && (!data || typeof data !== "object")) {
    throw new Error("Invalid Results data shape");
  }
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
  const progressSummary = useMemo(
    () => buildProgressSummary(previousAnalysis, latest),
    [latest, previousAnalysis],
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
      } catch (error) {
        console.error("Failed to resolve baseline version", error);
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
      } catch (error) {
        console.error("Failed to resolve previous analysis", error);
        if (!cancelled) setPreviousAnalysis(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latest?.assessmentId, latest?.jobId]);
  useEffect(() => {
    setRecentIntent(readRecentIntentState());
  }, [latest?.assessmentId, latest?.jobId, latest?.baselineId]);
  useEffect(() => {
    const analysisId = latest?.assessmentId?.trim() ?? "";
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const baselineIdValue = latest?.baselineId?.trim() ?? "";
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? currentBaselineVersionId?.trim() ?? "";

    if (!analysisId || !jobIdValue || !baselineIdValue || !baselineVersionIdValue) {
      setGenerationReadiness(READINESS_LOADING_STATE);
      return;
    }

    const readinessKey = [analysisId, jobIdValue, baselineIdValue, baselineVersionIdValue].join(":");
    if (lastReadinessKeyRef.current === readinessKey) {
      return;
    }
    lastReadinessKeyRef.current = readinessKey;
    if (failedReadinessKeysRef.current.has(readinessKey)) {
      return;
    }

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
          failedReadinessKeysRef.current.add(readinessKey);
          return;
        }
        const resolved = combineGenerationReadinessFromServer(
          resumePayload as any,
          coverPayload as any,
        );
        setGenerationReadiness(resolved);
      } catch (error) {
        console.error("Failed to resolve generation readiness", error);
        failedReadinessKeysRef.current.add(readinessKey);
      }
    })();
  }, [latest?.assessmentId, latest?.baselineId, latest?.baselineVersionId, latest?.jobId]);

  const isLowScore = scoreBand === ScoreBand.LOW;
  const isExceptionalScore = scoreBand === ScoreBand.TOP;
  const strategicStrengths = useMemo(() => {
    const fromNarrative = Array.isArray(latest?.narrative?.strengths) ? latest.narrative.strengths : [];
    const fromLatest = Array.isArray(latest?.strengths) ? latest.strengths : [];
    return sanitizeRenderedTextList(
      Array.from(new Set([...fromNarrative, ...fromLatest])).filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ),
      {
        endpoint: "results",
        field: "strengths",
      },
    ).slice(0, 4);
  }, [latest?.narrative?.strengths, latest?.strengths]);
  const criticalGapDetails = useMemo(() => {
    if (!Array.isArray(latest?.criticalGaps)) return [];
    return latest.criticalGaps
      .filter((gap) => gap && typeof gap.title === "string")
      .map((gap) => ({
        title: sanitizeRenderedTextValue(gap.title, {
          endpoint: "results",
          field: "criticalGaps.title",
        }),
        requirementEvidence: sanitizeRenderedTextValue(gap.requirementEvidence, {
          endpoint: "results",
          field: "criticalGaps.requirementEvidence",
        }),
        baselineEvidence: sanitizeRenderedTextValue(gap.baselineEvidence, {
          endpoint: "results",
          field: "criticalGaps.baselineEvidence",
        }),
        severityScore: gap.severityScore,
      }));
  }, [latest?.criticalGaps]);
  const recommendedActions = useMemo(() => {
    return Array.isArray(latest?.recommendedActions)
      ? sanitizeRenderedTextList(
          latest.recommendedActions.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
          {
            endpoint: "results",
            field: "recommendedActions",
          },
        )
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
        verdict: sanitizeRenderedTextValue(activeVerdictDecision.verdict, {
          endpoint: "results",
          field: "verdict",
        }),
        verdictExplanation: sanitizeRenderedTextValue(activeVerdictDecision.verdictExplanation, {
          endpoint: "results",
          field: "verdictExplanation",
        }),
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
  const interviewToolkitHref = INTERVIEW_TOOLKIT_PATH;
  useEffect(() => {
    const key = getGenerationCompletionStorageKey(latest?.jobId ?? null, latest?.baselineId ?? null);
    if (!key || typeof window === "undefined") {
      setGenerationCompleted(false);
      return;
    }
    setGenerationCompleted(safeReadStorageItem(key) === "true");
  }, [latest?.baselineId, latest?.jobId]);

  const latestBaselineId = latest?.baselineId?.trim() ?? "";
  const latestBaselineVersionId = latest?.baselineVersionId?.trim() ?? "";
  const justUnlocked = searchParams?.get("justUnlocked") === "true";
  const scorePresentationMode =
    latest?.scorePresentationMode ?? scoringV2?.scorePresentationMode ?? "normal";
  const likelyUnderestimatedFit =
    Boolean(latest?.likelyUnderestimatedFit ?? scoringV2?.likelyUnderestimatedFit) ||
    scorePresentationMode === "fix_first";
  const isFixFirstMode =
    scorePresentationMode === "fix_first" ||
    (typeof activeScore === "number" && activeScore < 60);
  const productDecisionState = useMemo(
    () =>
      buildProductDecisionState({
        surface: "results",
        baselineId: latest?.baselineId ?? baselineId ?? null,
        jobId: latest?.jobId ?? jobId ?? null,
        score: typeof activeScore === "number" ? activeScore : null,
        generationReadiness,
        hasCanonicalAssessment: Boolean(latest?.assessmentId),
        hasRequiredContext: Boolean((latest?.jobId ?? jobId) && (latestBaselineId || baselineId)),
        isPro: true,
        forceFitReview: isFixFirstMode,
        scorePresentationModeCandidates: [
          latest?.scorePresentationMode ?? null,
          scoringV2?.scorePresentationMode ?? null,
          scorePresentationMode,
        ],
        likelyUnderestimatedFit,
        routeContext: {
          assessmentId: latest?.assessmentId ?? runIdentifier ?? null,
          analysisId: latest?.assessmentId ?? runIdentifier ?? null,
          baselineId: latest?.baselineId ?? baselineId ?? null,
          jobId: latest?.jobId ?? jobId ?? null,
          baselineVersionId: latest?.baselineVersionId ?? null,
          fromUnlock: justUnlocked,
        },
        persistedAssessmentId: latest?.assessmentId ?? null,
        analysisCandidates: latest
          ? [
              {
                source: "latest_assessment",
                value: {
                  assessmentId: latest.assessmentId ?? null,
                  baselineId: latest.baselineId ?? null,
                  jobId: latest.jobId ?? null,
                  baselineVersionId: latest.baselineVersionId ?? null,
                },
              },
            ]
          : undefined,
        scoreCandidates: [{ source: "primary", value: typeof activeScore === "number" ? activeScore : null }],
      }),
    [
      activeScore,
      baselineId,
      generationReadiness,
      isFixFirstMode,
      justUnlocked,
      latest?.assessmentId,
      latest?.baselineId,
      latest?.baselineVersionId,
      latest?.jobId,
      latest?.scorePresentationMode,
      latestBaselineId,
      jobId,
      likelyUnderestimatedFit,
      runIdentifier,
      scorePresentationMode,
      scoringV2?.scorePresentationMode,
    ],
  );
  const fitReviewPath = productDecisionState.fitReviewHref;
  const studioHref = productDecisionState.studioHref;
  const [resultsGenerationPhase, setResultsGenerationPhase] =
    useState<ResultsGenerationPhase>("not_started");
  const [resultsArtifactStatuses, setResultsArtifactStatuses] = useState<{
    resume: ResultsArtifactStatus;
    coverLetter: ResultsArtifactStatus;
  }>({ resume: "missing", coverLetter: "missing" });
  const hasFetchedArtifactsOnceRef = useRef(false);
  const [hasFetchedArtifactsOnce, setHasFetchedArtifactsOnce] = useState(false);
  const autoGenerationTriggeredRef = useRef<Set<string>>(new Set());
  const runGenerationRecoveryWithPairIdsRef = useRef<
    | null
    | ((
        pairIds: NonNullable<typeof generationPairIds>,
        opts?: { force?: boolean },
      ) => Promise<void>)
  >(null);
  const [resumeGenerationPayload, setResumeGenerationPayload] = useState<unknown>(null);
  const [coverLetterGenerationPayload, setCoverLetterGenerationPayload] = useState<unknown>(null);
  const [hasCompletedGeneration, setHasCompletedGeneration] = useState(false);
  const hasCompletedGenerationRef = useRef(false);
  const hasStartedGenerationRef = useRef(false);
  const generationRequestedAtRef = useRef<number | null>(null);
  const generationRecoveryRequestIdRef = useRef(0);
  const generationMutationSessionKeysRef = useRef<Set<string>>(new Set());
  const [generationRecoveryStage, setGenerationRecoveryStage] =
    useState<ResultsGenerationRecoveryStage>("idle");
  const [generationRecoveryExhausted, setGenerationRecoveryExhausted] = useState(false);
  const [generationMutationError, setGenerationMutationError] = useState<string | null>(null);

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
  const productReadiness = productDecisionState.productReadiness;
  const canonicalResultsDecision = productDecisionState.canonicalDecision;
  const resultsReadiness = useMemo<GenerationReadiness>(
    () => productDecisionState.renderedGenerationReadiness,
    [productDecisionState.renderedGenerationReadiness],
  );
  const canOpenStudio = canonicalResultsDecision.readinessState !== "BLOCKED";
  const shouldAutoRecoverGeneration = shouldGenerateDocuments(activeScore);
  const resultsArtifactScope =
    canonicalResultsDecision.readinessState === "DRAFT" && !shouldAutoRecoverGeneration
      ? ("resume_only" as const)
      : ("both" as const);
  const generationRecoveryInProgress =
    shouldAutoRecoverGeneration &&
    generationRecoveryStage !== "idle" &&
    generationRecoveryStage !== "exhausted" &&
    !generationRecoveryExhausted;
  const generationRecoveryFinalizing =
    generationRecoveryInProgress &&
    (generationRecoveryStage === "retry_attempt" || generationRecoveryStage === "fallback_attempt");
  const effectiveResultsGenerationPhase: ResultsGenerationPhase = generationRecoveryInProgress
    ? "generating"
    : resultsGenerationPhase;
  const generationPairIds = useMemo(() => {
    const baselineIdValue = latest?.baselineId?.trim() ?? "";
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? currentBaselineVersionId?.trim() ?? "";
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const analysisIdValue = latest?.assessmentId?.trim() ?? "";
    if (!baselineIdValue || !baselineVersionIdValue || !jobIdValue || !analysisIdValue) return null;
    return {
      baselineId: baselineIdValue,
      baselineVersionId: baselineVersionIdValue,
      jobId: jobIdValue,
      analysisId: analysisIdValue,
    };
  }, [currentBaselineVersionId, latest?.assessmentId, latest?.baselineId, latest?.baselineVersionId, latest?.jobId]);
  const generationSessionKey = useMemo(() => {
    if (!generationPairIds) return null;
    // Generation identity must not churn when baselineVersionId is resolved/changes.
    return `${generationPairIds.baselineId}:${generationPairIds.jobId}:${generationPairIds.analysisId}`;
  }, [generationPairIds]);
  const autoGenerationSessionKey = useMemo(() => {
    const baselineIdValue = latest?.baselineId?.trim() ?? "";
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const analysisIdValue = latest?.assessmentId?.trim() ?? "";
    if (!baselineIdValue || !jobIdValue || !analysisIdValue) return null;
    return `${baselineIdValue}:${jobIdValue}:${analysisIdValue}`;
  }, [latest?.assessmentId, latest?.baselineId, latest?.jobId]);
  const resolveGenerationPairIds = useCallback(async () => {
    const baselineIdValue = latest?.baselineId?.trim() ?? "";
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const analysisIdValue = latest?.assessmentId?.trim() ?? "";
    if (!baselineIdValue || !jobIdValue || !analysisIdValue) return null;

    const baselineVersionIdFromLatest = latest?.baselineVersionId?.trim() ?? "";
    const baselineVersionIdFromState = currentBaselineVersionId?.trim() ?? "";
    if (baselineVersionIdFromLatest) {
      return {
        baselineId: baselineIdValue,
        baselineVersionId: baselineVersionIdFromLatest,
        jobId: jobIdValue,
        analysisId: analysisIdValue,
      };
    }

    if (baselineVersionIdFromState) {
      return {
        baselineId: baselineIdValue,
        baselineVersionId: baselineVersionIdFromState,
        jobId: jobIdValue,
        analysisId: analysisIdValue,
      };
    }

    try {
      const response = await fetch(`/api/baselines/${encodeURIComponent(baselineIdValue)}/versions`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      const versions = (await response.json()) as Array<{ id: string; versionNumber: number }>;
      const resolved = resolveLatestBaselineVersionId({ versions });
      if (!resolved) return null;
      return {
        baselineId: baselineIdValue,
        baselineVersionId: resolved,
        jobId: jobIdValue,
        analysisId: analysisIdValue,
      };
    } catch (error) {
      console.error("Failed to resolve generation pair ids", error);
      return null;
    }
  }, [
    currentBaselineVersionId,
    latest?.assessmentId,
    latest?.baselineId,
    latest?.baselineVersionId,
    latest?.jobId,
  ]);

  const applyArtifactSnapshot = useCallback(
    (statuses: { resume: ResultsArtifactStatus; coverLetter: ResultsArtifactStatus }, phase: ResultsGenerationPhase) => {
      const completed =
        resultsArtifactScope === "resume_only"
          ? statuses.resume === "completed"
          : statuses.resume === "completed" || statuses.coverLetter === "completed";
      if (completed) {
        if (!hasCompletedGenerationRef.current) {
          hasCompletedGenerationRef.current = true;
          setHasCompletedGeneration(true);
        }
        setResultsArtifactStatuses(statuses);
        setResultsGenerationPhase("generated");
        setGenerationRecoveryStage("idle");
        setGenerationRecoveryExhausted(false);
        return;
      }

      if (hasCompletedGenerationRef.current) {
        // Once completion is reached, ignore partial polling frames that may not include all artifacts.
        return;
      }

      setResultsArtifactStatuses(statuses);
      setResultsGenerationPhase(phase);
    },
    [resultsArtifactScope],
  );

  useEffect(() => {
    hasCompletedGenerationRef.current = false;
    hasStartedGenerationRef.current = false;
    generationRequestedAtRef.current = null;
    generationMutationSessionKeysRef.current = new Set();
    setHasCompletedGeneration(false);
    hasFetchedArtifactsOnceRef.current = false;
    setHasFetchedArtifactsOnce(false);
    setResultsArtifactStatuses({ resume: "missing", coverLetter: "missing" });
    setResultsGenerationPhase("not_started");
    setGenerationRecoveryStage("idle");
    setGenerationRecoveryExhausted(false);
    setGenerationMutationError(null);
    setResumeGenerationPayload(null);
    setCoverLetterGenerationPayload(null);
  }, [generationSessionKey]);
  const studioHrefFromLatest = useMemo(() => {
    if (!generationPairIds) return studioHref;
    return getStudioHref({
      baselineId: generationPairIds.baselineId,
      baselineVersionId: generationPairIds.baselineVersionId,
      jobId: generationPairIds.jobId,
      analysisId: generationPairIds.analysisId,
    });
  }, [generationPairIds, studioHref]);
  const studioNavigationHref = useMemo(() => {
    const currentResultsHref =
      typeof window === "undefined"
        ? null
        : `${window.location.pathname}${window.location.search}`;

    const fallbackStudioHref = buildStudioHrefFromResultsContext({
      jobId: latest?.jobId ?? jobId ?? null,
      baselineId: latest?.baselineId ?? baselineId ?? null,
      baselineVersionId: latest?.baselineVersionId ?? currentBaselineVersionId ?? null,
      analysisId: latest?.assessmentId ?? runIdentifier ?? null,
      fromUnlock: justUnlocked,
    });

    return resolveStudioNavigationHref({
      studioHrefFromLatest,
      fallbackStudioHref,
      currentResultsHref,
    });
  }, [
    baselineId,
    currentBaselineVersionId,
    jobId,
    justUnlocked,
    latest?.assessmentId,
    latest?.baselineId,
    latest?.baselineVersionId,
    latest?.jobId,
    runIdentifier,
    studioHrefFromLatest,
  ]);
  const claimVerifications = useMemo(
    () => normalizeClaimVerifications(debugFields?.toolingCoverage?.claims),
    [debugFields?.toolingCoverage?.claims],
  );
  const verificationCoverage = useMemo(
    () => deriveVerificationCoverage(generationReadiness, claimVerifications),
    [claimVerifications, generationReadiness],
  );
  useEffect(() => {
    if (!generationPairIds) return;
    if (hasCompletedGenerationRef.current) return;

    let cancelled = false;
    const fetchArtifacts = async () => {
      try {
        const backendUrl = new URL("/api/studio/artifacts", window.location.origin);
        backendUrl.searchParams.set("baselineId", generationPairIds.baselineId);
        backendUrl.searchParams.set("baselineVersionId", generationPairIds.baselineVersionId);
        backendUrl.searchParams.set("jobId", generationPairIds.jobId);
        backendUrl.searchParams.set("analysisId", generationPairIds.analysisId);
        const response = await fetch(backendUrl.toString(), { cache: "no-store" });
        const payload = await readResponsePayload(response);
        if (cancelled) return;
        if (!response.ok) return;
        const statuses = deriveResultsArtifactStatuses(payload);
        const generationStarted =
          hasStartedGenerationRef.current || typeof generationRequestedAtRef.current === "number";
        const derivedPhase = deriveResultsGenerationPhase(statuses, {
          recoveryInProgress:
            shouldAutoRecoverGeneration &&
            generationRecoveryStage !== "idle" &&
            generationRecoveryStage !== "exhausted" &&
            !generationRecoveryExhausted,
          generationStarted,
          artifactScope: resultsArtifactScope,
        });
        applyArtifactSnapshot(statuses, derivedPhase);

        if (
          shouldAutoRecoverGeneration &&
          !generationStarted &&
          resultsGenerationPhase === "not_started" &&
          !hasAnyArtifactStatus(statuses)
        ) {
          const sessionKey = `${generationPairIds.baselineId}:${generationPairIds.jobId}:${generationPairIds.analysisId}`;
          if (!autoGenerationTriggeredRef.current.has(sessionKey)) {
            autoGenerationTriggeredRef.current.add(sessionKey);
            void runGenerationRecoveryWithPairIdsRef.current?.(generationPairIds);
          }
        }
      } catch {
        // Best effort only.
      }
    };

    void fetchArtifacts();

    return () => {
      cancelled = true;
    };
  }, [
    applyArtifactSnapshot,
    generationPairIds,
    generationRecoveryExhausted,
    generationRecoveryStage,
    resultsArtifactScope,
    resultsGenerationPhase,
    shouldAutoRecoverGeneration,
  ]);

  useEffect(() => {
    if (!generationPairIds) return;
    if (hasCompletedGenerationRef.current) return;
    if (resultsGenerationPhase !== "generating") return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      if (cancelled) return;
      try {
        const backendUrl = new URL("/api/studio/artifacts", window.location.origin);
        backendUrl.searchParams.set("baselineId", generationPairIds.baselineId);
        backendUrl.searchParams.set("baselineVersionId", generationPairIds.baselineVersionId);
        backendUrl.searchParams.set("jobId", generationPairIds.jobId);
        backendUrl.searchParams.set("analysisId", generationPairIds.analysisId);
        const response = await fetch(backendUrl.toString(), { cache: "no-store" });
        const payload = await readResponsePayload(response);
        if (!response.ok) return;
        if (!hasFetchedArtifactsOnceRef.current) {
          hasFetchedArtifactsOnceRef.current = true;
          setHasFetchedArtifactsOnce(true);
        }
        const statuses = deriveResultsArtifactStatuses(payload);
        const generationStarted =
          hasStartedGenerationRef.current || typeof generationRequestedAtRef.current === "number";
        const derivedPhase = deriveResultsGenerationPhase(statuses, {
          recoveryInProgress:
            shouldAutoRecoverGeneration &&
            generationRecoveryStage !== "idle" &&
            generationRecoveryStage !== "exhausted" &&
            !generationRecoveryExhausted,
          generationStarted,
          artifactScope: resultsArtifactScope,
        });
        applyArtifactSnapshot(statuses, derivedPhase);
        const terminalPhase = hasCompletedGenerationRef.current ? "generated" : derivedPhase;
        const shouldContinueSystemOwnedRecoveryPolling =
          shouldAutoRecoverGeneration &&
          !generationRecoveryExhausted &&
          (terminalPhase === "partial" || terminalPhase === "failed");
        if (terminalPhase !== "generating" && !shouldContinueSystemOwnedRecoveryPolling) {
          window.clearInterval(interval);
        }
      } catch {
        // ignore
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    applyArtifactSnapshot,
    generationPairIds,
    generationRecoveryExhausted,
    generationRecoveryStage,
    resultsArtifactScope,
    resultsGenerationPhase,
    shouldAutoRecoverGeneration,
  ]);
  const reliabilityFacts = useMemo(() => {
    const totalClaims = verificationCoverage.totalClaims;
    const verifiedClaims = verificationCoverage.verifiedClaims;
    const completenessPercent =
      totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 100) : null;
    const baselineCompleteness =
      completenessPercent == null
        ? "Structured experience completeness is still being established."
        : completenessPercent >= 100
          ? "Your structured experience is fully built for this role."
          : `Structured experience completeness for this role is ${completenessPercent}%.`;
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
      resultsReadiness.status === "limited" || resultsReadiness.status === "blocked";
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
      isDocumentGenerationUnlocked(activeScore) &&
      canonicalUnverifiedRequirements.length > 0 &&
      activeScore < 80 &&
      (effectiveResultsGenerationPhase === "generated" ||
        effectiveResultsGenerationPhase === "failed" ||
        effectiveResultsGenerationPhase === "partial"),
    [activeScore, canonicalUnverifiedRequirements.length, effectiveResultsGenerationPhase],
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
  const summarySnippet =
    typeof latest?.summary === "string"
      ? sanitizeRenderedTextValue(latest.summary, {
          endpoint: "results",
          field: "summary",
        })
      : null;
  const autoEvidenceSuggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildEvidenceSuggestion>>();
    for (const requirement of canonicalUnverifiedRequirements) {
      map.set(
        requirement,
        buildEvidenceSuggestion({
          requirement,
          supportingSignals: latest?.supportingSignals,
          baselineEvidence: latest?.baselineEvidence ?? summarySnippet,
        }),
      );
    }
    return map;
  }, [canonicalUnverifiedRequirements, latest?.baselineEvidence, latest?.supportingSignals, summarySnippet]);
  const fallbackRequirementInsights = useMemo(() => {
    const shouldShowRefinementGuidance =
      recentIntent === "refine_intent" || recentIntent === "used_not_committed";
    if (
      !((isDocumentGenerationUnlocked(activeScore) && resultsReadiness.status !== "ready") || shouldShowRefinementGuidance)
    ) {
      return [];
    }
    const requirementsToExplain =
      canonicalUnverifiedRequirements.length > 0
        ? canonicalUnverifiedRequirements
        : criticalGapDetails.map((gap) => gap.title).filter((title) => typeof title === "string" && title.trim().length > 0);
    const criticalGapMap = new Map(
      criticalGapDetails.map((gap) => [normalizeUserFacingRequirementLabel(gap.title, {
        sourceContext: null,
        issueCode: "unsupported_technology_claim",
      })?.toLowerCase() ?? gap.title.toLowerCase(), gap]),
    );
    const insights = requirementsToExplain
      .map((requirement) => {
        const normalizedRequirement = normalizeUserFacingRequirementLabel(requirement, {
          sourceContext: null,
          issueCode: "unsupported_technology_claim",
        })?.toLowerCase() ?? requirement.toLowerCase();
        const gap = criticalGapMap.get(normalizedRequirement) ?? null;
        return buildRequirementGapInsight({
          requirement,
          requirementEvidence: gap?.requirementEvidence ?? requirement,
          baselineEvidence: gap?.baselineEvidence ?? latest?.baselineEvidence ?? summarySnippet,
          supportingSignals: latest?.supportingSignals,
          summary: summarySnippet,
        });
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return insights.slice(0, 3);
  }, [
    activeScore,
    canonicalUnverifiedRequirements,
    criticalGapDetails,
    resultsReadiness.status,
    recentIntent,
    latest?.baselineEvidence,
    latest?.supportingSignals,
    summarySnippet,
  ]);
  const improvementSuggestions = useMemo(() => {
    const sourceRequirements = Array.from(
      new Set([
        ...criticalGapDetails.map((gap) => gap.title).filter(Boolean),
        ...canonicalUnverifiedRequirements,
      ]),
    );
    const suggestions = sourceRequirements
      .map((requirement) => buildActionableImprovementSuggestion({ requirement }))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.priority - b.priority);
    if (suggestions.length > 0) {
      return suggestions.slice(0, 4);
    }
    if (recentIntent === "refine_intent" || recentIntent === "used_not_committed") {
      return [
        {
          requirement: "baseline_strengthening",
          action: "Run Fit Review to strengthen missing areas.",
          rationale: "Use your current analysis to close the biggest gaps first.",
          nextStep: "Start Fit Review",
          priority: 99,
        },
      ];
    }
    return [];
  }, [
    canonicalUnverifiedRequirements,
    criticalGapDetails,
    latest?.supportingSignals,
    recentIntent,
    summarySnippet,
  ]);
  const isStrongFitScore = typeof activeScore === "number" && activeScore >= 80;
  const shouldTreatGenerationAsSystemOwned = isSystemOwnedFinalizedGeneration(activeScore);
  const hasArtifactFailure =
    resultsArtifactStatuses.resume === "failed" || resultsArtifactStatuses.coverLetter === "failed";
  const suppressFailureUiDuringRecovery =
    shouldTreatGenerationAsSystemOwned && generationRecoveryInProgress && !generationRecoveryExhausted;
  const suppressFailureUiUntilRecoveryStarts =
    shouldTreatGenerationAsSystemOwned &&
    !generationRecoveryExhausted &&
    (generationRecoveryInProgress ||
      effectiveResultsGenerationPhase === "failed" ||
      effectiveResultsGenerationPhase === "partial" ||
      (resultsGenerationPhase === "generating" && hasArtifactFailure));
  const generationCuePhase: ResultsGenerationPhase = suppressFailureUiDuringRecovery
    ? "generating"
    : effectiveResultsGenerationPhase;
  const showImprovementModule =
    improvementSuggestions.length > 0 &&
    (isStrongFitScore ||
      !(
        resultsReadiness.status === "blocked" &&
        typeof activeScore === "number" &&
        isDocumentGenerationUnlocked(activeScore) &&
        activeScore < 80
      ));
  const discoveredRoles = useMemo(
    () =>
      discoverCompetitiveRoles({
        analysis: latest,
        applicationInsights,
        activeScore: typeof activeScore === "number" ? activeScore : null,
      }),
    [activeScore, applicationInsights, latest],
  );
  const resultsReturnCue = useMemo(() => {
    if (shouldAutoRecoverGeneration && generationRecoveryExhausted) {
      return "We hit an issue generating your documents.";
    }
    if (generationCuePhase === "generating") {
      return suppressFailureUiDuringRecovery || suppressFailureUiUntilRecoveryStarts
        ? "Finalizing your documents..."
        : "Generating your documents...";
    }
    if (generationCuePhase === "generated") {
      return "Your documents are ready.";
    }
    if (generationCuePhase === "failed" || generationCuePhase === "partial") {
      return "Generation needs attention.";
    }
    if (isStrongFitScore) {
      return "Strong match. Ready for document generation.";
    }
    if (recentIntent === "used_and_committed") {
      return "You're actively pursuing this role. Keep momentum in Opportunities.";
    }
    if (recentIntent === "used_not_committed") {
      return "Your artifact is ready. Save the role if you want to keep moving.";
    }
    if (recentIntent === "refine_intent") {
      return "You signaled refinement, so Fit Review is the fastest path to a sharper result.";
    }
    return null;
  }, [
    generationCuePhase,
    generationRecoveryExhausted,
    isStrongFitScore,
    recentIntent,
    shouldAutoRecoverGeneration,
    suppressFailureUiDuringRecovery,
  ]);
  const resultsScoreBucket = useMemo(
    () => (typeof activeScore === "number" ? getScoreBand(activeScore) : undefined),
    [activeScore],
  );
  const isGenerationBlocked =
    resultsReadiness.status === "blocked" && !isDocumentGenerationUnlocked(activeScore);
  const effectiveReadinessStatus: GenerationReadiness["status"] = resultsReadiness.status;
  useEffect(() => {
    if (!showImprovementModule) return;
    trackEvent("results_improvement_module_viewed", {
      source: "results",
      intentState: recentIntent ?? "none",
      suggestionsShown: improvementSuggestions.length,
      scoreBucket: resultsScoreBucket ?? null,
    });
  }, [improvementSuggestions.length, recentIntent, resultsScoreBucket, showImprovementModule]);
  const showGenerationUnlockedPanel = Boolean(latest) && justUnlocked && !isGenerationBlocked && !isStrongFitScore;
  const evidenceLedger = useMemo(
    () =>
      deriveEvidenceLedger(latest, {
        generationAllowed: true,
      }),
    [latest],
  );
  const primaryNextAction = canonicalResultsDecision.nextAction;
  const isWeakFitScore = typeof activeScore === "number" && !isDocumentGenerationUnlocked(activeScore);
  const isCompetitiveBlocked = isGenerationBlocked && !isWeakFitScore;
  const { isGuidedActive, syncWithNextAction, completeGuidedMode, advanceStep } = useGuidedMode();
  useEffect(() => {
    if (!isGuidedActive) return;
    if (!latest) {
      advanceStep("ANALYZE");
      return;
    }
    advanceStep("RESULTS");
    syncWithNextAction(
      (primaryNextAction.type === "studio" || primaryNextAction.type === "studio_with_save"
        ? primaryNextAction.type
        : "fit_review") as "fit_review" | "studio" | "studio_with_save",
    );
  }, [advanceStep, isGuidedActive, latest, primaryNextAction.type, syncWithNextAction]);
  const resolveGapPreview = useMemo(
    () =>
      canonicalUnverifiedRequirements.slice(0, 3).map((requirement) => ({
        requirement,
        explanation: GAP_EXPLANATION_FALLBACK,
      })),
    [canonicalUnverifiedRequirements],
  );
  const weakFitRecovery = useMemo(
    () =>
      isWeakFitScore
        ? {
            href: fitReviewPath,
            gapPreview: resolveGapPreview,
          }
        : null,
    [isWeakFitScore, resolveGapPreview, fitReviewPath],
  );
  const advancedInsightsHref = "#advanced-insights";
  const verificationUnlockLabel = useMemo(() => {
    if (canonicalUnverifiedRequirements.length === 0) {
      return "Verify examples to unlock Studio";
    }
    const count = canonicalUnverifiedRequirements.length;
    return `Verify ${count} example${count === 1 ? "" : "s"} to unlock Studio`;
  }, [canonicalUnverifiedRequirements.length]);
  const secondaryAction = useMemo(() => {
    if (isStrongFitScore) {
      return {
        label: "Improve Evidence First",
        href: fitReviewPath,
      };
    }
    if (effectiveReadinessStatus === "limited") {
      return {
        label: "Verify examples",
        href: fitReviewPath,
      };
    }
    return {
      label: "View top drivers",
      href: advancedInsightsHref,
    };
  }, [advancedInsightsHref, effectiveReadinessStatus, fitReviewPath, isStrongFitScore]);
  const blockedResultsState: ResultsBlockedState | null = useMemo(() => {
    if (!latest || !isGenerationBlocked) return null;
    return buildCompetitiveBlockedResultsState({
      score: typeof activeScore === "number" ? activeScore : null,
      fitReviewHref: fitReviewPath,
      secondaryActionHref: advancedInsightsHref,
      criticalGaps: criticalGapDetails,
      unverifiedRequirements: canonicalUnverifiedRequirements,
    });
  }, [
    activeScore,
    advancedInsightsHref,
    canonicalUnverifiedRequirements,
    criticalGapDetails,
    fitReviewPath,
    isGenerationBlocked,
    latest,
  ]);
  const oneClickResultsCta = useMemo<OpportunityMapSectionProps["primaryCta"]>(() => {
    if (!latest) return null;

    const analyticsAction = mapResultsAnalyticsActionType(canonicalResultsDecision.primaryAction.type);
    const isMomentum = isStrongFitScore;

    return {
      label: isMomentum ? "Generate Resume & Cover Letter" : canonicalResultsDecision.primaryAction.label,
      href: canonicalResultsDecision.primaryAction.destination,
      disabled: !canonicalResultsDecision.primaryAction.isEnabled || (!canOpenStudio && canonicalResultsDecision.primaryAction.type === "open_studio"),
      description:
        isMomentum
          ? "You’re ready to generate. Strengthen these areas to improve results."
          :
        canonicalResultsDecision.blockingReason?.message ??
        canonicalResultsDecision.supportingMessage ??
        blockedResultsState?.supportSummary ??
        "Complete Fit Review to clarify the evidence gaps below.",
      onClick: () => {
        trackEvent("results_primary_cta_clicked", {
          source: "results",
          intentState: recentIntent ?? "none",
          action: analyticsAction,
          scoreBucket: resultsScoreBucket ?? null,
          readinessStatus: mapResultsAnalyticsReadinessStatus(canonicalResultsDecision.readinessState),
          accessMode: isMomentum ? "momentum" : "recovery",
        });
      },
    };
  }, [
    canOpenStudio,
    canonicalResultsDecision.blockingReason?.message,
    canonicalResultsDecision.primaryAction.destination,
    canonicalResultsDecision.primaryAction.isEnabled,
    canonicalResultsDecision.primaryAction.label,
    canonicalResultsDecision.primaryAction.type,
    canonicalResultsDecision.supportingMessage,
    canonicalResultsDecision.workflowState,
    blockedResultsState?.supportSummary,
    latest,
    recentIntent,
    resultsScoreBucket,
    isStrongFitScore,
  ]);
  const runGenerationRecoveryWithPairIds = useCallback(
    async (
      pairIds: NonNullable<typeof generationPairIds>,
      opts?: { force?: boolean },
    ) => {
      const shouldDebugMutation = process.env.NODE_ENV !== "test";
      if (!shouldAutoRecoverGeneration) return;
      if (hasCompletedGenerationRef.current) return;
      if (resultsGenerationPhase === "generating" && !opts?.force) return;

      const sessionKey = `${pairIds.baselineId}:${pairIds.jobId}:${pairIds.analysisId}`;
      if (!opts?.force && generationMutationSessionKeysRef.current.has(sessionKey)) {
        return;
      }
      generationMutationSessionKeysRef.current.add(sessionKey);

      const shouldAttemptCoverLetter = resultsArtifactScope !== "resume_only";
      const needsResume =
        resultsArtifactStatuses.resume === "missing" || resultsArtifactStatuses.resume === "failed";
      const needsCoverLetter =
        shouldAttemptCoverLetter &&
        (resultsArtifactStatuses.coverLetter === "missing" || resultsArtifactStatuses.coverLetter === "failed");
      if (!needsResume && !needsCoverLetter) {
        return;
      }

      const requestId = generationRecoveryRequestIdRef.current + 1;
      generationRecoveryRequestIdRef.current = requestId;

      console.log("[RESULTS][MUTATION_START]", {
        requestId,
        artifactScope: resultsArtifactScope,
        baselineId: pairIds.baselineId,
        baselineVersionId: pairIds.baselineVersionId,
        jobId: pairIds.jobId,
        analysisId: pairIds.analysisId,
        needsResume,
        needsCoverLetter,
      });

      hasStartedGenerationRef.current = true;
      setGenerationRecoveryExhausted(false);
      setGenerationRecoveryStage("primary_attempt");
      setGenerationMutationError(null);
      generationRequestedAtRef.current = Date.now();
      setResultsGenerationPhase("generating");

      const baseFields = {
        jobId: pairIds.jobId,
        baselineId: pairIds.baselineId,
        baselineVersionId: pairIds.baselineVersionId,
        analysisId: pairIds.analysisId,
      };

      const callResume = async (mode: "primary" | "fallback") => {
        const payload = buildExportPayload({
          documentType: "resume",
          oneTap: mode === "fallback",
          ...baseFields,
          analysisId: mode === "fallback" ? null : baseFields.analysisId,
        });
        const response = await fetch("/api/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const responsePayload = await readResponsePayload(response.clone());
        if (!response.ok) {
          const raw = await response.text().catch(() => "");
          if (shouldDebugMutation) {
            console.error("[RESULTS][MUTATION_ERROR][RESUME]", {
              status: response.status,
              body: raw.slice(0, 500),
            });
          }
          setGenerationMutationError(
            raw.trim().length ? `Resume generation failed (${response.status}).` : "Resume generation failed.",
          );
        } else if (responsePayload) {
          setResumeGenerationPayload(responsePayload);
        }
        return response.ok;
      };

      const callCoverLetter = async (mode: "primary" | "fallback") => {
        const payload = buildExportPayload({
          documentType: "cover_letter",
          oneTap: mode === "fallback",
          ...baseFields,
          analysisId: mode === "fallback" ? null : baseFields.analysisId,
        });
        const response = await fetch("/api/cover-letters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const responsePayload = await readResponsePayload(response.clone());
        if (!response.ok) {
          const raw = await response.text().catch(() => "");
          if (shouldDebugMutation) {
            console.error("[RESULTS][MUTATION_ERROR][COVER_LETTER]", {
              status: response.status,
              body: raw.slice(0, 500),
            });
          }
          setGenerationMutationError(
            raw.trim().length
              ? `Cover letter generation failed (${response.status}).`
              : "Cover letter generation failed.",
          );
        } else if (responsePayload) {
          setCoverLetterGenerationPayload(responsePayload);
        }
        return response.ok;
      };

      const attempt = async (mode: "primary" | "fallback", only?: Array<"resume" | "coverLetter">) => {
        const shouldResume = !only || only.includes("resume");
        const shouldCover = shouldAttemptCoverLetter && (!only || only.includes("coverLetter"));
        const [resumeOk, coverOk] = await Promise.all([
          shouldResume ? callResume(mode) : Promise.resolve(true),
          shouldCover ? callCoverLetter(mode) : Promise.resolve(true),
        ]);
        return { resumeOk, coverOk };
      };

      try {
        const firstOnly: Array<"resume" | "coverLetter"> = [];
        if (needsResume) firstOnly.push("resume");
        if (needsCoverLetter) firstOnly.push("coverLetter");
        const first = await attempt("primary", firstOnly.length ? firstOnly : undefined);
        if (generationRecoveryRequestIdRef.current !== requestId) return;
        if (first.resumeOk && first.coverOk) {
          setGenerationRecoveryStage("idle");
          return;
        }

        setGenerationRecoveryStage("retry_attempt");
        const retryOnly: Array<"resume" | "coverLetter"> = [];
        if (!first.resumeOk) retryOnly.push("resume");
        if (!first.coverOk && shouldAttemptCoverLetter) retryOnly.push("coverLetter");
        const second = await attempt("primary", retryOnly.length ? retryOnly : undefined);
        if (generationRecoveryRequestIdRef.current !== requestId) return;
        if (second.resumeOk && second.coverOk) {
          setGenerationRecoveryStage("idle");
          return;
        }

        setGenerationRecoveryStage("fallback_attempt");
        const fallbackOnly: Array<"resume" | "coverLetter"> = [];
        if (!second.resumeOk) fallbackOnly.push("resume");
        if (!second.coverOk && shouldAttemptCoverLetter) fallbackOnly.push("coverLetter");
        const third = await attempt("fallback", fallbackOnly.length ? fallbackOnly : undefined);
        if (generationRecoveryRequestIdRef.current !== requestId) return;
        if (third.resumeOk && third.coverOk) {
          setGenerationRecoveryStage("idle");
          return;
        }

        setGenerationRecoveryStage("exhausted");
        setGenerationRecoveryExhausted(true);
      } catch {
        if (generationRecoveryRequestIdRef.current !== requestId) return;
        setGenerationRecoveryStage("exhausted");
        setGenerationRecoveryExhausted(true);
      }
    },
    [
      resultsArtifactScope,
      resultsArtifactStatuses.coverLetter,
      resultsArtifactStatuses.resume,
      resultsGenerationPhase,
      shouldAutoRecoverGeneration,
    ],
  );
  useEffect(() => {
    runGenerationRecoveryWithPairIdsRef.current = runGenerationRecoveryWithPairIds;
  }, [runGenerationRecoveryWithPairIds]);
  const runGenerationRecovery = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!generationPairIds) return;
      await runGenerationRecoveryWithPairIds(generationPairIds, opts);
    },
    [generationPairIds, runGenerationRecoveryWithPairIds],
  );

  useEffect(() => {
    if (!shouldTreatGenerationAsSystemOwned) return;
    if (!generationPairIds) return;
    if (generationRecoveryExhausted) return;
    if (generationRecoveryStage !== "idle") return;
    const hasArtifactFailure =
      resultsArtifactStatuses.resume === "failed" || resultsArtifactStatuses.coverLetter === "failed";
    if (!hasArtifactFailure) return;
    void runGenerationRecovery({ force: true });
  }, [
    generationPairIds,
    generationRecoveryExhausted,
    generationRecoveryStage,
    resultsArtifactStatuses.coverLetter,
    resultsArtifactStatuses.resume,
    runGenerationRecovery,
    shouldTreatGenerationAsSystemOwned,
  ]);
  const opportunityMapPrimaryCta = useMemo(() => {
    if (!oneClickResultsCta) return null;
    if (suppressFailureUiUntilRecoveryStarts) {
      return {
        label: "Finalizing...",
        disabled: true,
        description: "Finalizing your documents...",
      };
    }
    if (shouldAutoRecoverGeneration && generationRecoveryExhausted) {
      return {
        label: "Try again",
        onClick: () => void runGenerationRecovery({ force: true }),
        description: "We hit an issue generating your documents. Please try again.",
      };
    }
    return oneClickResultsCta;
  }, [
    generationRecoveryExhausted,
    oneClickResultsCta,
    runGenerationRecovery,
    shouldAutoRecoverGeneration,
    suppressFailureUiUntilRecoveryStarts,
  ]);
  const opportunityMapGenerationRecoveryUi = suppressFailureUiUntilRecoveryStarts
    ? ("finalizing" as const)
    : shouldAutoRecoverGeneration && generationRecoveryExhausted
      ? ("exhausted" as const)
      : null;
  const isResultsGenerationPrimaryAction = useMemo(() => {
    const actionType = canonicalResultsDecision.primaryAction.type;
    const label = canonicalResultsDecision.primaryAction.label.toLowerCase();
    return actionType === "generate_documents" || actionType === "retry_generation" || label.includes("generate");
  }, [canonicalResultsDecision.primaryAction.label, canonicalResultsDecision.primaryAction.type]);
  const triggerResultsGeneration = useCallback(async () => {
    const actionType = canonicalResultsDecision.primaryAction.type;
    const label = canonicalResultsDecision.primaryAction.label.toLowerCase();
    const isGenerationAction =
      actionType === "generate_documents" || actionType === "retry_generation" || label.includes("generate");
    if (!isGenerationAction) return;

    const resolvedPairIds = generationPairIds ?? (await resolveGenerationPairIds());
    if (!resolvedPairIds) {
      console.error("[RESULTS_UI][GENERATE_CLICK][MISSING_PAIR_IDS]", {
        actionType,
        destination: canonicalResultsDecision.primaryAction.destination,
      });
      setResultsGenerationPhase("failed");
      return;
    }

    console.log("[RESULTS_UI][GENERATE_CLICK]", {
      actionType,
      destination: canonicalResultsDecision.primaryAction.destination,
      baselineId: resolvedPairIds.baselineId,
      jobId: resolvedPairIds.jobId,
      analysisId: resolvedPairIds.analysisId,
    });

    if (hasCompletedGenerationRef.current) {
      router.push(studioHrefFromLatest);
      return;
    }

    if (shouldAutoRecoverGeneration) {
      void runGenerationRecoveryWithPairIds(
        resolvedPairIds,
        generationRecoveryExhausted ? { force: true } : undefined,
      );
      return;
    }

    generationRequestedAtRef.current = Date.now();
    setResultsGenerationPhase("generating");
    window.setTimeout(() => {
      router.push(studioHrefFromLatest);
    }, 50);
  }, [
    canonicalResultsDecision.primaryAction.destination,
    canonicalResultsDecision.primaryAction.label,
    canonicalResultsDecision.primaryAction.type,
    generationRecoveryExhausted,
    generationPairIds,
    router,
    resolveGenerationPairIds,
    runGenerationRecoveryWithPairIds,
    shouldAutoRecoverGeneration,
    studioHrefFromLatest,
  ]);
  const isReadyResultsState = canonicalResultsDecision.readinessState === "READY";
  const resultsDecision = useMemo(
    () => {
      const copy = buildResultsDecisionCopy({
        score: typeof activeScore === "number" ? activeScore : null,
        generationReadiness: {
          state:
            canonicalResultsDecision.readinessState === "BLOCKED"
              ? "BLOCKED"
              : canonicalResultsDecision.readinessState === "READY"
                ? "ALLOWED"
                : canonicalResultsDecision.readinessState === "DRAFT"
                  ? "ALLOWED"
                  : "BLOCKED",
          confidence: productReadiness.confidence,
          needsVerification: productReadiness.needsVerification,
        },
      });
      if (canonicalResultsDecision.readinessState === "READY") {
        return {
          state: "READY" as const,
          primaryCta: "open_studio" as const,
          headline: copy.headline,
          subtext: copy.subtext,
        };
      }

      if (canonicalResultsDecision.readinessState === "DRAFT") {
        return {
          state: "DRAFT" as const,
          primaryCta: "open_studio" as const,
          headline: copy.headline,
          subtext: copy.subtext,
        };
      }

      if (canonicalResultsDecision.readinessState === "BLOCKED") {
        return {
          state: "BLOCKED" as const,
          primaryCta: "fit_review" as const,
          headline: copy.headline,
          subtext: blockedResultsState?.supportSummary ?? copy.subtext,
        };
      }

      return {
        state: "IMPROVE" as const,
        primaryCta: "fit_review" as const,
        headline: copy.headline,
        subtext: copy.subtext,
      };
    },
    [activeScore, blockedResultsState?.body, canonicalResultsDecision.readinessState, productReadiness],
  );
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEBUG_RESULTS_FLOW !== "true") {
      return;
    }
    if (!latest) return;
    const cta = {
      label: canonicalResultsDecision.primaryAction.label,
      href: canonicalResultsDecision.primaryAction.destination,
      actionType: mapResultsAnalyticsActionType(canonicalResultsDecision.primaryAction.type),
      analyticsPayload: {
        source: "results" as const,
        intentState: recentIntent ?? "none",
        action: mapResultsAnalyticsActionType(canonicalResultsDecision.primaryAction.type),
        scoreBucket: resultsScoreBucket ?? null,
        readinessStatus: mapResultsAnalyticsReadinessStatus(canonicalResultsDecision.readinessState),
      },
    };
    const decisionKey = [
      latest.assessmentId ?? "none",
      canonicalResultsDecision.workflowState,
      cta.label,
      cta.href,
      cta.actionType,
      resultsScoreBucket ?? "none",
    ].join(":");
    if (resultsDecisionLogKeyRef.current === decisionKey) return;
    resultsDecisionLogKeyRef.current = decisionKey;

    logDecisionFlowEvent({
      event: "results_decision_resolved",
      entrySource: "results",
      baselineId: latest.baselineId ?? null,
      jobId: latest.jobId ?? null,
      pairKey:
        latest.baselineId && latest.jobId ? `${latest.baselineId}:${latest.jobId}` : null,
      score: typeof activeScore === "number" ? activeScore : null,
      readinessState: canonicalResultsDecision.workflowState,
      contractSource: "resolveCanonicalState",
      ctaLabel: cta.label,
      ctaHref: cta.href,
      resolvedRoute: cta.href,
      actionType: cta.actionType,
      legacyFallbackAttempted: cta.href.startsWith("/resolve-gaps"),
      legacyFallbackBlocked: !cta.href.startsWith("/resolve-gaps"),
      analyticsPayload: cta.analyticsPayload,
      dataSource: "mixed",
      persistedAssessmentId: latest.assessmentId ?? null,
    });
  }, [
    activeScore,
    canonicalResultsDecision.primaryAction.destination,
    canonicalResultsDecision.primaryAction.label,
    canonicalResultsDecision.primaryAction.type,
    canonicalResultsDecision.workflowState,
    latest,
    recentIntent,
    resultsScoreBucket,
    studioHref,
  ]);
  const formatDriverValue = (value?: number | null) =>
    typeof value === "number" ? value.toFixed(1) : "n/a";
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
  const hasEvidenceGaps = isGenerationBlocked;
  const hasFitGaps = criticalGapDetails.length > 0 || signalAlignment.weakerForRole.length > 0;

  const renderDriverGrid = ({
    showExtraLine,
    limit = scoreDrivers.length,
    offset = 0,
    forceShowExtraLine = false,
  }: {
    showExtraLine: boolean;
    limit?: number;
    offset?: number;
    forceShowExtraLine?: boolean;
  }) => (
    <div className="grid gap-3 lg:grid-cols-2">
      {scoreDrivers.slice(offset, limit).map((driver) => {
        const cta = driver.cta;
        const suppressDriverActions =
          canonicalResultsDecision.readinessState === "BLOCKED" || isWeakFitScore;
        return (
          <article
            key={driver.key}
            className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/20 p-3.5"
          >
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{driver.label}</p>
            <p className="text-xs text-slate-500">
              {driver.bucket === "strong"
                ? "Strong alignment"
                : driver.bucket === "watch"
                  ? "Moderate alignment"
                  : driver.bucket === "fix"
                    ? "Weak alignment"
                    : "No score yet"}
            </p>
            <div className="space-y-1.5 text-sm text-slate-200">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Why this matters</p>
              <p>{driver.why}</p>
              {driver.evidence.length ? (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Evidence</p>
                  <ul className="space-y-1 text-sm text-slate-200 list-disc list-inside">
                    {driver.evidence.slice(0, 2).map((item, index) => (
                      <li key={`${driver.key}-evidence-${index}`}>{item}</li>
                    ))}
                    {driver.evidence.length > 2 ? (
                      <li className="list-none text-xs text-slate-500">
                        +{driver.evidence.length - 2} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Evidence unavailable for this dimension.</p>
              )}
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Next action</p>
              <p>{driver.action}</p>
              {(forceShowExtraLine || showExtraLine) && driver.extraLine ? (
                <p className="text-xs text-slate-400">{driver.extraLine}</p>
              ) : null}
            </div>
            {cta ? (
              suppressDriverActions ? (
                <p className="text-xs text-slate-400">You&apos;ll address this in Fit Review.</p>
              ) : shouldTreatGenerationAsSystemOwned ? null : (
                <div className="pt-1">
                  <FormButton
                    variant="ghost"
                    onClick={() => {
                      void router.push(cta.href);
                    }}
                    disabled={!!driver.ctaDisabled}
                  >
                    {cta.label}
                  </FormButton>
                </div>
              )
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
    const raw = summarySnippet ?? "";
    if (raw.length && !/key term/i.test(raw)) {
      return raw;
    }
    return "Load the latest analysis to surface how the score reflects your context.";
  }, [latest, summarySnippet]);

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
    if (!jobId) return "No job selected. Go to Baseline and choose a job to continue.";
    if (!baselineId) return "No baseline selected. Go to Baseline and choose a baseline to continue.";
    if (analysisSource === "latest" && latest) return "Latest analysis loaded.";
    return "Load the latest analysis to see the score and next step.";
  }, [analysisSource, jobId, baselineId, latest, loadingLatest]);

  const loadAssessmentById = useCallback(
    async (assessmentId: string) => {
      if (!assessmentId) {
        setError("Assessment ID is required to load analysis.");
        return;
      }

      const requestKey = `assessment:${assessmentId.trim()}`;
      if (activeAssessmentLoadRef.current?.requestKey === requestKey) return;
      const requestId = createRequestId();
      activeAssessmentLoadRef.current = { requestId, requestKey };

      setLoadingLatest(true);
      setError(null);
      setLatest(null);
      setComplianceError(null);

      try {
        const res = await fetch(
          `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`,
          { cache: "no-store" },
        );
        console.log("SCORING RESPONSE:", res);

        const payload = await readResponsePayload(res.clone());

        if (!res.ok) {
          if (activeAssessmentLoadRef.current?.requestId !== requestId) {
            return;
          }
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
        const sanitizedData = sanitizeLatestAnalysisResponse(
          data,
          "/api/analysis/fit-assessments/:assessmentId",
        );
        if (activeAssessmentLoadRef.current?.requestId !== requestId) {
          logWorkflowRequestEvent("stale_response_dropped", {
            action: "results_load_assessment",
            expected: {
              baselineId: sanitizedData.baselineId ?? null,
              jobId: sanitizedData.jobId ?? null,
              baselineVersionId: sanitizedData.baselineVersionId ?? null,
              analysisId: assessmentId,
            },
            current: {
              baselineId: baselineId || null,
              jobId: jobId || null,
              baselineVersionId: latest?.baselineVersionId ?? null,
              analysisId: latest?.assessmentId ?? null,
            },
            requestId,
            source: "results",
          });
          return;
        }
        if (!sanitizedData.baselineId?.trim()) {
          throw new Error("This result is no longer linked to an active resume.");
        }
        setLatest(sanitizedData);
        setBaselineId(sanitizedData.baselineId ?? "");
        setJobId(sanitizedData.jobId ?? "");
        setAnalysisSource("latest");
        await persistLastAssessmentId(sanitizedData.assessmentId ?? assessmentId);
      } catch (error: unknown) {
        if (activeAssessmentLoadRef.current?.requestId !== requestId) {
          return;
        }
        trackEvent("analysis_load_failed", {
          source: "results",
          status: "assessment_exception",
        });
        setError(error instanceof Error ? error.message : COMPATIBILITY_ANALYSIS_ERROR);
      } finally {
        if (activeAssessmentLoadRef.current?.requestId === requestId) {
          setLoadingLatest(false);
          activeAssessmentLoadRef.current = null;
        }
      }
    },
    [
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
    const targetJobId = options?.jobIdOverride?.trim() || jobId.trim();
    const targetBaselineId = options?.baselineIdOverride?.trim() || baselineId.trim();
    const allowCreate = options?.allowCreate ?? false;
    const interactive = options?.interactive ?? false;
    const requestKey = buildWorkflowRequestKey("results_load", {
      baselineId: targetBaselineId || null,
      jobId: targetJobId || null,
      baselineVersionId: latest?.baselineVersionId ?? null,
      analysisId: latest?.assessmentId ?? null,
    });
    if (!requestKey) {
      setError("Select a baseline and job before loading analysis.");
      return;
    }
    if (activeLatestLoadRef.current?.requestKey === requestKey) return;
    const requestId = createRequestId();
    activeLatestLoadRef.current = { requestId, requestKey };

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
      area: "results",
      operation: "hydrate_latest",
      status: "info",
      code: "hydration_started",
      jobId: targetJobId,
      baselineId: targetBaselineId,
      allowCreate,
    });

      try {
        const res = await fetch(
          `/api/analysis/job/${encodeURIComponent(targetJobId)}/baseline/${encodeURIComponent(targetBaselineId)}/latest`,
          { cache: "no-store" },
        );
        console.log("SCORING RESPONSE:", res);

        const payload = await readResponsePayload(res.clone());
      if (activeLatestLoadRef.current?.requestId !== requestId) {
        return;
      }

      if (res.status === 404 && allowCreate) {
        console.info("[results] hydration_not_found_running_analysis", {
          area: "results",
          operation: "hydrate_latest",
          status: "info",
          code: "hydration_not_found_running_analysis",
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
        console.log("SCORING RESPONSE:", runResponse);

        const runPayload = await readResponsePayload(runResponse.clone());
        if (activeLatestLoadRef.current?.requestId !== requestId) {
          return;
        }
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
            area: "results",
            operation: "hydrate_latest",
            status: "warn",
            code: "hydration_run_failed",
            responseStatus: runResponse.status,
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
        params.set("assessmentId", createdAssessmentId);
        params.set("analysisId", createdAssessmentId);
        const query = params.toString();
        const path = query ? `/results?${query}` : "/results";
        await router.replace(path);
        return;
      }

      if (!res.ok) {
        console.warn("[results] hydration_failed", {
          area: "results",
          operation: "hydrate_latest",
          status: "warn",
          code: "hydration_failed",
          responseStatus: res.status,
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
        const sanitizedData = sanitizeLatestAnalysisResponse(
          data,
          "/api/analysis/job/:jobId/baseline/:baselineId/latest",
        );
        if (activeLatestLoadRef.current?.requestId !== requestId) {
          logWorkflowRequestEvent("stale_response_dropped", {
            action: "results_load_latest",
            expected: {
              baselineId: targetBaselineId,
              jobId: targetJobId,
              baselineVersionId: sanitizedData.baselineVersionId ?? null,
              analysisId: sanitizedData.assessmentId ?? null,
            },
            current: {
              baselineId: baselineId || null,
              jobId: jobId || null,
              baselineVersionId: latest?.baselineVersionId ?? null,
              analysisId: latest?.assessmentId ?? null,
            },
            requestId,
            source: "results",
          });
          return;
        }
        console.info("[results] hydration_succeeded", {
          area: "results",
          operation: "hydrate_latest",
          status: "info",
          code: "hydration_succeeded",
          assessmentId: sanitizedData.assessmentId ?? null,
          jobId: sanitizedData.jobId ?? null,
          baselineId: sanitizedData.baselineId ?? null,
        });
      if (!sanitizedData.assessmentId) {
        throw new Error("Latest assessment is missing an assessment ID.");
      }
      if (!sanitizedData.baselineId?.trim()) {
        throw new Error("This result is no longer linked to an active resume.");
      }

      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("assessmentId", sanitizedData.assessmentId);
      params.set("analysisId", sanitizedData.assessmentId);
      const query = params.toString();
      const path = query ? `/results?${query}` : "/results";
      await router.replace(path);
      } catch (error: unknown) {
        if (activeLatestLoadRef.current?.requestId !== requestId) {
          return;
        }
        console.error("[results] hydration_failed", {
          area: "results",
          operation: "hydrate_latest",
          status: "error",
          code: "hydration_failed",
          responseStatus: "exception",
        });
        trackEvent("analysis_load_failed", {
        source: "results",
        status: "latest_exception",
        });
        setError(error instanceof Error ? error.message : COMPATIBILITY_ANALYSIS_ERROR);
      } finally {
        if (activeLatestLoadRef.current?.requestId === requestId) {
          setLoadingLatest(false);
          activeLatestLoadRef.current = null;
        }
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
    const queryBaselineId = searchParams?.get("baselineId")?.trim() ?? "";
    const queryJobId = searchParams?.get("jobId")?.trim() ?? "";
    if (!queryBaselineId || queryJobId) return;
    let canceled = false;
    const resolveLatestForBaseline = async () => {
      const latestForBaseline = await fetchLatestAssessmentForBaseline(queryBaselineId);
      if (canceled || !latestForBaseline?.assessmentId) return;
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("analysisId");
      params.delete("fitScoreId");
      // Preserve baselineId/jobId in the URL so Target flow state isn't lost mid-session.
      params.set("assessmentId", latestForBaseline.assessmentId);
      const query = params.toString();
      const destination = query ? `/results?${query}` : "/results";
      await router.replace(destination);
    };
    void resolveLatestForBaseline();
    return () => {
      canceled = true;
    };
  }, [runIdentifier, router, searchParams]);

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
    if (queryBaselineId || queryJobId) return;

    lastAssessmentHydrationAttempted.current = true;
    setError("Select an active resume to load Results.");
  }, [runIdentifier, searchParams]);

  const saveOpportunityFromResults = useCallback(async () => {
    if (!latest || typeof activeScore !== "number") return;
    const jobIdValue = latest.jobId?.trim() ?? "";
    const analysisIdValue = latest.assessmentId?.trim() ?? "";
    const baselineIdValue = latest.baselineId?.trim() ?? "";
    if (!jobIdValue || !analysisIdValue || !baselineIdValue) return;

    const company =
      (typeof latest.companyName === "string" && latest.companyName.trim()) ||
      (typeof latest.company === "string" && latest.company.trim()) ||
      "Unknown company";
    const roleTitle =
      (typeof latest.jobTitle === "string" && latest.jobTitle.trim()) ||
      (typeof latest.title === "string" && latest.title.trim()) ||
      "Untitled role";

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
          generationCompleted,
          savedEvidenceSummary: evidenceLedger.entries.map((entry) => entry.text).slice(0, 3),
        }),
      });
      if (response.ok) {
        setOpportunitySaved(true);
        if (isGuidedActive) {
          completeGuidedMode();
        }
        return (await response.json()) as { id?: string; status?: string } | null;
      }
    } catch (error) {
      console.error("Failed to save opportunity from Results", error);
    }
    return null;
  }, [activeScore, completeGuidedMode, evidenceLedger.entries, generationCompleted, isGuidedActive, latest]);

  const applyOpportunityFromResults = useCallback(async () => {
    const created = await saveOpportunityFromResults();
    const opportunityId = created?.id?.trim() ?? "";
    if (opportunityId) {
      try {
        await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "APPLIED" }),
        });
      } catch (error) {
        console.error("Failed to update opportunity status", error);
      }
    }
  }, [saveOpportunityFromResults]);

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
      console.log("SCORING RESPONSE:", response);
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
      await router.replace(
        `/results?assessmentId=${encodeURIComponent(assessmentId)}&analysisId=${encodeURIComponent(
          assessmentId,
        )}`,
      );
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run re-analysis.");
    } finally {
      setReanalysisRunning(false);
    }
  }, [latest?.baselineId, latest?.jobId, router]);

  const recoveryAnalyzeHref = useMemo(() => {
    const params = new URLSearchParams();
    if (jobId.trim()) params.set("jobId", jobId.trim());
    if (baselineId.trim()) params.set("baselineId", baselineId.trim());
    const query = params.toString();
    return query ? `/analyze?${query}` : "/analyze";
  }, [baselineId, jobId]);

  useEffect(() => {
    const previousScore = reanalysisDelta.previousScore;
    const currentScoreValue = reanalysisDelta.currentScore;
    if (typeof previousScore !== "number" || typeof currentScoreValue !== "number") return;
    const upgraded = (previousScore <= 70 && currentScoreValue > 70) || currentScoreValue >= 85;
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
      } catch (error) {
        console.error("Failed to update opportunity readiness", error);
      }
    })();
  }, [latest?.baselineId, latest?.jobId, reanalysisDelta.currentScore, reanalysisDelta.previousScore]);
  const guidedOverlayConfig = useMemo(() => {
    if (!isGuidedActive) return null;
    if (!latest) {
      return {
        headline: "Let's see if this role is actually a fit.",
        body: "Start with analysis and we will guide you to the best next step.",
        ctaLabel: "ANALYZE A ROLE",
        ctaHref: "/analyze",
      };
    }
    return null;
  }, [
    isGuidedActive,
    latest,
  ]);

  return (
    <PageShell className="results-page-theme">
      <div className="space-y-5">
        <PageHeader
          title="Your result"
          description={
            resultsReturnCue ?? "Review your compatibility score and next best step."
          }
        />
        {scorePresentationMode !== "normal" ? (
          <section
            className={`rounded-2xl border p-4 ${
              scorePresentationMode === "fix_first"
                ? "border-amber-300/30 bg-amber-500/10"
                : "border-sky-300/30 bg-sky-500/10"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                scorePresentationMode === "fix_first" ? "text-amber-100" : "text-sky-100"
              }`}
            >
              {scorePresentationMode === "fix_first"
                ? "We may be underestimating your fit."
                : "This score has some uncertainty."}
            </p>
            <p className="mt-1 text-sm text-slate-100">
              {scorePresentationMode === "fix_first"
                ? "We found relevant experience, but the resume does not clearly show ownership for this role."
                : "Relevant evidence is present, but some signals are still mixed or partially translated."}
            </p>
            {scoreConfidenceReasons.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-100">
                {scoreConfidenceReasons.slice(0, 2).map((reason: string) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {false ? (
          <section className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-100">You’re not ready to apply yet.</p>
            <p className="mt-1 text-sm text-slate-100">
              Strengthen your baseline before generating application materials.
            </p>
          </section>
        ) : null}
        <section
          className={`rounded-2xl border p-4 ${
            scorePresentationMode === "fix_first"
                ? "border-amber-300/30 bg-amber-500/10"
                : canonicalResultsDecision.readinessState === "READY"
                  ? "border-emerald-300/30 bg-emerald-500/10"
                  : canonicalResultsDecision.readinessState === "DRAFT"
                    ? "border-amber-300/30 bg-amber-500/10"
                    : "border-slate-700/60 bg-slate-900/45"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              scorePresentationMode === "fix_first"
                  ? "text-amber-100"
                  : canonicalResultsDecision.readinessState === "READY"
                    ? "text-emerald-100"
                    : canonicalResultsDecision.readinessState === "DRAFT"
                      ? "text-amber-100"
                      : "text-amber-100"
            }`}
          >
            {scorePresentationMode === "fix_first"
                ? "We may be underestimating your fit."
                : shouldAutoRecoverGeneration && generationRecoveryExhausted
                  ? "We hit an issue generating your documents"
                : suppressFailureUiUntilRecoveryStarts
                    ? "Finalizing your documents..."
                    : effectiveResultsGenerationPhase === "generating"
                      ? "Generating your documents..."
                      : effectiveResultsGenerationPhase === "generated"
                        ? "Your documents are ready"
                        : effectiveResultsGenerationPhase === "failed"
                          ? "Generation failed"
                          : effectiveResultsGenerationPhase === "partial"
                            ? "Generation needs attention"
                            : resultsDecision.headline}
          </p>
          <p className="mt-1 text-sm text-slate-100">
            {scorePresentationMode === "fix_first"
                ? "This score looks low confidence. Fix the evidence story first, then rerun generation."
                : shouldAutoRecoverGeneration && generationRecoveryExhausted
                  ? "We hit an issue generating your documents. Please try again."
                : suppressFailureUiUntilRecoveryStarts
                    ? "Finalizing your documents..."
                    : effectiveResultsGenerationPhase === "generating"
                      ? "We’re drafting your resume and cover letter now."
                      : effectiveResultsGenerationPhase === "generated"
                        ? "Your drafts are ready below. Refinement comes next."
                        : effectiveResultsGenerationPhase === "failed"
                          ? "Retry generation, or open Studio to adjust inputs and try again."
                          : effectiveResultsGenerationPhase === "partial"
                            ? "Some drafts finished, but at least one needs a retry."
                            : resultsDecision.subtext}
          </p>
          {effectiveResultsGenerationPhase !== "not_started" ? (
            <>
              <p className="mt-2 text-sm font-medium text-slate-200">
                {shouldAutoRecoverGeneration && generationRecoveryExhausted
                  ? "We hit an issue generating your documents."
                  : suppressFailureUiUntilRecoveryStarts
                    ? "Finalizing your documents..."
                    : effectiveResultsGenerationPhase === "generating"
                      ? "Generating your documents..."
                      : effectiveResultsGenerationPhase === "generated"
                        ? "Your documents are ready."
                        : effectiveResultsGenerationPhase === "failed"
                          ? "Generation failed."
                          : "Some documents need attention."}
              </p>
              {suppressFailureUiUntilRecoveryStarts ? (
                <p className="mt-1 text-sm text-slate-300">
                  Keep this tab open. We’ll update as soon as the drafts are ready.
                </p>
              ) : effectiveResultsGenerationPhase === "generating" ? (
                <p className="mt-1 text-sm text-slate-300">
                  Keep this tab open. You can review drafts in Studio as soon as they finish.
                </p>
              ) : effectiveResultsGenerationPhase === "generated" ? (
                <p className="mt-1 text-sm text-slate-300">
                  Review the drafts below, then refine in Studio if needed.
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-300">
                  Resume:{" "}
                  <span className="font-medium text-slate-100">{resultsArtifactStatuses.resume}</span> · Cover letter:{" "}
                  <span className="font-medium text-slate-100">{resultsArtifactStatuses.coverLetter}</span>
                </p>
              )}
            </>
          ) : canonicalResultsDecision.readinessState === "READY" ? (
            <>
              <p className="mt-2 text-sm font-medium text-emerald-100">
                Confidence: {productReadiness.confidence === "HIGH" ? "High" : "Medium"}
              </p>
              <p className="mt-1 text-sm text-emerald-50">
                {productReadiness.confidence === "HIGH"
                  ? "Your profile is grounded enough to generate in Studio."
                  : "Your materials are ready to generate now. Review them in Studio before applying."}
              </p>
              <p className="mt-1 text-xs text-emerald-100/80">Review the draft in Studio before applying.</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm font-medium text-slate-200">
                {productReadiness.confidence === "HIGH"
                  ? "Confidence: High"
                  : productReadiness.confidence === "MEDIUM"
                    ? "Confidence: Medium"
                    : "Confidence: Low"}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {productReadiness.confidence === "HIGH"
                  ? "Your profile is grounded enough to generate in Studio."
                  : productReadiness.confidence === "MEDIUM"
                    ? "A few details still need sharper grounding."
                    : "This result still needs stronger grounding before generation."}
              </p>
            </>
          )}
          <div className="mt-3">
            {oneClickResultsCta ? (
              canonicalResultsDecision.readinessState === "BLOCKED" && isStrongFitScore ? (
                oneClickResultsCta.disabled ? (
                  <span
                    data-testid="results-hero-primary-cta"
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-4 py-2 text-sm font-semibold text-slate-400"
                  >
                    {oneClickResultsCta.label}
                  </span>
                ) : oneClickResultsCta.href ? (
                  <a
                    data-testid="results-hero-primary-cta"
                    href={oneClickResultsCta.href}
                    onClick={oneClickResultsCta.onClick}
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    {oneClickResultsCta.label}
                  </a>
                ) : null
              ) : canonicalResultsDecision.readinessState === "BLOCKED" ? (
                <p className="text-sm font-medium text-slate-200">You&apos;ll address this in Fit Review.</p>
              ) : shouldAutoRecoverGeneration && generationRecoveryExhausted ? (
                <button
                  type="button"
                  data-testid="results-hero-primary-cta"
                  onClick={() => {
                    oneClickResultsCta.onClick?.();
                    void runGenerationRecovery({ force: true });
                  }}
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Try again
                </button>
              ) : suppressFailureUiUntilRecoveryStarts ? (
                <span
                  data-testid="results-hero-primary-cta"
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
                >
                  Finalizing...
                </span>
              ) : effectiveResultsGenerationPhase === "generating" ? (
                <span
                  data-testid="results-hero-primary-cta"
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
                >
                  Generating...
                </span>
              ) : effectiveResultsGenerationPhase === "generated" ? (
                <button
                  type="button"
                  data-testid="results-hero-primary-cta"
                  onClick={() => {
                    oneClickResultsCta.onClick?.();
                    router.push(studioNavigationHref);
                  }}
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Open in Studio
                </button>
              ) : effectiveResultsGenerationPhase === "partial" ? (
                shouldAutoRecoverGeneration && !generationRecoveryExhausted ? (
                  <span
                    data-testid="results-hero-primary-cta"
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
                  >
                    Finalizing...
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid="results-hero-primary-cta"
                    onClick={() => {
                      oneClickResultsCta.onClick?.();
                      router.push(studioNavigationHref);
                    }}
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Open in Studio
                  </button>
                )
              ) : effectiveResultsGenerationPhase === "failed" ? (
                <button
                  type="button"
                  data-testid="results-hero-primary-cta"
                  onClick={() => {
                    if (process.env.NODE_ENV !== "production") {
                      console.log("[RESULTS][GENERATE_CLICK]");
                    }
                    oneClickResultsCta.onClick?.();
                    if (shouldAutoRecoverGeneration) {
                      void runGenerationRecovery({ force: true });
                    } else {
                      void triggerResultsGeneration();
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  {shouldAutoRecoverGeneration ? "Try again" : "Retry generation"}
                </button>
              ) : oneClickResultsCta.disabled ? (
                <span
                  data-testid="results-hero-primary-cta"
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-white/10 px-4 py-2 text-sm font-semibold text-slate-400"
                >
                  {oneClickResultsCta.label}
                </span>
              ) : oneClickResultsCta.href ? (
                isResultsGenerationPrimaryAction || canonicalResultsDecision.primaryAction.kind === "invoke" ? (
                  <button
                    type="button"
                    data-testid="results-hero-primary-cta"
                    onClick={() => {
                      if (process.env.NODE_ENV !== "production") {
                        console.log("[RESULTS][GENERATE_CLICK]");
                      }
                      oneClickResultsCta.onClick?.();
                      void triggerResultsGeneration();
                    }}
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    {oneClickResultsCta.label}
                  </button>
                ) : (
                  <a
                    data-testid="results-hero-primary-cta"
                    href={oneClickResultsCta.href}
                    onClick={oneClickResultsCta.onClick}
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    {oneClickResultsCta.label}
                  </a>
                )
              ) : null
            ) : null}
          </div>
          {effectiveResultsGenerationPhase === "generated" ? (
            <div className="mt-6 space-y-5" data-testid="results-generated-documents">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Documents</p>
                <p className="text-lg font-semibold text-slate-50">Your drafts</p>
                <p className="text-sm text-slate-300">
                  Documents come first. Add more evidence after you review and refine these drafts.
                </p>
              </div>
              {resumeGenerationPayload ? <ResumePreview payload={resumeGenerationPayload} /> : null}
              {coverLetterGenerationPayload ? (
                <div className="space-y-3" data-testid="cover-letter-preview">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Preview of tailored cover letter
                  </p>
                  <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm leading-7 text-slate-100">
                    {buildCoverLetterParagraphs(coverLetterGenerationPayload).map((paragraph, index) => (
                      <p key={`results-cover-letter-paragraph-${index}`}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {generationMutationError ? (
            <p className="mt-2 text-xs font-medium text-rose-200" data-testid="results-generation-mutation-error">
              {generationMutationError}
            </p>
          ) : null}
        </section>
        {resultsGenerationPhase === "not_started" && showGenerationUnlockedPanel && !isStrongFitScore ? (
          <section
            className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4"
            data-testid="results-generation-unlocked-panel"
          >
            <p className="text-sm font-semibold text-emerald-100">GENERATION UNLOCKED</p>
            <p className="mt-1 text-sm text-slate-100">
              {productReadiness.confidence === "HIGH"
                ? "Your profile now supports this role. You can move into Studio with this result."
                : "Your materials are ready to generate now. Review them in Studio before applying."}
            </p>
            {typeof reanalysisDelta.delta === "number" ? (
              <p className="mt-2 text-xs text-emerald-200">
                Evidence added. Score change: {reanalysisDelta.delta > 0 ? "+" : ""}
                {Math.round(reanalysisDelta.delta)} points.
              </p>
            ) : null}
          </section>
        ) : null}
        {guidedOverlayConfig ? (
          <GuidedOverlay
            headline={guidedOverlayConfig.headline}
            body={guidedOverlayConfig.body}
            ctaLabel={guidedOverlayConfig.ctaLabel}
            ctaHref={guidedOverlayConfig.ctaHref}
          />
        ) : null}
        {opportunitySaved ? (
          <p className="text-xs font-medium text-emerald-300">Saved to Opportunities</p>
        ) : null}
        {baselineUpdatedForReanalysis && latest ? (
          <section className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4">
            <p className="text-sm font-semibold text-cyan-100">Updated Baseline Detected</p>
            <p className="mt-1 text-sm text-slate-100">
              Your experience foundation changed since this analysis. Use the primary decision action above to reanalyze this role.
            </p>
          </section>
        ) : null}
        {previousAnalysis && typeof reanalysisDelta.delta === "number" ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-base font-semibold text-slate-100">
              {progressSummary.improvementDetected ? "You’ve improved your fit" : "No meaningful change yet"}
            </h2>
            <p
              className={`mt-2 text-sm font-medium ${
                progressSummary.scoreChange > 0
                  ? "text-emerald-300"
                  : progressSummary.scoreChange < 0
                    ? "text-rose-300"
                    : "text-slate-200"
              }`}
            >
              {progressSummary.scoreChange > 0 ? "+" : ""}
              {Math.round(progressSummary.scoreChange)} points (
              {Math.round(reanalysisDelta.previousScore ?? 0)} {"->"} {Math.round(reanalysisDelta.currentScore ?? 0)})
            </p>
            {progressSummary.gapsClosed.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-100">Gaps closed:</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-200">
                  {progressSummary.gapsClosed.map((signal) => (
                    <li key={`closed-gap-${signal}`}>- {signal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {progressSummary.gapsNew.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-100">New gaps introduced:</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-200">
                  {progressSummary.gapsNew.map((signal) => (
                    <li key={`new-gap-${signal}`}>- {signal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!progressSummary.improvementDetected ? (
              <p className="mt-3 text-sm text-amber-200">
                Your updates did not add meaningful new signals for this role.
              </p>
            ) : null}
          </section>
        ) : null}
        {isQualified && !isStrongFitScore && canonicalResultsDecision.readinessState === "READY" ? (
          <section className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4">
            <h2 className="text-base font-semibold text-emerald-100">Ready to apply</h2>
            <p className="mt-1 text-sm text-slate-100">
              This role is ready to move from preparation to action.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <FormButton onClick={() => void applyOpportunityFromResults()}>
                Apply to this role
              </FormButton>
              <FormButton variant="secondary" onClick={() => void saveOpportunityFromResults()}>
                Save this opportunity
              </FormButton>
            </div>
          </section>
        ) : null}

        <section className="space-y-7 rounded-3xl bg-slate-950/55 p-6">
          {error && !latest ? (
            <RouteStateShell
              testId="results-analysis-recovery"
              tone="warning"
              eyebrow="Recovery"
              title="Analysis unavailable"
              body={<p className="text-sm text-slate-100">{error}</p>}
              cta={
                <Link
                  href={recoveryAnalyzeHref}
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  ANALYZE A ROLE
                </Link>
              }
            />
          ) : null}
          {!latest && !error ? (
            <EmptyState
              title="No compatibility analysis yet"
              body={
                loadingLatest
                  ? "Preparing compatibility report..."
                  : hasJobBaselineContext
                    ? "Preparing your Compatibility Analysis automatically."
                    : "Load the latest Compatibility Analysis to reveal your Fit Verdict and Compatibility Score."
              }
              cta={
                !hasJobBaselineContext ? (
                  <FormButton
                    variant="ghost"
                    onClick={() => void loadLatest({ interactive: true, allowCreate: true })}
                    disabled={!jobId || !baselineId || loading || loadingLatest}
                  >
                    {loadingLatest ? "PREPARING..." : "ANALYZE A ROLE"}
                  </FormButton>
                ) : null
              }
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          ) : (
            <div className="space-y-7">
              <div className="space-y-7">
                  <OpportunityMapSection
                    assessmentId={latest?.assessmentId ?? null}
                    score={activeScore}
                    scoreBreakdown={scoreBreakdown}
                    verdict={opportunityVerdict}
                    nextAction={primaryNextAction}
                    advantageSignals={advantageSignals}
                    primaryCta={opportunityMapPrimaryCta}
                    evidenceLedger={evidenceLedger}
                    scoreAnalysisHref="#advanced-insights"
                    readiness={resultsReadiness}
                    verificationCoverage={verificationCoverage}
                    canonicalCoverage={latest?.verification_coverage ?? null}
                    blockedState={blockedResultsState}
                    predictiveUnlock={predictiveUnlock}
                    weakFitRecovery={weakFitRecovery}
                    reliabilityFacts={reliabilityFacts}
                    secondaryAction={secondaryAction}
                    generationPhase={generationCuePhase}
                    generationRecoveryUi={opportunityMapGenerationRecoveryUi}
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
                                {role.fitLevel} - {role.estimatedFitScore}
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
                                ANALYZE A ROLE
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
                              <p className="text-sm text-slate-100">This claim needs verification: {requirement}</p>
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

                  {isReadyResultsState ? (
                    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4">
                      <h3 className="text-lg font-semibold text-slate-100">Why this role fits you</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{signalAlignment.summary}</p>
                      <p className="mt-3 text-sm text-slate-200">No material gaps were identified in this run.</p>
                    </section>
                  ) : isCompetitiveBlocked && blockedResultsState ? (
                    <SignalAlignmentSection
                      title="Readiness drivers"
                      strengths={Array.from(
                        new Set([...advantageSignals, ...signalAlignment.strongForRole]),
                      ).slice(0, 6)}
                      gaps={blockedResultsState.drivers.map((driver) => driver.title)}
                      summary={blockedResultsState.trustLine}
                      gapHeading="What still needs clarification"
                      gapEmptyMessage="Complete Fit Review to clarify the evidence gaps listed above."
                    />
                  ) : (
                    <SignalAlignmentSection
                      title={isGenerationBlocked ? "Evidence gaps" : "Why this role fits you"}
                      strengths={Array.from(
                        new Set([...advantageSignals, ...signalAlignment.strongForRole]),
                      ).slice(0, 6)}
                      gaps={
                        isGenerationBlocked && criticalGapDetails.length > 0
                          ? criticalGapDetails.map((gap) => gap.title).slice(0, 3)
                          : resultsDecision.state === "IMPROVE" || resultsDecision.state === "DRAFT"
                            ? signalAlignment.weakerForRole
                            : []
                      }
                      summary={
                        effectiveReadinessStatus === "limited"
                          ? "Alignment looks strong, but a few details still need sharper grounding."
                          : effectiveReadinessStatus === "blocked"
                            ? "Your experience aligns with the role, but a few details still need sharper grounding."
                            : signalAlignment.summary
                      }
                      gapHeading={
                        effectiveReadinessStatus === "blocked"
                          ? "What needs strengthening"
                          : effectiveReadinessStatus === "limited"
                            ? "Still to ground"
                            : "Gaps to be aware of"
                      }
                      gapEmptyMessage={
                        effectiveReadinessStatus === "blocked"
                          ? "These details are still preventing Studio from opening."
                          : effectiveReadinessStatus === "limited"
                            ? "Alignment looks strong, but a few details still need sharper grounding."
                            : "No material gaps were identified in this run."
                      }
                    />
                  )}
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
                  {!isReadyResultsState && !isStrongFitScore &&
                  (!isWeakFitScore || recentIntent === "refine_intent" || recentIntent === "used_not_committed") &&
                  scoreBand !== ScoreBand.TOP ? (
                    <section id="fit-improvement-opportunities" className="rounded-2xl border border-slate-700/50 bg-slate-900/35 p-3">
                      <FitImprovementOpportunities
                        assessmentId={latest?.assessmentId ?? null}
                        fallbackInsights={fallbackRequirementInsights}
                        supportingSignals={latest?.supportingSignals}
                        baselineEvidence={latest?.baselineEvidence ?? summarySnippet}
                        summary={summarySnippet}
                        compact
                      />
                    </section>
                  ) : null}
                  {!isReadyResultsState && showImprovementModule ? (
                    <section
                      id="how-to-improve-your-fit"
                      className="rounded-2xl border border-sky-300/20 bg-sky-500/10 p-4"
                      data-testid="how-to-improve-your-fit"
                    >
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
                          How to improve your fit
                        </p>
                        <ul className="space-y-1 text-sm text-slate-100">
                          {improvementSuggestions.map((item) => (
                            <li
                              key={`results-fit-improve-${item.requirement}`}
                              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                            >
                              {item.action}
                            </li>
                          ))}
                        </ul>
                        <p className="pt-1 text-sm font-medium text-slate-200">
                          You&apos;ll address these gaps in Fit Review.
                        </p>
                      </div>
                    </section>
                  ) : null}
                  {!isReadyResultsState && !isStrongFitScore ? (
                    <section className="rounded-2xl border border-slate-700/50 bg-slate-900/35 p-3">
                      <CareerAlignmentProgress showProgressSection={false} />
                    </section>
                  ) : null}
                </div>

              <AdvancedInsightsCard
                scoreBreakdown={scoreBreakdown}
                showScoreDrivers={showScoreDrivers}
                renderDriverGrid={renderDriverGrid}
              />
            </div>
          )}
        </section>

        {error && latest ? (
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






