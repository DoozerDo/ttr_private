"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ArtifactFailureState } from "@/components/ArtifactFailureState";
import { DocumentStrategyPlanSummary } from "@/components/DocumentStrategyPlanSummary";
import { GuidedOverlay } from "@/components/GuidedOverlay";
import { type ComplianceFlag } from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { RouteStateShell } from "@/components/RouteStateShell";
import { PageShell } from "@/components/PageShell";
import { VerifiedGenerationTrustSummary } from "@/components/VerifiedGenerationTrustSummary";
import { StudioNextMove } from "@/components/StudioNextMove";
import { defaultClosingTemplateKey } from "@/lib/coverLetters";
import { validateCoverLetterQuality, validateResumeQuality } from "@/src/lib/studio/artifactQuality";
import { buildExportPayload } from "../lib/exportPayload";
import { formatErrorMessage, readResponsePayload } from "@/lib/compliance/parseComplianceError";
import { sanitizeRenderedTextValue } from "@/lib/renderedText";
import { resolveWorkflowOrchestrator, resolveWorkflowUnlockContext } from "@/lib/workflowOrchestrator";
import { WorkflowAuthorityPanel } from "@/components/workflow/WorkflowAuthorityPanel";
import { WorkflowActivityBanner } from "@/components/workflow/WorkflowActivityBanner";
import { useWorkflowActivityTracker } from "@/lib/workflowActivityTracker";
import { useWorkflowGuardrails } from "@/lib/workflowGuardrails";
import type { PostUnlockReadiness } from "@/lib/postUnlockOutcomeModel";
import {
  applyTargetingExclusionsToReadiness,
  aggregateVerificationIssues,
  buildVerificationIssuesFromCanonicalClaims,
  combinePairGenerationReadinessFromTransport,
  filterClaimVerificationsByExcludedLabels,
  reconcileReadinessWithClaimVerifications,
  type ArtifactReadinessContractState,
  type GenerationReadiness,
  deriveVerificationCoverage,
  normalizeUserFacingRequirementLabel,
} from "@/lib/generationReadiness";
import {
  buildArtifactQualityModel,
  deriveArtifactConfidenceTransition,
  type ArtifactClaimRef,
  type ArtifactQualityModel,
} from "@/lib/artifactConfidence";
import { normalizeClaimVerifications } from "@/lib/claimVerification";
import { parseTierGateError, SubscriptionTier, type TierGateError } from "@/lib/tiers";
import { isDraftAnywayEligible, resolveStudioArtifactGating } from "@/lib/studioArtifactGating";
import { resolveWorkflowAuthority } from "@/lib/resolveWorkflowAuthority";
import { resolveResultsStudioRedirect } from "@/lib/resolveResultsStudioRedirect";
import { resolvePairWorkflowState, type PairWorkflowArtifactStatus } from "@/lib/pairWorkflowState";
import { resolvePairGenerationLifecycle } from "@/lib/pairGenerationLifecycle";
import {
  acquireStudioArtifactSingleFlight,
  isStudioArtifactSingleFlightInFlight,
  releaseStudioArtifactSingleFlight,
  type StudioArtifactType,
} from "@/lib/studioArtifactSingleFlight";
import { BaselineDto, BaselineVersionDto, listBaselines } from "@/lib/baselines";
import { appendStrengtheningAddition } from "@/lib/baselines";
import { buildEvidenceSuggestion } from "@/lib/evidenceSuggestions";
import {
  buildDocumentStrategyPlan,
  type RefinementPreset,
  type RefinementTarget,
  resolveRefinementTargets,
} from "@/lib/documentStrategyPlan";
import {
  buildDocumentCritique,
  type DocumentCritique,
  type DocumentCritiqueIssue,
} from "@/lib/documentCritique";
import {
  buildRoleMatchFinalPass,
  resolveRoleMatchFinalAdjustmentPreset,
  type RoleMatchFinalAdjustment,
  type RoleMatchFinalPass,
} from "@/lib/roleMatchFinalPass";
import {
  buildLanguageStylePass,
} from "@/lib/languageStylePass";
import { fetchLatestAssessmentForBaseline } from "@/lib/assessmentSource";
import { getGenerationCompletionStorageKey } from "@/lib/nextAction";
import { buildProductDecisionState } from "@/lib/productDecisionState";
import { 
  resolveDocumentGenerationMode, 
  shouldGenerateDocuments, 
} from "@/lib/documentGenerationContract"; 
import { isGenerateNowEligible } from "@/lib/documentGenerationGate";
import { deriveEvidenceLedger } from "@/lib/evidenceLedger";
import { logDecisionFlowEvent } from "@/lib/decisionFlowDebug";
import {
  buildWorkflowRequestKey,
  isWorkflowRequestStale,
  logWorkflowRequestEvent,
  type WorkflowRequestScope,
} from "@/lib/workflowRequestGuard";
import { useGuidedMode } from "@/hooks/useGuidedMode";
import { type JobDto } from "@/lib/jobs";
import { getFitReviewHref, getStudioHref } from "@/src/navigation/routes";
import { UnlockPanel } from "./_components/UnlockPanel";
import { PostUnlockOutcomeShell } from "./_components/PostUnlockOutcomeShell";
import { GenerationReadyShell, type GenerationReadyShellFailure } from "./_components/GenerationReadyShell";
import {
  buildCoverLetterParagraphs,
  copyTextToClipboard,
  readArtifactFailurePresentation,
  collectNormalizedContextValues,
  createDocumentState,
  downloadBlob,
  extractComplianceWarnings,
  formatPreview,
  getFilenameFromContentDisposition,
  normalizeAuditId,
  presentCoverLetterGeneration,
  presentResumeGeneration,
  readDuplicateCoverLetterId,
  readTrackerField,
  trimToString,
  type StudioCardStatus,
  type StudioArtifactFailurePresentation,
  type ResumeFocusOption,
} from "@/src/lib/studio/helpers";
import { resolveStudioNextMove } from "@/src/lib/studio/nextMove";
import {
  evaluateStudioTrustGate,
  generateWithRetry,
  hasBlockingComplianceViolations,
  normalizeGenerationPayload,
  validateCoverLetterOutput,
  validateResumeOutput,
} from "@/lib/studioTrustGate";
import { buildStudioPageTruth } from "@/lib/studioPageTruth";
import { BaselineBlockPolicyPanel } from "./BaselineBlockPolicyPanel";
import { estimateResumeModelBodyLength, readResumeModel, ResumePreview } from "./ResumePreview";
import { StudioFocusPanel, type FocusAction } from "./StudioFocusPanel";
import { devLogArtifactRendererSelection } from "@/lib/artifactRendererDebug";
import { truncateForPreview } from "@/lib/previewTruncation";
import type { ResumeModel } from "@/lib/resumeModel";
import { buildStudioArtifactContract } from "@/src/lib/studio/artifactContract";
import { StudioArtifactQualityPanel } from "./StudioArtifactQualityPanel";
import { StudioCritiquePanel } from "./StudioCritiquePanel";
import { StudioRoleMatchPanel } from "./StudioRoleMatchPanel";
import { StudioRefinementPanel } from "./StudioRefinementPanel";
import { listJobs } from "@/lib/jobsClient";
import { useEntitlements } from "@/src/lib/entitlements";
import { trackEvent } from "@/src/lib/analytics";
import {
  readRecentIntentState,
  recordArtifactRefineIntent,
  recordArtifactUsedIntent,
  recordOpportunityCommitIntent,
  type RecentIntentState,
} from "@/src/lib/recentIntent";
import { getScoreBand, ScoreBand } from "@/src/lib/score-band";

function LockIcon(props: { className?: string; "aria-hidden"?: boolean }) {
  const className = props.className ?? "h-5 w-5";
  return (
    <svg
      aria-hidden={props["aria-hidden"] ?? true}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 11V8.5C7 5.462 9.462 3 12.5 3C15.538 3 18 5.462 18 8.5V11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 11H18.5C19.328 11 20 11.672 20 12.5V19.5C20 20.328 19.328 21 18.5 21H6.5C5.672 21 5 20.328 5 19.5V12.5C5 11.672 5.672 11 6.5 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 15V17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Job = Awaited<ReturnType<typeof listJobs>>[number];

type LatestAnalysis = {
  id?: string | null;
  assessmentId?: string | null;
  jobId?: string | null;
  score?: number | string | null;
  overallScore?: number | string | null;
  verdict?: string | null;
  summary?: string | null;
  strengths?: string[] | null;
  gaps?: string[] | null;
  recommendedActions?: string[] | null;
  baselineId?: string;
  baselineVersionId?: string;
  supportingSignals?: unknown;
  baselineEvidence?: unknown;
  company?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  title?: string | null;
  scoring_v2?: {
    score?: number | null;
    debug?: {
      toolingCoverage?: {
        claims?: unknown;
      };
    };
  } | null;
  scoringV2?: {
    debug?: {
      toolingCoverage?: {
        claims?: unknown;
      };
    };
  } | null;
  verification_coverage?: {
    totalClaims?: number | null;
    verifiedClaims?: number | null;
    inferredClaims?: number | null;
    unverifiedClaims?: number | null;
    verifiedRequirements?: string[] | null;
    inferredRequirements?: string[] | null;
    supportedRequirements?: string[] | null;
    unverifiedRequirements?: string[] | null;
  } | null;
};

type ApplicationInsight = {
  message?: string;
  type?: "warning" | "success" | "gap" | string;
};

type StudioApplicationArtifactRecord = {
  resumeArtifactId: string;
  type: "resume" | "cover";
  createdAt: string;
  exportFormat?: string | null;
};

type StoredStudioArtifactSnapshot = {
  resumeResponse?: unknown;
  coverResponse?: unknown;
  updatedAt?: string;
};

type BackendStudioArtifactRecord = {
  artifactType?: "resume" | "cover_letter";
  status?: string;
  inputsHash?: string | null;
  responseBody?: unknown;
  content?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type BackendStudioArtifactsResponse = {
  status?: string;
  baselineId?: string;
  jobId?: string;
  baselineVersionId?: string | null;
  baselineVersionHash?: string | null;
  jobFingerprint?: string | null;
  generationContractVersion?: string | null;
  resume?: BackendStudioArtifactRecord | null;
  coverLetter?: BackendStudioArtifactRecord | null;
  resumeResult?: unknown;
  coverLetterResult?: unknown;
};

const ANALYSIS_LOAD_ERROR_MESSAGE =
  "Unable to load role analysis. Please return to Results and reopen the document generator.";
const GENERATION_TRUST_FALLBACK_ERROR =
  "We couldn't generate a clean document for this role yet. Try improving your baseline or adjusting the job description.";

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
  summary: "Fit score and generation readiness are resolved upstream before Studio opens.",
  verificationIssues: [],
};

type DocumentState = {
  response: unknown | null;
  error: string | null;
  tierGateError: TierGateError | null;
  artifactFailure: StudioArtifactFailurePresentation | null;
};

type CoverLetterJobContextPayload = {
  allowedCompanies?: string[];
  allowedRoleTitles?: string[];
};

type CoverLetterPayload = {
  jobId?: string;
  baselineId?: string;
  baselineVersionId?: string;
  analysisId?: string;
  closingTemplateKey?: string;
  oneTap?: boolean;
  documentType: "cover_letter";
  jobContext?: CoverLetterJobContextPayload;
  [key: string]: unknown;
};

type CoverLetterComplianceFlag = {
  code?: string;
  message?: string;
  severity?: string;
  confidence?: number;
};

type CoverLetterComplianceBlocked = {
  title: string;
  body: string;
  reasons: string[];
  cta?: {
    label: string;
    href: string;
  };
};

const complianceFlagLabelMap: Record<string, string> = {
  invented_company: "Company name needs support",
  invented_role: "Role or title needs support",
  invented_metric: "Metric needs support",
  invented_scope: "Scope statement needs support",
  missing_baseline_support: "Statement needs support",
};

function mapComplianceFlagLabel(code?: string): string {
  const normalized = sanitizeRenderedTextValue(code ?? "", {
    endpoint: "studio-page",
    field: "complianceFlag.code",
  }).toLowerCase();
  if (!normalized) {
    return "Statement needs support";
  }
  return complianceFlagLabelMap[normalized] ?? "Statement needs support";
}

function normalizeComplianceFlagEntry(value: unknown): CoverLetterComplianceFlag | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const code = typeof record.code === "string"
    ? sanitizeRenderedTextValue(record.code, {
        endpoint: "studio-page",
        field: "complianceFlag.code",
      })
    : undefined;
  const message = typeof record.message === "string"
    ? sanitizeRenderedTextValue(record.message, {
        endpoint: "studio-page",
        field: "complianceFlag.message",
      })
    : undefined;
  const severity =
    typeof record.severity === "string"
      ? sanitizeRenderedTextValue(record.severity, {
          endpoint: "studio-page",
          field: "complianceFlag.severity",
        }).toLowerCase()
      : undefined;
  const confidence =
    typeof record.confidence === "number"
      ? record.confidence
      : typeof record.confidence === "string"
      ? Number(record.confidence)
      : undefined;
  return { code, message, severity, confidence };
}

function parseComplianceBlockedFromPayload(payload: unknown): CoverLetterComplianceBlocked | null {
  if (payload && typeof payload === "object") {
    const presented = presentCoverLetterGeneration(payload);
    if (presented.status === "blocked" && presented.display) {
      return {
        title: presented.display.title,
        body: presented.display.description,
        reasons: presented.display.reasons,
        cta: presented.display.cta,
      };
    }
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (!error || typeof error !== "object") {
    return null;
  }
  const errorRecord = error as Record<string, unknown>;
  const errorCode = trimToString(errorRecord.code);
  if (errorCode === "generation_blocked") {
    const details =
      (errorRecord.details as Record<string, unknown> | undefined) ??
      (record.details as Record<string, unknown> | undefined);
    const rawBlockers = Array.isArray(record.blockers)
      ? record.blockers
      : Array.isArray(details?.blockers)
      ? details.blockers
      : [];
    const reasons = rawBlockers
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const candidate = entry as Record<string, unknown>;
        return trimToString(candidate.message) || trimToString(candidate.code);
      })
      .filter((value) => value.length > 0)
      .slice(0, 3);
    return {
      title: "Generation blocked",
      body:
        trimToString(errorRecord.message) ||
        "Generation is not available for this role due to insufficient verified evidence.",
      reasons,
      cta: {
        label: "Resolve gaps in Results",
        href: "/results",
      },
    };
  }
  if (errorCode !== "COMPLIANCE_VIOLATION") {
    return null;
  }
  const details = errorRecord.details;
  if (!details || typeof details !== "object") {
    return null;
  }
  const detailRecord = details as Record<string, unknown>;
  const rawFlags = Array.isArray(detailRecord.compliance_flags)
    ? detailRecord.compliance_flags
    : Array.isArray(detailRecord.complianceFlags)
    ? detailRecord.complianceFlags
    : [];
  const flags = rawFlags
    .map(normalizeComplianceFlagEntry)
    .filter((flag): flag is CoverLetterComplianceFlag => Boolean(flag))
    .filter((flag) => !flag.severity || flag.severity === "block")
    .map((flag) => ({
      label: mapComplianceFlagLabel(flag.code),
      message: flag.message,
    }));
  const reasons = flags
    .map((flag) => trimToString(flag.message) || flag.label)
    .filter((reason) => reason.length > 0);
  if (!reasons.length) {
    return null;
  }
  return {
    title: "Draft needs verification",
    body: "Some content is not supported by your verified resume yet.",
    reasons,
    cta: {
      label: "Review compliance in Results",
      href: "/results",
    },
  };
}

function isHtmlLikePayload(payload: unknown): boolean {
  if (typeof payload !== "string") return false;
  const normalized = sanitizeRenderedTextValue(payload, {
    endpoint: "studio-page",
    field: "htmlLikePayload",
  }).toLowerCase();
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<body") ||
    normalized.includes("<head")
  );
}

function sanitizeAnalysisError(payload: unknown, fallback = ANALYSIS_LOAD_ERROR_MESSAGE) {
  if (isHtmlLikePayload(payload)) return fallback;
  const message = formatErrorMessage(payload, fallback);
  if (isHtmlLikePayload(message)) return fallback;
  return message;
}

function toConstraintMessage(message: string | null): string {
  if (!message) return "Generation is currently constrained for this role.";
  return message
    .replace(/failed/gi, "limited")
    .replace(/error/gi, "constraint")
    .replace(/validation/gi, "verification")
    .replace(/system/gi, "readiness")
    .replace(/prerequisites/gi, "requirements");
}

function isInsufficientBaselineEvidenceMessage(message: string | null): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no verified baseline evidence could be assembled") ||
    normalized.includes("no valid evidence units")
  );
}

function getStudioArtifactStorageKey(jobId?: string | null, baselineId?: string | null): string | null {
  const safeJobId = trimString(jobId);
  const safeBaselineId = trimString(baselineId);
  if (!safeJobId || !safeBaselineId) return null;
  return `ttr:studio-artifacts:${safeJobId}:${safeBaselineId}`;
}

function readStoredStudioArtifacts(key: string): StoredStudioArtifactSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredStudioArtifactSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredStudioArtifacts(key: string, snapshot: StoredStudioArtifactSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Best effort only.
  }
}

function normalizeHydratedArtifactResponse(value: unknown): unknown | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Some backends store response bodies as JSON strings. Studio expects objects.
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return value;
      }
    }
    return value;
  }
  return value;
}

function getBackendArtifactStatus(record: BackendStudioArtifactRecord | null | undefined) {
  const status = trimString(record?.status).toLowerCase();
  if (status === "completed") {
    // Some upstream records report `completed` even when no response body is available.
    // Studio can only treat an artifact as completed when the payload needed to render it exists.
    const responseBody = (record as unknown as { responseBody?: unknown } | null)?.responseBody;
    return responseBody == null ? ("missing" as const) : ("completed" as const);
  }
  if (status === "in_progress") return "in_progress" as const;
  if (status === "failed") return "failed" as const;
  return "missing" as const;
}

function getBackendPairStatus(payload: BackendStudioArtifactsResponse | null | undefined) {
  const resumeStatus = getBackendArtifactStatus(payload?.resume);
  const coverStatus = getBackendArtifactStatus(payload?.coverLetter);
  // Prioritize active generation above completed artifacts so Studio can render a coherent
  // "generation in progress" authority even when one artifact is already available.
  if (resumeStatus === "in_progress" || coverStatus === "in_progress") return "in_progress" as const;
  if (resumeStatus === "failed" || coverStatus === "failed") return "failed" as const;
  if (resumeStatus === "completed" || coverStatus === "completed") return "completed" as const;
  return "missing" as const;
}

function isBackendStudioArtifactsResponse(
  payload: BackendStudioArtifactsResponse | StoredStudioArtifactSnapshot,
): payload is BackendStudioArtifactsResponse {
  return "resume" in payload || "coverLetter" in payload;
}

function buildFailureFromBackendRecord(
  artifactType: "resume" | "cover_letter",
  record: BackendStudioArtifactRecord | null | undefined,
): StudioArtifactFailurePresentation | null {
  if (!record) return null;
  const status = getBackendArtifactStatus(record);
  if (status !== "failed") return null;
  const message =
    trimString(record.failureMessage) ||
    "The draft could not be completed from the current inputs.";
  return {
    artifactType,
    headline: artifactType === "resume" ? "Resume generation did not complete" : "Cover letter generation did not complete",
    explanation: message,
    nextStep: "Retry generation from the current verified inputs.",
    retryable: true,
    category: "generation_failed",
    code: trimString(record.failureCode) || "generation_failed",
    detail: trimString(record.failureMessage) || undefined,
  };
}

function buildAssessmentAnalysisUrl(analysisId: string) {
  const normalizedAnalysisId = trimId(analysisId);
  if (!normalizedAnalysisId) return "";
  return `/api/analysis/fit-assessments/${encodeURIComponent(normalizedAnalysisId)}`;
}

function trimString(value: unknown): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  if (!raw.trim()) return "";
  const sanitized = sanitizeRenderedTextValue(raw, {
    endpoint: "studio-page",
    field: "value",
  });
  return sanitized === "We couldn’t display this result. Please retry." ? "" : sanitized;
}

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeClaimText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractJobDescription(job: JobDto | null): string | null {
  if (!job) return null;

  if (typeof job.rawDescription === "string" && job.rawDescription.trim()) {
    return sanitizeRenderedTextValue(job.rawDescription, {
      endpoint: "studio-page",
      field: "job.rawDescription",
    });
  }

  if (typeof job.description === "string" && job.description.trim()) {
    return sanitizeRenderedTextValue(job.description, {
      endpoint: "studio-page",
      field: "job.description",
    });
  }

  return null;
}

function collectEvidenceItems(analysis: LatestAnalysis | null): string[] {
  if (!analysis) return [];
  const candidates: string[] = [];
  const supportingSignals = analysis.supportingSignals;
  if (Array.isArray(supportingSignals)) {
    for (const signal of supportingSignals) {
      if (typeof signal === "string" && signal.trim()) {
        candidates.push(
          sanitizeRenderedTextValue(signal, {
            endpoint: "studio-page",
            field: "analysis.supportingSignals",
          }),
        );
      } else if (signal && typeof signal === "object") {
        const label = trimString((signal as { label?: unknown }).label);
        const name = trimString((signal as { name?: unknown }).name);
        if (label) candidates.push(label);
        else if (name) candidates.push(name);
      }
    }
  }

  const baselineEvidence = analysis.baselineEvidence;
  if (Array.isArray(baselineEvidence)) {
    for (const entry of baselineEvidence) {
      if (typeof entry === "string" && entry.trim()) {
        candidates.push(
          sanitizeRenderedTextValue(entry, {
            endpoint: "studio-page",
            field: "analysis.baselineEvidence",
          }),
        );
      } else if (entry && typeof entry === "object") {
        const text = trimString((entry as { text?: unknown }).text);
        const title = trimString((entry as { title?: unknown }).title);
        if (text) candidates.push(text);
        else if (title) candidates.push(title);
      }
    }
  }
  return Array.from(new Set(candidates)).slice(0, 5);
}

function formatVerificationIssueSource(
  source: "resume_generation" | "cover_letter_generation" | "targeting_context",
) {
  if (source === "resume_generation") return "Resume generation";
  if (source === "cover_letter_generation") return "Cover letter generation";
  return "Targeting context";
}

type VerificationIssueAction = {
  href?: string;
  label: string;
  action: "remove_from_targeting" | "link";
};

function resolveVerificationIssueAction(issue: GenerationReadiness["verificationIssues"][number]): VerificationIssueAction {
  if (issue.code === "missing_baseline_evidence") {
    const claim = sanitizeRenderedTextValue(issue.claim ?? "", {
      endpoint: "studio-page",
      field: "verificationIssue.claim",
    });
    const params = new URLSearchParams({ source: "studio" });
    if (claim) {
      params.set("highlightClaim", claim);
    }
    return {
      label: "Review baseline evidence",
      href: `/baseline?${params.toString()}`,
      action: "link",
    };
  }
  if (issue.code === "unsupported_technology_claim") {
    return {
      label: "Remove from targeting",
      action: "remove_from_targeting",
    };
  }
  if (issue.code === "generation_overreach") {
    return {
      label: "Regenerate with stricter alignment",
      href: "/results#advanced-insights",
      action: "link",
    };
  }
  if (issue.code === "role_targeting_emphasis_exceeds_support") {
    return {
      label: "Exclude from generation targeting",
      action: "remove_from_targeting",
    };
  }
  return {
    label: "Review verification details",
    href: "/results#advanced-insights",
    action: "link",
  };
}

export default function StudioPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isNonProduction = process.env.NODE_ENV !== "production";
  const readCanonicalResumePreviewPayload = (value: unknown): unknown | null => {
    if (!value || typeof value !== "object") return null;
    const preview = (value as Record<string, unknown>).preview;
    if (!preview || typeof preview !== "object") return null;
    const resume = (preview as Record<string, unknown>).resume;
    if (!resume || typeof resume !== "object") return null;
    return resume;
  };
  const { isGuidedActive, currentStep: guidedStep, advanceStep, completeGuidedMode } = useGuidedMode();
  const searchParams = useSearchParams();
  const searchParamValue = searchParams.toString();
  const unlockContext = useMemo(
    () => resolveWorkflowUnlockContext({ toString: () => searchParamValue }),
    [searchParamValue],
  );
  const {
    snapshot: workflowActivity,
    run: runWorkflowActivity,
    start: startWorkflowActivity,
    stop: stopWorkflowActivity,
    isOperationActive: isWorkflowOperationActive,
  } = useWorkflowActivityTracker({ surface: "studio", trackEvent });
  const [unlockFlowDismissed, setUnlockFlowDismissed] = useState(false);
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const [unlockSubmitError, setUnlockSubmitError] = useState<string | null>(null);
  const [unlockReanalysisFailure, setUnlockReanalysisFailure] = useState<{
    priorScore: number | null;
    priorReadiness: PostUnlockReadiness | null;
    message: string;
  } | null>(null);
  const unlockFlowActive =
    unlockContext.isUnlockFlow && unlockContext.missingEvidence.length > 0 && !unlockFlowDismissed;
  const unlockFlowTrackedRef = useRef(false);

  const postUnlockParams = useMemo(() => {
    const params = new URLSearchParams(searchParamValue);
    const postUnlock = (params.get("postUnlock") ?? "").trim();
    const priorScoreRaw = (params.get("priorScore") ?? "").trim();
    const priorReadinessRaw = (params.get("priorReadiness") ?? "").trim().toLowerCase();
    const priorScore = priorScoreRaw ? Number(priorScoreRaw) : null;
    const normalizedScore = Number.isFinite(priorScore as number) ? (priorScore as number) : null;
    const priorReadiness: PostUnlockReadiness | null =
      priorReadinessRaw === "ready" || priorReadinessRaw === "limited" || priorReadinessRaw === "blocked"
        ? (priorReadinessRaw as PostUnlockReadiness)
        : null;
    return {
      active: postUnlock === "1" || postUnlock === "true",
      priorScore: normalizedScore,
      priorReadiness,
    };
  }, [searchParamValue]);
  const [postUnlockDismissed, setPostUnlockDismissed] = useState(false);
  const postUnlockActive = postUnlockParams.active && !postUnlockDismissed;
  const postUnlockTrackedRef = useRef(false);
  const [postUnlockRetrying, setPostUnlockRetrying] = useState(false);
  const [postUnlockRetryError, setPostUnlockRetryError] = useState<string | null>(null);
  const [generationReadyDismissed, setGenerationReadyDismissed] = useState(false);
  const [generationReadyPhase, setGenerationReadyPhase] = useState<"ready" | "generating" | "failed">("ready");
  const [generationReadyFailure, setGenerationReadyFailure] = useState<GenerationReadyShellFailure | null>(null);
  const generationReadyTrackedRef = useRef(false);
  const trackedStudioOpenRef = useRef(false);
  const lastReadinessKeyRef = useRef<string | null>(null);
  const studioDecisionLogKeyRef = useRef<string | null>(null);
  const failedReadinessKeysRef = useRef<Set<string>>(new Set());
  const generationSectionRef = useRef<HTMLElement | null>(null);
  const draftAnywayRequestedRef = useRef(false);
  const invalidGeneratedStateLoggedRef = useRef<string | null>(null);
  const [draftAnywayRequested, setDraftAnywayRequested] = useState(false);
  const requestedJobId = useMemo(
    () => trimId(searchParams.get("jobId")),
    [searchParamValue],
  );
  const requestedBaselineId = useMemo(
    () => trimId(searchParams.get("baselineId")),
    [searchParamValue],
  );
  const requestedBaselineVersionId = useMemo(
    () => trimId(searchParams.get("baselineVersionId")),
    [searchParamValue],
  );
  const requestedAnalysisId = useMemo(
    () => trimId(searchParams.get("analysisId") ?? searchParams.get("assessmentId")),
    [searchParamValue],
  );
  const stableAnalysisIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (requestedAnalysisId) stableAnalysisIdRef.current = requestedAnalysisId;
  }, [requestedAnalysisId]);
  const effectiveRequestedAnalysisId = requestedAnalysisId ?? stableAnalysisIdRef.current;
  const isFromUnlock = useMemo(() => searchParams.get("fromUnlock") === "true", [searchParamValue]);
  const studioIntent = useMemo(() => trimString(searchParams.get("intent")).toLowerCase(), [searchParamValue]);
  const hasGenerateIntent = studioIntent === "generate";
  const generationIntentHandledRef = useRef(false);
  const verifiedClaimParams = useMemo(
    () => {
      const rawClaims =
          typeof searchParams.getAll === "function"
          ? searchParams.getAll("verifiedClaim")
          : [searchParams.get("verifiedClaim")].filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0,
            );
      return Array.from(
        new Set(
          rawClaims
            .map((claim) => trimString(claim))
            .filter((claim) => claim.length > 0),
        ),
      );
    },
    [searchParamValue],
  );
  const baselineIdFromQuery = useMemo(() => trimId(searchParams.get("baselineId")) || undefined, [searchParamValue]);
  const entrySource = useMemo<"results" | "nav" | "direct" | "unknown">(() => {
    const explicitEntry = trimString(searchParams.get("entrySource")).toLowerCase();
    const allowed = new Set(["results", "nav", "direct", "unknown"]);

    if (allowed.has(explicitEntry)) {
      return explicitEntry as "results" | "nav" | "direct" | "unknown";
    }

    // This component is server-rendered (and hydrated) despite being a client component,
    // so avoid direct `document` access which can throw under SSR.
    const referrer: string =
      typeof globalThis !== "undefined" &&
      typeof (globalThis as unknown as { document?: { referrer?: unknown } }).document?.referrer === "string"
        ? String((globalThis as unknown as { document: { referrer: string } }).document.referrer)
        : "";

    if (!referrer) return "direct";

    const origin: string =
      typeof globalThis !== "undefined" &&
      typeof (globalThis as unknown as { location?: { origin?: unknown } }).location?.origin === "string"
        ? String((globalThis as unknown as { location: { origin: string } }).location.origin)
        : "";

    try {
      const referrerUrl = new URL(referrer);
      if (origin && referrerUrl.origin === origin && referrerUrl.pathname === "/results") {
        return "results";
      }
    } catch {
      // ignore
    }

    return "unknown";
  }, [searchParamValue]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!isFromUnlock) return;
    if (!unlockContext.isUnlockFlow) {
      console.warn("[studio unlock] fromUnlock=true but unlockDimension missing/invalid", {
        fromUnlock: true,
        unlockDimension: unlockContext.dimension,
        evidenceCount: unlockContext.missingEvidence.length,
      });
      return;
    }
    if (unlockContext.isUnlockFlow && unlockContext.missingEvidence.length === 0) {
      console.warn("[studio unlock] unlock flow missing evidence items", {
        unlockDimension: unlockContext.dimension,
      });
    }
  }, [isFromUnlock, unlockContext.dimension, unlockContext.isUnlockFlow, unlockContext.missingEvidence.length]);
  useEffect(() => {
    if (!unlockFlowActive) return;
    if (unlockFlowTrackedRef.current) return;
    unlockFlowTrackedRef.current = true;
    trackEvent("unlock_flow_entered", {
      source: "studio",
      baselineId: requestedBaselineId ?? null,
      jobId: requestedJobId ?? null,
      dimension: unlockContext.dimension,
      evidence_count: unlockContext.missingEvidence.length,
    });
  }, [requestedBaselineId, requestedJobId, unlockContext.dimension, unlockContext.missingEvidence.length, unlockFlowActive]);
  useEffect(() => {
    if (trackedStudioOpenRef.current) {
      return;
    }
    trackedStudioOpenRef.current = true;

    trackEvent("resume_studio_opened", {
      entrySource,
      baselineId: baselineIdFromQuery,
    });
  }, [baselineIdFromQuery, entrySource]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(false);
  const [baselinesError, setBaselinesError] = useState<string | null>(null);
  const [baselineDetail, setBaselineDetail] = useState<BaselineDto | null>(null);

  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [selectedBaselineVersionId, setSelectedBaselineVersionId] = useState("");
  const [baselineTouched, setBaselineTouched] = useState(false);
  const [versionTouched, setVersionTouched] = useState(false);
  const [versionRefreshSignal, setVersionRefreshSignal] = useState(0);

  const baselineTouchedRef = useRef(baselineTouched);
  useEffect(() => {
    baselineTouchedRef.current = baselineTouched;
  }, [baselineTouched]);

  const versionTouchedRef = useRef(versionTouched);
  const pendingVersionSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    versionTouchedRef.current = versionTouched;
  }, [versionTouched]);

  const [versions, setVersions] = useState<BaselineVersionDto[]>([]);
  const [, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<LatestAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [contextHydrationMessage, setContextHydrationMessage] = useState<string | null>(null);
  const [generationReadiness, setGenerationReadiness] =
    useState<GenerationReadiness>(READINESS_LOADING_STATE);
  const [pairReadinessContractState, setPairReadinessContractState] = useState<{
    resume: ArtifactReadinessContractState;
    cover: ArtifactReadinessContractState;
  }>({ resume: "unknown", cover: "unknown" });
  const [excludedTargetingLabels, setExcludedTargetingLabels] = useState<Set<string>>(new Set());
  const [targetingAdjustmentFeedback, setTargetingAdjustmentFeedback] = useState<string | null>(null);
  const [targetingAdjustmentStatus, setTargetingAdjustmentStatus] = useState<"success" | "warning" | null>(null);
  const [lastRemovedTargetingLabels, setLastRemovedTargetingLabels] = useState<string[]>([]);
  const [appliedExclusionsFromResults, setAppliedExclusionsFromResults] = useState(false);
  const [expandingRequirement, setExpandingRequirement] = useState<string | null>(null);
  const [expansionContext, setExpansionContext] = useState("");
  const [expansionDescription, setExpansionDescription] = useState("");
  const [expansionImpact, setExpansionImpact] = useState("");
  const [expansionConfirmedAccurate, setExpansionConfirmedAccurate] = useState(false);
  const [expansionSubmitting, setExpansionSubmitting] = useState(false);
  const [expansionError, setExpansionError] = useState<string | null>(null);
  const [expansionSuccessByRequirement, setExpansionSuccessByRequirement] = useState<Record<string, string>>({});
  const [dismissedSuggestionRequirements, setDismissedSuggestionRequirements] = useState<Set<string>>(new Set());
  const queryExcludedRequirements = useMemo(
    () =>
      (
        typeof searchParams?.getAll === "function"
          ? searchParams.getAll("excludedRequirements")
          : (() => {
              const single = searchParams?.get("excludedRequirements");
              return single ? [single] : [];
            })()
      )
        .map((requirement) =>
          normalizeUserFacingRequirementLabel(requirement, {
            sourceContext: null,
            issueCode: "unsupported_technology_claim",
          }),
        )
        .filter((label): label is string => typeof label === "string" && label.length > 0)
        .map((label) => label.toLowerCase()),
    [searchParams],
  );
  useEffect(() => {
    if (!queryExcludedRequirements.length) {
      setAppliedExclusionsFromResults(false);
      return;
    }
    setExcludedTargetingLabels((current) => {
      const next = new Set(current);
      queryExcludedRequirements.forEach((label) => next.add(label));
      return next;
    });
    setLastRemovedTargetingLabels(
      Array.from(
        new Set(
          queryExcludedRequirements.map((label) =>
            normalizeUserFacingRequirementLabel(label, {
              sourceContext: null,
              issueCode: "unsupported_technology_claim",
            }) ?? label,
          ),
        ),
      ),
    );
    setAppliedExclusionsFromResults(true);
  }, [queryExcludedRequirements]);

  const [resumeState, setResumeState] = useState<DocumentState>(() => createDocumentState());
  const [resumeGenerating, setResumeGenerating] = useState(false);
  const [autoGenerationInFlight, setAutoGenerationInFlight] = useState(false);
  const [resumeExportFormat, setResumeExportFormat] =
    useState<"docx" | "pdf" | null>(null);
  const [resumeCopyStatus, setResumeCopyStatus] = useState<string | null>(null);
  const [recentIntent, setRecentIntent] = useState<RecentIntentState>(() => readRecentIntentState());
  const [resumeWarningFlags, setResumeWarningFlags] = useState<ComplianceFlag[]>([]);
  const [, setResumeAuditId] = useState<string | undefined>();
  const [resumeFocus, setResumeFocus] = useState<ResumeFocusOption>("Auto (recommended)");
  const [savedEditedResumeModel, setSavedEditedResumeModel] = useState<ResumeModel | null>(null);
  const [draftResumeModel, setDraftResumeModel] = useState<ResumeModel | null>(null);
  const [isResumeEditMode, setIsResumeEditMode] = useState(false);
  const [resumeEditError, setResumeEditError] = useState<string | null>(null);

  const [coverState, setCoverState] = useState<DocumentState>(() => createDocumentState());
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverExportFormat, setCoverExportFormat] = useState<"docx" | "pdf" | null>(null);
  const [coverCopyStatus, setCoverCopyStatus] = useState<string | null>(null);
  const [coverWarningFlags, setCoverWarningFlags] = useState<ComplianceFlag[]>([]);
  const [, setCoverAuditId] = useState<string | undefined>();
  const [coverLetterComplianceBlocked, setCoverLetterComplianceBlocked] =
    useState<CoverLetterComplianceBlocked | null>(null);

  const resumeStateSnapshotRef = useRef(resumeState);
  resumeStateSnapshotRef.current = resumeState;
  const coverStateSnapshotRef = useRef(coverState);
  coverStateSnapshotRef.current = coverState;

  const [refinementInstructions, setRefinementInstructions] = useState<RefinementPreset[]>([]);
  const [refinementApplying, setRefinementApplying] = useState(false);
  const [refinementStatusMessage, setRefinementStatusMessage] = useState<string | null>(null);
  const [pendingRefinementAction, setPendingRefinementAction] = useState<{
    action: "apply" | "undo" | "reset";
    instruction?: RefinementPreset | null;
    targets: RefinementTarget[];
    summary: string;
  } | null>(null);
  const [studioArtifactsHydrated, setStudioArtifactsHydrated] = useState(false);
  const [studioArtifactPairStatus, setStudioArtifactPairStatus] = useState<
    "missing" | "in_progress" | "failed" | "completed"
  >("missing");
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);
  const [unlockGenerationConfirmation, setUnlockGenerationConfirmation] = useState<string | null>(
    null,
  );
  const [verifiedClaimTexts, setVerifiedClaimTexts] = useState<string[]>([]);
  const [dismissedClaimTexts, setDismissedClaimTexts] = useState<string[]>([]);
  const [claimEditDraft, setClaimEditDraft] = useState<ArtifactClaimRef | null>(null);
  const [claimEditText, setClaimEditText] = useState("");
  const [confidenceUpgradeMessage, setConfidenceUpgradeMessage] = useState<string | null>(null);
  const processedVerificationRef = useRef<string | null>(null);
  const confidencePanelTrackedRef = useRef<string | null>(null);
  const previousArtifactQualityRef = useRef<ArtifactQualityModel | null>(null);
  const critiquePanelTrackedRef = useRef<string | null>(null);
  const previousCritiqueSignatureRef = useRef<string | null>(null);
  const previousCritiqueIssuesRef = useRef<DocumentCritiqueIssue[]>([]);

  const scrollToStudioTop = useCallback((behavior: ScrollBehavior) => {
    if (typeof window === "undefined") return;
    if (typeof window.scrollTo !== "function") return;
    const isJsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent ?? "");
    const scrollToAny = window.scrollTo as unknown as { mock?: unknown; getMockName?: unknown };
    const scrollToIsMocked = Boolean(scrollToAny?.mock) || typeof scrollToAny?.getMockName === "function";
    if (isJsdom && !scrollToIsMocked) return;
    try {
      window.scrollTo({ top: 0, behavior });
    } catch {
      // Some environments (e.g. JSDOM) stub scrollTo without implementing it.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let previous: ScrollRestoration | null = null;
    try {
      previous = window.history?.scrollRestoration ?? null;
      window.history.scrollRestoration = "manual";
    } catch {
      // ignore
    }

    scrollToStudioTop("auto");

    return () => {
      if (!previous) return;
      try {
        window.history.scrollRestoration = previous;
      } catch {
        // ignore
      }
    };
  }, [scrollToStudioTop]);
  const finalRoleCheckTrackedRef = useRef<string | null>(null);
  const finalRoleAdjustmentClickedRef = useRef<string | null>(null);
  const resumeArtifactViewedSignatureRef = useRef<string | null>(null);
  const coverArtifactViewedSignatureRef = useRef<string | null>(null);
  const autoGenerationTelemetrySignatureRef = useRef<string | null>(null);
  const studioArtifactHydrationKeyRef = useRef<string | null>(null);
  const studioArtifactStorageKeyRef = useRef<string | null>(null);
  const studioArtifactPresentationStateRef = useRef<"hydrated" | "generated" | "unknown">("unknown");
  const autoGenerationSignatureRef = useRef<string | null>(null);
  const suppressAutoGenerationRef = useRef(false);
  const autoOpportunitySignatureRef = useRef<string | null>(null);
  const activeAutoOpportunityRef = useRef<string | null>(null);
  const currentWorkflowScopeRef = useRef<WorkflowRequestScope>({
    baselineId: null,
    jobId: null,
    baselineVersionId: null,
    analysisId: null,
  });
  const activeResumeGenerationRef = useRef<{ requestId: string; requestKey: string } | null>(null);
  const activeCoverGenerationRef = useRef<{ requestId: string; requestKey: string } | null>(null);
  const activeAutoGenerationRef = useRef<{ requestId: string; requestKey: string } | null>(null);
  const activeGenerationRequestKeysRef = useRef<Set<string>>(new Set());
  const [applicationInsights, setApplicationInsights] = useState<ApplicationInsight[]>([]);
  const [opportunityContext, setOpportunityContext] = useState<{
    status: string;
    updatedAt: string;
    baselineId: string | null;
    jobId: string | null;
    pairKey: string | null;
  } | null>(null);
  const [applicationContext, setApplicationContext] = useState<{
    id: string;
    status: string;
    appliedAt: string | null;
    lastTouchedAt: string;
    baselineId: string | null;
    jobId: string | null;
    jobUrl: string | null;
    notes: string | null;
    sourceUrl: string | null;
    createdAt: string;
    updatedAt: string;
    resumeArtifacts: StudioApplicationArtifactRecord[];
  } | null>(null);
  const [applicationProgress, setApplicationProgress] = useState<{
    totalApplicationsCount: number;
    completedApplicationsCount: number;
    recentActivity: Array<{
      id: string;
      company: string;
      title: string;
      status: string;
      updatedAt: string;
      appliedAt: string | null;
    }>;
  } | null>(null);
  const [applicationActionMessage, setApplicationActionMessage] = useState<string | null>(null);
  const [applicationPairLoading, setApplicationPairLoading] = useState(false);
  const [applicationProgressLoading, setApplicationProgressLoading] = useState(false);
  const applicationPairSignatureRef = useRef<string | null>(null);
  const applicationReadyViewedSignatureRef = useRef<string | null>(null);
  const applicationCompletedViewedSignatureRef = useRef<string | null>(null);
  const applicationProgressViewedSignatureRef = useRef<string | null>(null);
  const applicationUpsertSignatureRef = useRef<string | null>(null);
  const applicationApplySignatureRef = useRef<string | null>(null);
  const applicationProgressLoadSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadResumeFocusPreference = async () => {
      try {
        const response = await fetch("/api/users/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { studioResumeFocusDefault?: unknown };
        const focus = payload.studioResumeFocusDefault;
        if (
          !cancelled &&
          typeof focus === "string" &&
          [
            "Auto (recommended)",
            "Operational Leadership",
            "Technical Depth",
            "Customer Experience Strategy",
            "Scaling Operations",
          ].includes(focus)
        ) {
          setResumeFocus(focus as ResumeFocusOption);
        }
      } catch {
        // Best effort.
      }
    };

    void loadResumeFocusPreference();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyCoverLetterComplianceBlocked(blocked: CoverLetterComplianceBlocked) {
    setCoverLetterComplianceBlocked(blocked);
    setCoverState((current) => ({
      ...current,
      error: null,
      tierGateError: null,
      artifactFailure: null,
    }));
    setCoverWarningFlags([]);
    setCoverAuditId(undefined);
  }

  const isFirstGenerationAfterUnlock = isFromUnlock && !hasGeneratedOnce;

  const router = useRouter();
  const trackerEntryId =
    readTrackerField(resumeState.response, "opportunityId") ?? 
    readTrackerField(resumeState.response, "trackerEntryId");
  const handleOpenTracker = useCallback(() => {
    recordOpportunityCommitIntent();
    setRecentIntent(readRecentIntentState());
    trackEvent("opportunity_commit_intent", {
      source: "studio",
      analysisId: requestedAnalysisId || undefined,
      hasTrackerEntry: Boolean(trackerEntryId),
      action: trackerEntryId ? "continue" : "save",
    });
    if (!trackerEntryId) return;
    void (async () => {
      try {
        const coverage = analysis?.verification_coverage ?? null;
        const verifiedRequirements = Array.isArray(coverage?.verifiedRequirements)
          ? coverage.verifiedRequirements
          : [];
        const inferredRequirements = Array.isArray(coverage?.inferredRequirements)
          ? coverage.inferredRequirements
          : [];
        const unverifiedRequirements = Array.isArray(coverage?.unverifiedRequirements)
          ? coverage.unverifiedRequirements
          : [];
        const supportedRequirements = Array.isArray(coverage?.supportedRequirements)
          ? coverage.supportedRequirements
          : [];
          const rawScore =
            typeof analysis?.scoring_v2?.score === "number"
              ? analysis.scoring_v2.score
              : typeof analysis?.score === "number"
                ? analysis.score
                : typeof analysis?.overallScore === "number"
                  ? analysis.overallScore
                  : null;
        const scoreValue = typeof rawScore === "number" ? Math.round(rawScore) : null;
        await fetch(`/api/applications/${encodeURIComponent(trackerEntryId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: requestedAnalysisId || null,
            baselineId: selectedBaselineId || analysis?.baselineId || null,
            baselineVersionId: selectedBaselineVersionId || analysis?.baselineVersionId || null,
            fitScore: scoreValue,
            verificationCoverageSnapshot: {
              verifiedRequirements,
              inferredRequirements,
              unverifiedRequirements,
              supportedRequirements,
            },
            outcomeLinkageSnapshot: {
              removedTargeting: Array.from(excludedTargetingLabels),
              addedEvidence: Object.keys(expansionSuccessByRequirement),
              evidenceAdded: Object.keys(expansionSuccessByRequirement).length > 0,
            },
          }),
        });
      } catch {
        // Best-effort snapshot capture before opening tracker.
      } finally {
        void router.push("/job-tracker");
      }
    })();
  }, [
    analysis?.baselineId,
    analysis?.baselineVersionId,
    analysis?.overallScore,
    analysis?.score,
    analysis?.verification_coverage,
    excludedTargetingLabels,
    expansionSuccessByRequirement,
    requestedAnalysisId,
    router,
    selectedBaselineId,
    selectedBaselineVersionId,
    trackerEntryId,
    requestedAnalysisId,
  ]);

  const { isPro } = useEntitlements();

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId),
    [jobs, selectedJobId],
  );
  const selectedBaseline = useMemo(
    () => baselines.find((baseline) => baseline.id === selectedBaselineId),
    [baselines, selectedBaselineId],
  );
  useEffect(() => {
    const activeBaselineId = selectedBaselineId || trimId(analysis?.baselineId);
    if (!activeBaselineId) {
      setBaselineDetail(null);
      return;
    }
    let canceled = false;
    const loadBaselineDetail = async () => {
      try {
        const response = await fetch(`/api/baselines/${encodeURIComponent(activeBaselineId)}`, {
          cache: "no-store",
        });
        const payload = await readResponsePayload(response);
        if (canceled) return;
        if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
          setBaselineDetail(selectedBaseline ?? null);
          return;
        }
        setBaselineDetail(payload as BaselineDto);
      } catch {
        if (!canceled) {
          setBaselineDetail(selectedBaseline ?? null);
        }
      }
    };
    void loadBaselineDetail();
    return () => {
      canceled = true;
    };
  }, [analysis?.baselineId, selectedBaseline, selectedBaselineId]);
  const sourceResumeLabel = useMemo(() => {
    const raw =
      selectedBaseline?.originalFilename ||
      (selectedBaseline ? `Resume ${selectedBaseline.version}` : "Not selected");
    return raw.replace(/baseline/gi, "resume");
  }, [selectedBaseline]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedBaselineVersionId),
    [versions, selectedBaselineVersionId],
  );

  useEffect(() => {
    setCoverLetterComplianceBlocked(null);
  }, [selectedJobId, selectedBaselineId, selectedBaselineVersionId]);

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
        // Non-blocking.
      }
    };
    void loadInsights();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBlockPolicyVersionAdvance = useCallback(
    (newVersionId: string, newHash: string | null) => {
      if (newVersionId) {
        pendingVersionSelectionRef.current = newVersionId;
      }
      if (newVersionId && newVersionId !== selectedBaselineVersionId) {
        setSelectedBaselineVersionId(newVersionId);
      }
      setVersionTouched(true);
      setVersionRefreshSignal((prev) => prev + 1);
    },
    [selectedBaselineVersionId],
  );

  const refreshBlockPolicyList = useCallback(() => {
    setVersionRefreshSignal((prev) => prev + 1);
  }, []);

  const analysisScore = useMemo(() => { 
    const v2 = (analysis as { scoring_v2?: { score?: unknown } | null } | null)?.scoring_v2?.score; 
    if (typeof v2 === "number") return v2; 
    const direct = (analysis as { score?: unknown } | null)?.score; 
    if (typeof direct === "number") return direct; 
    const overall = (analysis as { overallScore?: unknown } | null)?.overallScore; 
    if (typeof overall === "number") return overall; 
    return null; 
  }, [analysis]); 
  const generateNowEligible = isGenerateNowEligible(analysisScore);

  const readGenerationDebug = useCallback(
    (payload: unknown): { generationMode: string; templateVersion: string } => {
      if (!payload || typeof payload !== "object") {
        return { generationMode: "legacy_generation", templateVersion: "unknown" };
      }
      const record = payload as Record<string, unknown>;
      const internal = (record.internal && typeof record.internal === "object"
        ? (record.internal as Record<string, unknown>)
        : null);
      const generationMode = typeof internal?.generationMode === "string"
        ? internal.generationMode
        : typeof record.generationMode === "string"
          ? (record.generationMode as string)
          : "legacy_generation";
      const templateVersion = typeof internal?.templateVersion === "string"
        ? internal.templateVersion
        : typeof record.templateVersion === "string"
          ? (record.templateVersion as string)
          : "unknown";
      return { generationMode, templateVersion };
    },
    [],
  );

  const readMissingStructuredBaselineSignal = useCallback((payload: unknown): boolean => {
    if (!payload || typeof payload !== "object") return false;
    const record = payload as Record<string, unknown>;
    const diagnostics = (record.diagnostics && typeof record.diagnostics === "object"
      ? (record.diagnostics as Record<string, unknown>)
      : null);
    const missingRequirements = diagnostics?.missingRequirements;
    if (Array.isArray(missingRequirements) && missingRequirements.length > 0) return true;

    const error = (record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null);
    const errorDiagnostics = (error?.diagnostics && typeof error.diagnostics === "object"
      ? (error.diagnostics as Record<string, unknown>)
      : null);
    const errorMissing = errorDiagnostics?.missingRequirements;
    return Array.isArray(errorMissing) && errorMissing.length > 0;
  }, []);

  const coverLetterJobContext = useMemo(() => {
    const jobWithExtras = selectedJob as Job & {
      companyName?: string | null;
      jobTitle?: string | null;
    };
    const companies = collectNormalizedContextValues([
      selectedJob?.company,
      jobWithExtras?.companyName,
      analysis?.company,
      analysis?.companyName,
    ]);
    const roleTitles = collectNormalizedContextValues([
      selectedJob?.title,
      jobWithExtras?.jobTitle,
      analysis?.jobTitle,
      analysis?.title,
    ]);
    if (!companies.length && !roleTitles.length) return undefined;
    const context: CoverLetterJobContextPayload = {};
    if (companies.length) context.allowedCompanies = companies;
    if (roleTitles.length) context.allowedRoleTitles = roleTitles;
    return context;
  }, [selectedJob, analysis]);
  const coverLetterJobDescriptionText = useMemo(() => {
    return extractJobDescription(selectedJob ?? null);
  }, [selectedJob]);
  const documentStrategyPlanInput = useMemo(
    () => ({
      fitScore: analysisScore,
      jobTitle: selectedJob?.title ?? analysis?.title ?? analysis?.jobTitle ?? null,
      jobCompany: selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? null,
      jobDescription: coverLetterJobDescriptionText,
      jobRequirements: selectedJob?.normalizedRequirements ?? [],
      jobResponsibilities: selectedJob?.normalizedResponsibilities ?? [],
      analysisSummary: analysis?.summary ?? null,
      analysisStrengths: analysis?.strengths ?? null,
      analysisGaps: analysis?.gaps ?? null,
      analysisRecommendedActions: analysis?.recommendedActions ?? null,
      baselineSections: baselineDetail?.sections ?? selectedBaseline?.sections ?? [],
    }),
    [
      analysis?.gaps,
      analysis?.recommendedActions,
      analysis?.strengths,
      analysis?.summary,
      analysis?.company,
      analysis?.companyName,
      analysis?.jobTitle,
      analysis?.title,
      analysisScore,
      baselineDetail?.sections,
      coverLetterJobDescriptionText,
      selectedBaseline?.sections,
      selectedJob?.company,
      selectedJob?.normalizedRequirements,
      selectedJob?.normalizedResponsibilities,
      selectedJob?.title,
    ],
  );
  const documentStrategyPlan = useMemo(
    () =>
      buildDocumentStrategyPlan({
        ...documentStrategyPlanInput,
        refinements: refinementInstructions,
      }),
    [documentStrategyPlanInput, refinementInstructions],
  );
  const scoreBand = useMemo(() => {
    if (analysisScore === null) return null;
    return getScoreBand(analysisScore);
  }, [analysisScore]);
  const isTopBand = scoreBand === ScoreBand.TOP;
  // Effective IDs must be derived consistently from the URL and/or hydrated analysis.
  // In particular, auto-generation eligibility depends on these being available as soon as the URL provides them.
  const effectiveJobId = selectedJobId || requestedJobId || trimId(analysis?.jobId);
  const effectiveBaselineId = selectedBaselineId || requestedBaselineId || trimId(analysis?.baselineId);
  const effectiveBaselineVersionId =
    selectedBaselineVersionId || requestedBaselineVersionId || trimId(analysis?.baselineVersionId);
  const currentWorkflowScope = useMemo<WorkflowRequestScope>(
    () => ({
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      baselineVersionId: effectiveBaselineVersionId || null,
      analysisId: requestedAnalysisId || null,
    }),
    [effectiveBaselineId, effectiveBaselineVersionId, effectiveJobId, requestedAnalysisId],
  );
  const generationWorkflowScope = useMemo<WorkflowRequestScope>(
    () => ({
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      // Generation identity must not churn when baselineVersionId is resolved/changes.
      baselineVersionId: null,
      analysisId: requestedAnalysisId || null,
    }),
    [effectiveBaselineId, effectiveJobId, requestedAnalysisId],
  );
  const studioArtifactStorageKey = useMemo(
    () => getStudioArtifactStorageKey(effectiveJobId, effectiveBaselineId),
    [effectiveBaselineId, effectiveJobId],
  );
  const studioArtifactHydrationSignature = useMemo(
    () =>
      [
        studioArtifactStorageKey ?? "none",
        effectiveBaselineVersionId ?? "none",
        requestedAnalysisId ?? "none",
      ].join("|"),
    [effectiveBaselineVersionId, requestedAnalysisId, studioArtifactStorageKey],
  );
  useEffect(() => {
    if (!requestedAnalysisId) {
      setOpportunityContext(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/opportunities?analysisId=${encodeURIComponent(requestedAnalysisId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as Array<{
          status?: string;
          updatedAt?: string;
        }>;
        if (!cancelled && Array.isArray(payload) && payload.length > 0) {
          const first = payload[0];
          if (typeof first.status === "string" && typeof first.updatedAt === "string") {
            setOpportunityContext({
              status: first.status,
              updatedAt: first.updatedAt,
              baselineId: effectiveBaselineId ?? null,
              jobId: effectiveJobId ?? null,
              pairKey: buildWorkflowRequestKey("opportunity_auto_add", {
                baselineId: effectiveBaselineId ?? null,
                jobId: effectiveJobId ?? null,
              }),
            });
          }
        }
      } catch {
        // non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveBaselineId, effectiveJobId, requestedAnalysisId]);
  useEffect(() => {
    currentWorkflowScopeRef.current = currentWorkflowScope;
  }, [currentWorkflowScope]);
  useEffect(() => {
    studioArtifactStorageKeyRef.current = studioArtifactStorageKey;
    if (!studioArtifactStorageKey) {
      studioArtifactHydrationKeyRef.current = null;
      suppressAutoGenerationRef.current = false;
      setStudioArtifactPairStatus("missing");
      setStudioArtifactsHydrated(false);
      return;
    }
    if (studioArtifactHydrationKeyRef.current === studioArtifactHydrationSignature) {
      return;
    }

    studioArtifactHydrationKeyRef.current = studioArtifactHydrationSignature;
    // Block auto-generation until hydration determines whether artifacts already exist for this pair.
    suppressAutoGenerationRef.current = true;
    let cancelled = false;

    if (process.env.NODE_ENV === "development") {
      console.info("[studio] artifact_hydration_started", {
        area: "studio",
        operation: "hydrate_artifacts",
        status: "info",
        code: "artifact_hydration_started",
        baselineId: effectiveBaselineId || null,
        baselineVersionId: effectiveBaselineVersionId || null,
        jobId: effectiveJobId || null,
        analysisId: requestedAnalysisId ?? null,
      });
    }

    const applyHydratedPayload = (payload: BackendStudioArtifactsResponse | StoredStudioArtifactSnapshot | null) => {
      if (!payload || cancelled) return;
      const resumeResponseRaw = isBackendStudioArtifactsResponse(payload)
        ? payload.resume?.responseBody ?? null
        : payload.resumeResponse ?? null;
      const coverResponseRaw = isBackendStudioArtifactsResponse(payload)
        ? payload.coverLetter?.responseBody ?? null
        : payload.coverResponse ?? null;
      const resumeResponse = normalizeHydratedArtifactResponse(resumeResponseRaw);
      const coverResponse = normalizeHydratedArtifactResponse(coverResponseRaw);

      // Phase 1: prefer canonical artifact results when present, but keep legacy responseBody alongside it.
      const resumeResult = isBackendStudioArtifactsResponse(payload) ? payload.resumeResult ?? null : null;
      const coverLetterResult = isBackendStudioArtifactsResponse(payload) ? payload.coverLetterResult ?? null : null;
      const resumeResponseWithResult =
        resumeResult
          ? (resumeResponse && typeof resumeResponse === "object"
              ? ({ ...(resumeResponse as Record<string, unknown>), resumeResult } as unknown)
              : ({ resumeResult } as unknown))
          : resumeResponse;
      const coverResponseWithResult =
        coverLetterResult
          ? (coverResponse && typeof coverResponse === "object"
              ? ({ ...(coverResponse as Record<string, unknown>), coverLetterResult } as unknown)
              : ({ coverLetterResult } as unknown))
          : coverResponse;
      const resumeFailure = isBackendStudioArtifactsResponse(payload)
        ? buildFailureFromBackendRecord("resume", payload.resume)
        : null;
      const coverFailure = isBackendStudioArtifactsResponse(payload)
        ? buildFailureFromBackendRecord("cover_letter", payload.coverLetter)
        : null;
      if (resumeResponseWithResult) {
        setResumeState((current) => ({
          ...current,
          response:
            resumeResponseWithResult && typeof resumeResponseWithResult === "object"
              ? ({ ...(resumeResponseWithResult as Record<string, unknown>) } as unknown)
              : resumeResponseWithResult,
          error: null,
          tierGateError: null,
          artifactFailure: null,
        }));
        setHasGeneratedOnce(true);
        studioArtifactPresentationStateRef.current = "hydrated";
      } else if (resumeFailure) {
        setResumeState((current) => ({ ...current, artifactFailure: resumeFailure, error: null }));
      }
      if (coverResponseWithResult) {
        setCoverState((current) => ({
          ...current,
          response:
            coverResponseWithResult && typeof coverResponseWithResult === "object"
              ? ({ ...(coverResponseWithResult as Record<string, unknown>) } as unknown)
              : coverResponseWithResult,
          error: null,
          tierGateError: null,
          artifactFailure: null,
        }));
        setHasGeneratedOnce(true);
        studioArtifactPresentationStateRef.current = "hydrated";
      } else if (coverFailure) {
        setCoverState((current) => ({ ...current, artifactFailure: coverFailure, error: null }));
      }
      const pairStatus =
        "status" in payload
          ? getBackendPairStatus(payload as BackendStudioArtifactsResponse)
          : ((resumeResponse || coverResponse)
              ? "completed"
              : (resumeFailure || coverFailure)
                ? "failed"
                : "missing");
      setStudioArtifactPairStatus(pairStatus);
      // If hydration confirms artifacts are missing, allow auto-generation to proceed afterwards.
      suppressAutoGenerationRef.current = pairStatus !== "missing";
    };

    void (async () => {
      try {
        const hasBaselineId = Boolean(effectiveBaselineId);
        const hasJobId = Boolean(effectiveJobId);
        let resolvedBaselineVersionId = effectiveBaselineVersionId;
        const hasBaselineVersionId = Boolean(resolvedBaselineVersionId);

        // The artifacts API requires baselineId + baselineVersionId + jobId. Do not call without them.
        if (!hasBaselineId || !hasJobId) {
          throw new Error("Missing required artifacts context");
        }

        if (!hasBaselineVersionId) {
          console.error("[STUDIO][ARTIFACTS] Missing baselineVersionId; attempting to resolve from baseline versions.", {
            baselineId: effectiveBaselineId,
            jobId: effectiveJobId,
            analysisId: requestedAnalysisId ?? null,
          });
          try {
            const versionsResponse = await fetch(
              `/api/baselines/${encodeURIComponent(effectiveBaselineId)}/versions`,
              { cache: "no-store" },
            );
            const versionsPayload = await readResponsePayload(versionsResponse);
            if (versionsResponse.ok && Array.isArray(versionsPayload)) {
              const versions = versionsPayload
                .map((record) => {
                  if (!record || typeof record !== "object") return null;
                  const candidate = record as { id?: unknown; versionNumber?: unknown };
                  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
                  const versionNumber =
                    typeof candidate.versionNumber === "number" ? candidate.versionNumber : Number(candidate.versionNumber);
                  if (!id || !Number.isFinite(versionNumber)) return null;
                  return { id, versionNumber };
                })
                .filter((value): value is { id: string; versionNumber: number } => Boolean(value));
              const resolved = versions.sort((a, b) => b.versionNumber - a.versionNumber)[0]?.id ?? null;
              if (resolved) {
                resolvedBaselineVersionId = resolved;
              }
            }
          } catch {
            // fall through to cache fallback below
          }
        }

        if (!resolvedBaselineVersionId) {
          console.error("[STUDIO][ARTIFACTS] baselineVersionId still missing; blocking artifacts fetch.", {
            baselineId: effectiveBaselineId,
            jobId: effectiveJobId,
            analysisId: requestedAnalysisId ?? null,
          });
          throw new Error("Missing baselineVersionId");
        }

        const artifactsParams = new URLSearchParams();
        artifactsParams.set("baselineId", effectiveBaselineId);
        artifactsParams.set("baselineVersionId", resolvedBaselineVersionId);
        artifactsParams.set("jobId", effectiveJobId);
        // Keep resume + cover hydration aligned to the same artifact identity. Some backends scope
        // drafts by analysisId, so include it when available.
        if (requestedAnalysisId) {
          artifactsParams.set("analysisId", requestedAnalysisId);
        }
        const artifactsUrl = `/api/studio/artifacts?${artifactsParams.toString()}`;
        if (process.env.NODE_ENV === "development") {
          console.info("[studio] artifact_hydration_fetch", {
            area: "studio",
            operation: "hydrate_artifacts",
            status: "info",
            code: "artifact_hydration_fetch",
            url: artifactsUrl,
          });
        }

        const response = await fetch(artifactsUrl, {
          cache: "no-store",
        });
        const payload = await readResponsePayload(response);
        if (cancelled) return;
        if (response.ok && payload && typeof payload === "object" && !Array.isArray(payload)) {
          const payloadRecord = payload as Record<string, unknown>;
          applyHydratedPayload(payload as BackendStudioArtifactsResponse);
          setStudioArtifactsHydrated(true);
          if (process.env.NODE_ENV === "development") {
            const resumeRecord = (payloadRecord as { resume?: unknown }).resume as
              | { responseBody?: unknown; status?: unknown }
              | null
              | undefined;
            const coverRecord = (payloadRecord as { coverLetter?: unknown }).coverLetter as
              | { responseBody?: unknown; status?: unknown }
              | null
              | undefined;
            console.info("[studio] artifact_hydration_succeeded", {
              area: "studio",
              operation: "hydrate_artifacts",
              status: "info",
              code: "artifact_hydration_succeeded",
              baselineId: effectiveBaselineId || null,
              baselineVersionId: resolvedBaselineVersionId || null,
              jobId: effectiveJobId || null,
              analysisId: requestedAnalysisId ?? null,
              hasResume: Boolean(resumeRecord),
              hasResumeResponseBody: Boolean(resumeRecord?.responseBody),
              hasCoverLetter: Boolean(coverRecord),
              hasCoverLetterResponseBody: Boolean(coverRecord?.responseBody),
            });
          }
          return;
        }
      } catch {
        // fall back to local cache below
      }

      const snapshot = readStoredStudioArtifacts(studioArtifactStorageKey);
      if (cancelled) return;
      if (snapshot) {
        if (process.env.NODE_ENV === "development") {
          console.info("[studio] artifact_hydration_fallback_local_storage", {
            area: "studio",
            operation: "hydrate_artifacts",
            status: "info",
            code: "artifact_hydration_fallback_local_storage",
            storageKey: studioArtifactStorageKey,
          });
        }
        applyHydratedPayload(snapshot);
        setStudioArtifactsHydrated(true);
        return;
      }
      setStudioArtifactPairStatus("missing");
      suppressAutoGenerationRef.current = false;
      setStudioArtifactsHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    requestedAnalysisId,
    studioArtifactHydrationSignature,
    studioArtifactStorageKey,
  ]);
  useEffect(() => {
    const resumeKey = buildWorkflowRequestKey("resume", generationWorkflowScope);
    const coverKey = buildWorkflowRequestKey("cover_letter", generationWorkflowScope);
    const autoKey = buildWorkflowRequestKey("auto_generation", generationWorkflowScope);

    if (resumeGenerating && (!resumeKey || activeResumeGenerationRef.current?.requestKey !== resumeKey)) {
      setResumeGenerating(false);
    }
    if (coverGenerating && (!coverKey || activeCoverGenerationRef.current?.requestKey !== coverKey)) {
      setCoverGenerating(false);
    }
    if (autoGenerationInFlight && (!autoKey || activeAutoGenerationRef.current?.requestKey !== autoKey)) {
      setAutoGenerationInFlight(false);
    }
  }, [autoGenerationInFlight, coverGenerating, generationWorkflowScope, resumeGenerating]);

  useEffect(() => {
    // Persist in-flight state across remounts (ex: URL normalization router.replace) so we don't:
    // - re-launch duplicate generation requests
    // - show "not generated" while a request is actually running
    if (!effectiveBaselineId || !effectiveJobId || !requestedAnalysisId) return;

    const resumeInFlight = isStudioArtifactSingleFlightInFlight({
      baselineId: effectiveBaselineId,
      jobId: effectiveJobId,
      analysisId: requestedAnalysisId,
      artifactType: "resume",
    });
    const coverInFlight = isStudioArtifactSingleFlightInFlight({
      baselineId: effectiveBaselineId,
      jobId: effectiveJobId,
      analysisId: requestedAnalysisId,
      artifactType: "cover_letter",
    });

    if (
      resumeInFlight &&
      !resumeState.response &&
      !resumeState.error &&
      !resumeState.tierGateError &&
      !resumeState.artifactFailure
    ) {
      setResumeGenerating((current) => current || true);
    }
    if (
      coverInFlight &&
      !coverState.response &&
      !coverState.error &&
      !coverState.tierGateError &&
      !coverState.artifactFailure &&
      !coverLetterComplianceBlocked
    ) {
      setCoverGenerating((current) => current || true);
    }
  }, [
    coverLetterComplianceBlocked,
    coverState.artifactFailure,
    coverState.response,
    coverState.error,
    coverState.tierGateError,
    effectiveBaselineId,
    effectiveJobId,
    requestedAnalysisId,
    resumeState.artifactFailure,
    resumeState.response,
    resumeState.error,
    resumeState.tierGateError,
  ]);

  useEffect(() => {
    // Release single-flight locks only once Studio state reflects a terminal outcome.
    // This avoids a brief window where async work finished but React state hasn't committed yet
    // (which previously allowed duplicate POSTs in fast/mock environments).
    if (!effectiveBaselineId || !effectiveJobId || !requestedAnalysisId) return;
    if (resumeState.response || resumeState.error || resumeState.tierGateError || resumeState.artifactFailure) {
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId,
        jobId: effectiveJobId,
        analysisId: requestedAnalysisId,
        artifactType: "resume",
      });
    }
  }, [
    effectiveBaselineId,
    effectiveJobId,
    requestedAnalysisId,
    resumeState.artifactFailure,
    resumeState.error,
    resumeState.response,
    resumeState.tierGateError,
  ]);

  useEffect(() => {
    if (!effectiveBaselineId || !effectiveJobId || !requestedAnalysisId) return;
    if (
      coverState.response ||
      coverState.error ||
      coverState.tierGateError ||
      coverState.artifactFailure ||
      coverLetterComplianceBlocked
    ) {
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId,
        jobId: effectiveJobId,
        analysisId: requestedAnalysisId,
        artifactType: "cover_letter",
      });
    }
  }, [
    coverLetterComplianceBlocked,
    coverState.artifactFailure,
    coverState.error,
    coverState.response,
    coverState.tierGateError,
    effectiveBaselineId,
    effectiveJobId,
    requestedAnalysisId,
  ]);
  const hasLoadedAnalysis = Boolean(
    requestedAnalysisId && !analysisLoading && !analysisError && analysisScore !== null,
  );
  const pathname = usePathname();
  const lowFitRedirectedRef = useRef(false);
  useEffect(() => {
    // Only consider cross-page redirects once we have the exact pair + score hydrated.
    if (!hasLoadedAnalysis) return;

    const decision = resolveResultsStudioRedirect({
      from: "studio",
      pathname,
      baselineId: effectiveBaselineId ?? null,
      jobId: effectiveJobId ?? null,
      analysisId: requestedAnalysisId ?? null,
      baselineVersionId: effectiveBaselineVersionId ?? null,
      score: analysisScore,
      hasAnyUsableOutput: Boolean(resumeState.response || coverState.response),
      generationReadinessBlocked: Boolean(generationReadiness.blocked),
    });

    if (!decision.redirectTo) {
      lowFitRedirectedRef.current = false;
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[studioAuthorityRedirect]", {
        pathname,
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        score: analysisScore,
        hasAnyUsableOutput: Boolean(resumeState.response || coverState.response),
        redirectTo: decision.redirectTo,
        reason: decision.reason,
      });
    }

    if (lowFitRedirectedRef.current) return;
    lowFitRedirectedRef.current = true;
    void router.replace(decision.redirectTo);
  }, [
    analysisScore,
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    hasLoadedAnalysis,
    generationReadiness.blocked,
    pathname,
    requestedAnalysisId,
    resumeState.response,
    coverState.response,
    router,
  ]);
  useEffect(() => {
    if (!requestedAnalysisId || !effectiveJobId || !effectiveBaselineId) {
      setGenerationReadiness(READINESS_LOADING_STATE);
      setPairReadinessContractState({ resume: "unknown", cover: "unknown" });
      return;
    }
    const readinessKey = [
      requestedAnalysisId,
      effectiveJobId,
      effectiveBaselineId,
      effectiveBaselineVersionId ?? "none",
    ].join(":");
    if (lastReadinessKeyRef.current === readinessKey) {
      return;
    }
    lastReadinessKeyRef.current = readinessKey;
    if (failedReadinessKeysRef.current.has(readinessKey)) {
      return;
    }

    const body: Record<string, string> = {
      analysisId: requestedAnalysisId,
      jobId: effectiveJobId,
      baselineId: effectiveBaselineId,
    };
    if (effectiveBaselineVersionId) {
      body.baselineVersionId = effectiveBaselineVersionId;
    }
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
        const resolved = combinePairGenerationReadinessFromTransport(
          {
            ok: resumeResponse.ok,
            status: resumeResponse.status,
            payload:
              resumePayload && typeof resumePayload === "object"
                ? (resumePayload as Record<string, unknown>)
                : null,
          },
          {
            ok: coverResponse.ok,
            status: coverResponse.status,
            payload:
              coverPayload && typeof coverPayload === "object"
                ? (coverPayload as Record<string, unknown>)
                : null,
          },
        );
        setGenerationReadiness(resolved.readiness);
        setPairReadinessContractState({
          resume: resolved.resumeReadinessState,
          cover: resolved.coverReadinessState,
        });
        if (!resumeResponse.ok || !coverResponse.ok) {
          failedReadinessKeysRef.current.add(readinessKey);
          return;
        }
      } catch {
        failedReadinessKeysRef.current.add(readinessKey);
      }
    })();
  }, [effectiveBaselineId, effectiveBaselineVersionId, effectiveJobId, requestedAnalysisId]);
  useEffect(() => {
    setExcludedTargetingLabels(new Set(queryExcludedRequirements));
    setTargetingAdjustmentFeedback(null);
    setTargetingAdjustmentStatus(null);
  }, [
    requestedAnalysisId,
    effectiveJobId,
    effectiveBaselineId,
    effectiveBaselineVersionId,
    queryExcludedRequirements,
  ]);
  const canonicalToolingClaims = useMemo(
    () =>
      analysis?.scoring_v2?.debug?.toolingCoverage?.claims ??
      analysis?.scoringV2?.debug?.toolingCoverage?.claims,
    [
      analysis?.scoring_v2?.debug?.toolingCoverage?.claims,
      analysis?.scoringV2?.debug?.toolingCoverage?.claims,
    ],
  );
  const claimVerifications = useMemo(
    () => normalizeClaimVerifications(canonicalToolingClaims),
    [canonicalToolingClaims],
  );
  const activeClaimVerifications = useMemo(
    () => filterClaimVerificationsByExcludedLabels(claimVerifications, excludedTargetingLabels),
    [claimVerifications, excludedTargetingLabels],
  );
  const reconciledGenerationReadiness = useMemo(
    () => reconcileReadinessWithClaimVerifications(generationReadiness, claimVerifications),
    [claimVerifications, generationReadiness],
  );
  const adjustedReadinessResult = useMemo(
    () => applyTargetingExclusionsToReadiness(reconciledGenerationReadiness, excludedTargetingLabels),
    [reconciledGenerationReadiness, excludedTargetingLabels],
  );
  const activeGenerationReadiness = adjustedReadinessResult.readiness;
  const canonicalClaimIssues = useMemo(
    () => buildVerificationIssuesFromCanonicalClaims(activeClaimVerifications),
    [activeClaimVerifications],
  );
  const canonicalCoverageIssues = useMemo(() => {
    const unverifiedRequirements = analysis?.verification_coverage?.unverifiedRequirements;
    if (!Array.isArray(unverifiedRequirements) || unverifiedRequirements.length === 0) {
      return [] as GenerationReadiness["verificationIssues"];
    }
    const syntheticClaims = unverifiedRequirements
      .map((requirement) =>
        normalizeUserFacingRequirementLabel(requirement, {
          sourceContext: null,
          issueCode: "unsupported_technology_claim",
        }),
      )
      .filter((label): label is string => typeof label === "string" && label.length > 0)
      .filter((label) => !excludedTargetingLabels.has(label.toLowerCase()))
      .map((label) => ({
        key: label.toLowerCase(),
        label,
        category: "unknown",
        sourceType: "job_required",
        status: "UNVERIFIED" as const,
        evidenceRefs: [] as string[],
        generationBlocking: true,
        scoreWeight: 0,
      }));
    return buildVerificationIssuesFromCanonicalClaims(syntheticClaims);
  }, [analysis?.verification_coverage?.unverifiedRequirements, excludedTargetingLabels]);
  const canonicalUnverifiedRequirements = useMemo(
    () =>
      (analysis?.verification_coverage?.unverifiedRequirements ?? [])
        .map((requirement) =>
          normalizeUserFacingRequirementLabel(requirement, {
            sourceContext: null,
            issueCode: "unsupported_technology_claim",
          }),
        )
        .filter((label): label is string => typeof label === "string" && label.length > 0)
        .filter((label) => !excludedTargetingLabels.has(label.toLowerCase())),
    [analysis?.verification_coverage?.unverifiedRequirements, excludedTargetingLabels],
  );
  const showEvidenceExpansion = useMemo( 
    () => 
      shouldGenerateDocuments(analysisScore) && 
      canonicalUnverifiedRequirements.length > 0 &&
      !generateNowEligible, 
    [analysisScore, canonicalUnverifiedRequirements.length, generateNowEligible], 
  ); 
  const showOptionalEvidenceStrengthening = useMemo(
    () => shouldGenerateDocuments(analysisScore) && canonicalUnverifiedRequirements.length > 0 && generateNowEligible,
    [analysisScore, canonicalUnverifiedRequirements.length, generateNowEligible],
  );
  const autoEvidenceSuggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildEvidenceSuggestion>>();
    for (const requirement of canonicalUnverifiedRequirements) {
      map.set(
        requirement,
        buildEvidenceSuggestion({
          requirement,
          supportingSignals: analysis?.supportingSignals,
          baselineEvidence: analysis?.baselineEvidence ?? analysis?.summary,
        }),
      );
    }
    return map;
  }, [analysis?.baselineEvidence, analysis?.summary, analysis?.supportingSignals, canonicalUnverifiedRequirements]);
  const hasCanonicalCoverage = useMemo(() => {
    const coverage = analysis?.verification_coverage;
    if (!coverage) return false;
    return (
      typeof coverage.totalClaims === "number" ||
      typeof coverage.verifiedClaims === "number" ||
      typeof coverage.inferredClaims === "number" ||
      typeof coverage.unverifiedClaims === "number" ||
      (Array.isArray(coverage.unverifiedRequirements) &&
        coverage.unverifiedRequirements.length > 0)
    );
  }, [analysis?.verification_coverage]);
  const verificationIssuesForStudio = useMemo(
    () => {
      if (hasCanonicalCoverage) {
        if (canonicalClaimIssues.length > 0) return canonicalClaimIssues;
        if (canonicalCoverageIssues.length > 0) return canonicalCoverageIssues;
        return [];
      }
      if (activeClaimVerifications.length > 0) {
        return canonicalClaimIssues;
      }
      return [];
    },
    [
      hasCanonicalCoverage,
      canonicalClaimIssues,
      canonicalCoverageIssues,
      activeClaimVerifications.length,
    ],
  );
  const verificationCoverage = useMemo(
    () => {
      const derived = deriveVerificationCoverage(
        activeGenerationReadiness,
        activeClaimVerifications,
      );
      const backendCoverage = analysis?.verification_coverage;
      if (!backendCoverage) return derived;
      const totalClaims = Number(backendCoverage.totalClaims ?? NaN);
      const verifiedClaims = Number(backendCoverage.verifiedClaims ?? NaN);
      const inferredClaims = Number(backendCoverage.inferredClaims ?? NaN);
      const unverifiedClaims = Number(backendCoverage.unverifiedClaims ?? NaN);
      if (
        !Number.isFinite(totalClaims) ||
        !Number.isFinite(verifiedClaims) ||
        !Number.isFinite(inferredClaims) ||
        !Number.isFinite(unverifiedClaims)
      ) {
        return derived;
      }
      const supportedClaims = verifiedClaims + inferredClaims;
      return {
        ...derived,
        totalClaims,
        verifiedClaims,
        inferredClaims,
        unverifiedClaims,
        supportedClaims,
        unsupportedClaims: unverifiedClaims,
      };
    },
    [activeClaimVerifications, activeGenerationReadiness, analysis?.verification_coverage],
  );
  const aggregatedVerificationIssues = useMemo(
    () => aggregateVerificationIssues(verificationIssuesForStudio),
    [verificationIssuesForStudio],
  );
  const evidenceUnitsForTrustGate = useMemo(() => collectEvidenceItems(analysis), [analysis]);
  const hasPreGenerationComplianceViolations = useMemo(
    () =>
      hasBlockingComplianceViolations(
        activeGenerationReadiness.verificationIssues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
        })),
      ),
    [activeGenerationReadiness.verificationIssues],
  );
  const hasMissingBaselineEvidenceIssue = useMemo(
    () =>
      activeGenerationReadiness.verificationIssues.some(
        (issue) => issue.code === "missing_baseline_evidence",
      ),
    [activeGenerationReadiness.verificationIssues],
  );
  const trustGateDecision = useMemo(
    () =>
      evaluateStudioTrustGate({
        score: analysisScore,
        baselineId: effectiveBaselineId,
        baselineVersionId: effectiveBaselineVersionId,
        allowMissingBaselineVersion: isNonProduction,
        evidenceUnits: evidenceUnitsForTrustGate,
        hasActiveComplianceViolations: hasPreGenerationComplianceViolations,
        hasMissingBaselineEvidenceIssue,
      }),
    [
      analysisScore,
      effectiveBaselineId,
      effectiveBaselineVersionId,
      isNonProduction,
      evidenceUnitsForTrustGate,
      hasPreGenerationComplianceViolations,
      hasMissingBaselineEvidenceIssue,
    ],
  );
  const generationBlockerCodes = useMemo(
    () => activeGenerationReadiness.verificationIssues.map((issue) => issue.code),
    [activeGenerationReadiness.verificationIssues],
  );
  const generationBlockerCount = generationBlockerCodes.length;

  const productDecisionState = useMemo(
    () =>
      buildProductDecisionState({
        surface: "studio",
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        score: analysisScore,
        generationReadiness: activeGenerationReadiness,
        hasCanonicalAssessment: Boolean(requestedAnalysisId) && !analysisError,
        hasRequiredContext: Boolean(effectiveJobId && effectiveBaselineId),
        isPro,
        canGenerateDocuments: shouldGenerateDocuments(analysisScore),
        opportunityAlreadySaved: hasGeneratedOnce,
        analysisAssessmentId: requestedAnalysisId ?? null,
        analysisBaselineId: effectiveBaselineId ?? null,
        analysisJobId: effectiveJobId ?? null,
        analysisBaselineVersionId: effectiveBaselineVersionId ?? null,
        routeContext: {
          assessmentId: requestedAnalysisId ?? null,
          analysisId: requestedAnalysisId ?? null,
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          baselineVersionId: effectiveBaselineVersionId ?? null,
          fromUnlock: isFromUnlock,
        },
        persistedAssessmentId: requestedAnalysisId ?? null,
      }),
    [
      analysisError,
      analysisScore,
      activeGenerationReadiness,
      effectiveBaselineId,
      effectiveBaselineVersionId,
      effectiveJobId,
      hasGeneratedOnce,
      isFromUnlock,
      isNonProduction,
      isPro,
      requestedAnalysisId,
      trustGateDecision.allowed,
    ],
  ); 
  const productReadiness = productDecisionState.productReadiness; 
  const qualifiedForGeneration = shouldGenerateDocuments(analysisScore); 
  const studioDraftMode = 
    resolveDocumentGenerationMode(analysisScore) === "draft" && isFromUnlock && !hasGeneratedOnce; 
  const improveBaselineHref = useMemo(() => {
    const params = new URLSearchParams();
    if (requestedAnalysisId) params.set("analysisId", requestedAnalysisId);
    if (effectiveJobId) params.set("jobId", effectiveJobId);
    if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
    if (effectiveBaselineVersionId) params.set("baselineVersionId", effectiveBaselineVersionId);
    const query = params.toString();
    return query ? `/baseline?${query}` : "/baseline";
  }, [requestedAnalysisId, effectiveJobId, effectiveBaselineId, effectiveBaselineVersionId]);
  const canExportDocuments = productReadiness.generation_readiness.canExport;
  const artifactContract = useMemo(
    () =>
      buildStudioArtifactContract({
        resumeResponse: resumeState.response,
        coverLetterResponse: coverState.response,
        canExportDocuments,
        isPro,
      }),
    [canExportDocuments, coverState.response, isPro, resumeState.response],
  );
  const resumePresenter = artifactContract.presenters.resume;
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!artifactContract.normalized.resumeResponse) return;
    console.info("[studio] resume_presenter_resolved", {
      area: "studio",
      operation: "present_resume",
      status: "info",
      code: "resume_presenter_resolved",
      presenterStatus: resumePresenter.status,
      hasExportableContent: resumePresenter.hasExportableContent,
    });
  }, [artifactContract.normalized.resumeResponse, resumePresenter.hasExportableContent, resumePresenter.status]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!artifactContract.normalized.resumeResponse) return;
    const previewPayload = readCanonicalResumePreviewPayload(artifactContract.normalized.resumeResponse);
    if (!previewPayload) return;
    console.log("RESUME_PREVIEW_SOURCE", previewPayload);
  }, [artifactContract.normalized.resumeResponse]);
  const generatedResumeModel = artifactContract.resumeModel;
  const effectiveResumeModel = isResumeEditMode
    ? draftResumeModel
    : savedEditedResumeModel ?? generatedResumeModel;
  const hasSavedResumeEdits = Boolean(savedEditedResumeModel);
  const hasUnsavedResumeEdits =
    isResumeEditMode &&
    JSON.stringify(draftResumeModel ?? null) !==
      JSON.stringify((savedEditedResumeModel ?? generatedResumeModel) ?? null);
  const hasResumeDraft = Boolean(artifactContract.resumeModel) && Boolean(resumeState.response);
  const hasResumeArtifact = artifactContract.hasResumeArtifact;
  // Quality validation must run on the same normalized resume model used for rendering (readResumeModel output).
  // Do not inspect raw payloads or presenter state for quality gating.
  const resumeQuality = artifactContract.quality.resume;
  const resumeHasValidationFindings = resumeQuality.issues.length > 0;
  const resumeResult = artifactContract.results.resume;
  const resumeQualityPass = resumeResult
    ? resumeResult.qualityStatus === "pass" && resumeResult.generationState === "generated_usable"
    : resumeQuality.status === "pass" && !resumeHasValidationFindings;
  const resumeNeedsRefinement = resumeResult
    ? resumeResult.qualityStatus !== "pass"
    : Boolean(generatedResumeModel) && resumeQuality.status === "needs_refinement";
  const resumeRequiresCorrectionCopy = hasResumeDraft && !resumeQualityPass;
  const resumeQualityIssueSummary = useMemo(() => {
    const blocking = resumeQuality.issues.filter((issue) => issue.severity === "blocking");
    const issues = blocking.length ? blocking : resumeQuality.issues;
    const visible = issues.slice(0, 3);
    return {
      visible,
      remaining: Math.max(0, issues.length - visible.length),
    };
  }, [resumeQuality.issues]);
  const showResumeDownloadActions =
    resumePresenter.status === "blocked" ||
    (artifactContract.results.resume
      ? artifactContract.results.resume.actions.canExport
      : resumePresenter.status === "success" && hasResumeArtifact && resumeQualityPass);
  const isResumeDownloadLocked = !isPro;
  const canExportResume = artifactContract.results.resume
    ? artifactContract.results.resume.actions.canExport
    : artifactContract.resumeExportAvailable && resumeQuality.exportable;
  const resumePreviewText = useMemo(
    () => formatPreview(artifactContract.normalized.resumeResponse),
    [artifactContract.normalized.resumeResponse],
  );
  const canonicalResumePreviewPayload = useMemo(
    () =>
      artifactContract.results.resume?.preview && typeof artifactContract.results.resume.preview === "object"
        ? artifactContract.results.resume.preview
        : readCanonicalResumePreviewPayload(artifactContract.normalized.resumeResponse),
    [artifactContract.normalized.resumeResponse, artifactContract.results.resume],
  );
  const coverLetterParagraphs = artifactContract.coverLetterModel?.paragraphs ?? [];
  const coverPresenter = artifactContract.presenters.coverLetter;
  const hasCoverLetterDraft =
    (Boolean(artifactContract.coverLetterModel) && Boolean(coverState.response)) ||
    Boolean(artifactContract.results.coverLetter?.preview);
  const coverLetterQuality = artifactContract.quality.coverLetter;
  const coverHasValidationFindings = coverLetterQuality.issues.length > 0;
  const coverLetterResult = artifactContract.results.coverLetter;
  const coverQualityPass = coverLetterResult
    ? coverLetterResult.qualityStatus === "pass" && coverLetterResult.generationState === "generated_usable"
    : coverLetterQuality.status === "pass" && !coverHasValidationFindings;
  const coverNeedsRefinement = coverLetterResult
    ? coverLetterResult.qualityStatus !== "pass"
    : coverLetterParagraphs.length > 0 && coverLetterQuality.status === "needs_refinement";
  const coverRequiresCorrectionCopy = hasCoverLetterDraft && !coverQualityPass;
  const coverQualityIssueSummary = useMemo(() => {
    const blocking = coverLetterQuality.issues.filter((issue) => issue.severity === "blocking");
    const issues = blocking.length ? blocking : coverLetterQuality.issues;
    const visible = issues.slice(0, 3);
    return {
      visible,
      remaining: Math.max(0, issues.length - visible.length),
    };
  }, [coverLetterQuality.issues]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.info("[studio][quality_check]", {
      hasResumeModel: Boolean(generatedResumeModel),
      qualityStatus: resumeQuality.status,
      exportable: resumeQuality.exportable,
      canExportResume,
    });
  }, [canExportResume, generatedResumeModel, resumeQuality.exportable, resumeQuality.status]);

  // Canonical workflow authority (additive layer): owns top-level readiness/failure messaging decisions.
  const resolvedScoreForContract = analysisScore;
  const workflowAuthority = useMemo(
    () =>
      resolveWorkflowAuthority({
        score: resolvedScoreForContract,
        generationReadiness: activeGenerationReadiness,
        resumeState: {
          hasOutput: hasResumeDraft,
          failed: Boolean(resumeState.error || resumeState.artifactFailure),
        },
        coverState: {
          hasOutput: hasCoverLetterDraft,
          failed: Boolean(coverState.error || coverState.artifactFailure),
        },
        isPro,
        hasGeneratedOnce,
        isHydrating: analysisLoading,
      }),
    [
      activeGenerationReadiness,
      analysisLoading,
      coverState.artifactFailure,
      coverState.error,
      hasCoverLetterDraft,
      hasGeneratedOnce,
      hasResumeDraft,
      isPro,
      resumeState.artifactFailure,
      resumeState.error,
      resolvedScoreForContract,
    ],
  );

  const pairWorkflowState = useMemo(() => {
    const resumeStatus: PairWorkflowArtifactStatus = resumeGenerating || autoGenerationInFlight
      ? "generating"
      : Boolean(generatedResumeModel) && Boolean(resumeState.response)
        ? "ready"
        : resumePresenter.status === "blocked" || resumePresenter.status === "error"
          ? "failed"
          : resumeState.response
            ? "pending"
            : "missing";
    const coverLetterStatus: PairWorkflowArtifactStatus = coverGenerating || autoGenerationInFlight
      ? "generating"
      : coverPresenter.status === "success" && Boolean(coverState.response)
        ? "ready"
        : coverPresenter.status === "blocked" || coverPresenter.status === "error"
          ? "failed"
          : coverState.response
            ? "pending"
            : "missing";

    return resolvePairWorkflowState({
      baselineId: effectiveBaselineId ?? null,
      jobId: effectiveJobId ?? null,
      canonicalDecision: productDecisionState.canonicalDecision,
      analysisStatus: analysisError ? "failed" : requestedAnalysisId ? "complete" : "idle",
      artifacts: {
        resume: resumeStatus,
        coverLetter: coverLetterStatus,
      },
    });
  }, [
    analysisError,
    autoGenerationInFlight,
    coverGenerating,
    coverPresenter.status,
    coverState.response,
    effectiveBaselineId,
    effectiveJobId,
    generatedResumeModel,
    productDecisionState.canonicalDecision,
    requestedAnalysisId,
    resumeGenerating,
    resumePresenter.status,
    resumeState.response,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const responseKeys =
      resumeState.response && typeof resumeState.response === "object"
        ? Object.keys(resumeState.response as Record<string, unknown>).slice(0, 20)
        : [];
    console.log("[studio][resume_panel_decision]", {
      resumeGenerating,
      resumeStateResponsePresent: Boolean(resumeState.response),
      resumeStateResponseKeys: responseKeys,
      presenterStatus: resumePresenter.status,
      presenterHasExportableContent: resumePresenter.hasExportableContent,
      readResumeModelHasModel: Boolean(generatedResumeModel),
      artifactHasOutput: hasResumeDraft,
      canExportResume,
    });
  }, [
    canExportResume,
    generatedResumeModel,
    hasResumeDraft,
    resumeGenerating,
    resumePresenter.hasExportableContent,
    resumePresenter.status,
    resumeState.response,
  ]);

  const canGenerateDocuments = pairWorkflowState.canGenerate;
  const generationLifecycle = useMemo(
    () =>
      resolvePairGenerationLifecycle({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        score: pairWorkflowState.score,
        resumeStatus: pairWorkflowState.resumeStatus,
        coverLetterStatus: pairWorkflowState.coverLetterStatus,
        kickoffInFlight: autoGenerationInFlight || resumeGenerating || coverGenerating,
      }),
    [
      autoGenerationInFlight,
      coverGenerating,
      effectiveBaselineId,
      effectiveJobId,
      pairWorkflowState.coverLetterStatus,
      pairWorkflowState.resumeStatus,
      pairWorkflowState.score,
      resumeGenerating,
    ],
  );

  // Pair-wide latches caused cross-mount duplicate launches (ex: when URL normalization triggers remount).
  // Studio uses per-artifact single-flight locks keyed by (baselineId, jobId, analysisId, artifactType).

  const documentCritique = useMemo(
    () =>
      buildDocumentCritique({
        plan: documentStrategyPlan,
        resumeModel: generatedResumeModel,
        coverLetterParagraphs,
      }),
    [coverLetterParagraphs, documentStrategyPlan, generatedResumeModel],
  );
  const roleMatchFinalPass = useMemo(
    () =>
      buildRoleMatchFinalPass({
        plan: documentStrategyPlan,
        resumeModel: generatedResumeModel,
        coverLetterParagraphs,
        jobDescription:
          selectedJob?.rawDescription ?? coverLetterJobDescriptionText ?? null,
      }),
    [
      coverLetterJobDescriptionText,
      coverLetterParagraphs,
      documentStrategyPlan,
      generatedResumeModel,
      selectedJob?.rawDescription,
    ],
  );
  const languageStylePass = useMemo(
    () =>
      buildLanguageStylePass({
        plan: documentStrategyPlan,
        roleLabel: selectedJob?.title ?? null,
        resumeSummary: generatedResumeModel?.summary ?? null,
        resumeBullets:
          generatedResumeModel?.experience?.flatMap((entry) => entry.bullets ?? []) ?? [],
        coverOpening: coverLetterParagraphs[0] ?? null,
        coverParagraphs: coverLetterParagraphs,
      }),
    [
      coverLetterParagraphs,
      documentStrategyPlan,
      generatedResumeModel?.experience,
      generatedResumeModel?.summary,
      selectedJob?.title,
    ],
  );
  const roleMatchFinalSignature = useMemo(
    () =>
      [
        roleMatchFinalPass.overallMatchReadiness,
        roleMatchFinalPass.priorityCoverage.map((entry) => `${entry.priority}:${entry.strength}`).join(","),
        roleMatchFinalPass.recruiterScanRisks.map((risk) => `${risk.type}:${risk.severity}`).join(","),
        roleMatchFinalPass.recommendedFinalAdjustments
          .map((adjustment) => `${adjustment.type}:${adjustment.target}`)
          .join(","),
      ].join("|"),
    [roleMatchFinalPass],
  );
  const autoOpportunitySignature = useMemo(() => {
    if (!qualifiedForGeneration || !effectiveBaselineId || !effectiveJobId || !requestedAnalysisId) {
      return null;
    }
    return buildWorkflowRequestKey("opportunity_auto_add", {
      baselineId: effectiveBaselineId,
      jobId: effectiveJobId,
    });
  }, [effectiveBaselineId, effectiveJobId, qualifiedForGeneration, requestedAnalysisId]);
  const artifactQuality = useMemo(
    () =>
      buildArtifactQualityModel({
        artifactType: "resume",
        score: analysisScore,
        productConfidence: productReadiness.confidence,
        verificationCoverage: analysis?.verification_coverage ?? null,
        verificationIssues: activeGenerationReadiness.verificationIssues,
        baselineEvidence: analysis?.baselineEvidence ?? analysis?.summary,
        summary: analysis?.summary,
        verifiedClaimTexts,
        dismissedClaimTexts,
      }),
    [
      activeGenerationReadiness.verificationIssues,
      analysis?.baselineEvidence,
      analysis?.summary,
      analysis?.verification_coverage,
      analysisScore,
      dismissedClaimTexts,
      productReadiness.confidence,
      verifiedClaimTexts,
    ],
  );
  const visibleImprovableClaims = useMemo(
    () => artifactQuality.improvableClaims.filter((claim) => !dismissedClaimTexts.includes(claim.text.toLowerCase())),
    [artifactQuality.improvableClaims, dismissedClaimTexts],
  );
  const hasCoverLetterArtifact = artifactContract.hasCoverLetterArtifact;
  useEffect(() => {
    if (!resumeState.response && !coverState.response) {
      return;
    }
    const trackingKey = [
      artifactQuality.confidence,
      artifactQuality.artifactScore,
      artifactQuality.missingEvidenceCount,
      visibleImprovableClaims.length,
      Boolean(resumeState.response),
      Boolean(coverState.response),
    ].join(":");
    if (confidencePanelTrackedRef.current === trackingKey) {
      return;
    }
    confidencePanelTrackedRef.current = trackingKey;
    trackEvent("artifact_viewed_with_confidence_level", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      artifactType:
        resumeState.response && coverState.response
          ? "resume"
          : resumeState.response
            ? "resume"
            : "cover_letter",
      confidence: artifactQuality.confidence,
      artifactScore: artifactQuality.artifactScore,
      missingEvidenceCount: artifactQuality.missingEvidenceCount,
    });
    if (visibleImprovableClaims.length > 0) {
      trackEvent("improve_output_panel_viewed", {
        source: "studio",
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        initialConfidence: artifactQuality.confidence,
        finalConfidence: artifactQuality.confidence,
        artifactScore: artifactQuality.artifactScore,
        improvableClaimCount: visibleImprovableClaims.length,
      });
    }
  }, [
    artifactQuality.artifactScore,
    artifactQuality.confidence,
    artifactQuality.missingEvidenceCount,
    coverState.response,
    effectiveBaselineId,
    effectiveJobId,
    resumeState.response,
    visibleImprovableClaims.length,
  ]);
  useEffect(() => {
    const transition = deriveArtifactConfidenceTransition({
      previous: previousArtifactQualityRef.current,
      next: artifactQuality,
    });
    previousArtifactQualityRef.current = artifactQuality;
    if (!transition) return;
    trackEvent("artifact_regenerated", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      initialConfidence: transition.initialConfidence,
      finalConfidence: transition.finalConfidence,
      artifactScoreDelta: transition.artifactScoreDelta,
    });
    if (!transition.confidenceUpgraded) return;
    setConfidenceUpgradeMessage("Your output is now backed by verified evidence.");
    trackEvent("confidence_upgraded", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      initialConfidence: transition.initialConfidence,
      finalConfidence: transition.finalConfidence,
      artifactScoreDelta: transition.artifactScoreDelta,
    });
  }, [artifactQuality, effectiveBaselineId, effectiveJobId]);
  useEffect(() => {
    if (!confidenceUpgradeMessage) return;
    const timeout = window.setTimeout(() => {
      setConfidenceUpgradeMessage(null);
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [confidenceUpgradeMessage]);
  const hasCompletedGeneration = hasResumeDraft || hasCoverLetterDraft;
  const hasGeneratedDocumentPair =
    resumePresenter.status === "success" &&
    coverPresenter.status === "success" &&
    Boolean(resumeState.response && coverState.response);
  useEffect(() => {
    if (!studioArtifactStorageKey) return;
    if (typeof window === "undefined") return;

    const nextSnapshot: StoredStudioArtifactSnapshot = {
      updatedAt: new Date().toISOString(),
      ...(resumePresenter.status === "success" && hasResumeDraft && resumeState.response
        ? { resumeResponse: resumeState.response }
        : {}),
      ...(coverPresenter.status === "success" && hasCoverLetterDraft && coverState.response
        ? { coverResponse: coverState.response }
        : {}),
    };

    if (!nextSnapshot.resumeResponse && !nextSnapshot.coverResponse) {
      try {
        window.localStorage.removeItem(studioArtifactStorageKey);
      } catch {
        // Best effort only.
      }
      return;
    }

    writeStoredStudioArtifacts(studioArtifactStorageKey, nextSnapshot);
  }, [
    coverPresenter.status,
    coverState.response,
    hasCoverLetterArtifact,
    hasResumeArtifact,
    resumePresenter.status,
    resumeState.response,
    studioArtifactStorageKey,
  ]);
  useEffect(() => {
    if (!studioArtifactsHydrated || !hasCompletedGeneration || !requestedAnalysisId) return;
    if (resumePresenter.status === "success" && resumeState.response) {
      const signature = [
        effectiveBaselineId ?? "none",
        effectiveJobId ?? "none",
        requestedAnalysisId,
        "resume",
        resumeState.response ? "present" : "missing",
      ].join(":");
      if (resumeArtifactViewedSignatureRef.current !== signature) {
        resumeArtifactViewedSignatureRef.current = signature;
        trackEvent("studio_generated_artifact_viewed", {
          source: "studio",
          analysisId: requestedAnalysisId || null,
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          score: analysisScore,
          artifactType: "resume",
          presentationState: artifactViewedPresentationState,
        });
      }
    }
    if (coverPresenter.status === "success" && coverState.response) {
      const signature = [
        effectiveBaselineId ?? "none",
        effectiveJobId ?? "none",
        requestedAnalysisId,
        "cover_letter",
        coverState.response ? "present" : "missing",
      ].join(":");
      if (coverArtifactViewedSignatureRef.current !== signature) {
        coverArtifactViewedSignatureRef.current = signature;
        trackEvent("studio_generated_artifact_viewed", {
          source: "studio",
          analysisId: requestedAnalysisId || null,
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          score: analysisScore,
          artifactType: "cover_letter",
          presentationState: artifactViewedPresentationState,
        });
      }
    }
  }, [
    analysisScore,
    coverPresenter.status,
    coverState.response,
    effectiveBaselineId,
    effectiveJobId,
    hasCompletedGeneration,
    requestedAnalysisId,
    resumePresenter.status,
    resumeState.response,
    studioArtifactsHydrated,
  ]);

  const artifactViewedPresentationState =
    studioArtifactPresentationStateRef.current === "generated"
      ? "generated"
      : "hydrated";
  useEffect(() => {
    if (!documentCritique || !hasCompletedGeneration) return;
    const signature = [
      documentCritique.overallAssessment,
      documentCritique.topIssues.map((issue) => `${issue.type}:${issue.severity}`).join(","),
      documentCritique.recommendedNextAction?.refinementType ?? "none",
    ].join("|");
    const previousSignature = previousCritiqueSignatureRef.current;
    const previousIssues = previousCritiqueIssuesRef.current;

    if (critiquePanelTrackedRef.current !== signature) {
      if (!critiquePanelTrackedRef.current) {
        trackEvent("critique_panel_viewed", {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          overallAssessment: documentCritique.overallAssessment,
          issueCount: documentCritique.topIssues.length,
          hasRecommendedAction: Boolean(documentCritique.recommendedNextAction),
        });
        if (
          documentCritique.overallAssessment === "strong" &&
          !documentCritique.topIssues.some((issue) => issue.severity === "high")
        ) {
          trackEvent("critique_stopping_state_reached", {
            source: "studio",
            baselineId: effectiveBaselineId || null,
            jobId: effectiveJobId || null,
            overallAssessment: documentCritique.overallAssessment,
            issueCount: documentCritique.topIssues.length,
          });
        }
      } else {
        const changedIssueTypes = previousIssues
          .map((issue) => issue.type)
          .filter((issueType) => !documentCritique.topIssues.some((issue) => issue.type === issueType));
        trackEvent("critique_recomputed", {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          overallAssessment: documentCritique.overallAssessment,
          issueCount: documentCritique.topIssues.length,
          changedIssueTypes,
        });

        const resolvedIssues = previousIssues.filter(
          (issue) => !documentCritique.topIssues.some((current) => current.type === issue.type),
        );
        for (const issue of resolvedIssues) {
          trackEvent("critique_issue_resolved", {
            source: "studio",
            baselineId: effectiveBaselineId || null,
            jobId: effectiveJobId || null,
            issueType: issue.type,
            severity: issue.severity,
          });
        }

        if (
          documentCritique.overallAssessment === "strong" &&
          !documentCritique.topIssues.some((issue) => issue.severity === "high")
        ) {
          trackEvent("critique_stopping_state_reached", {
            source: "studio",
            baselineId: effectiveBaselineId || null,
            jobId: effectiveJobId || null,
            overallAssessment: documentCritique.overallAssessment,
            issueCount: documentCritique.topIssues.length,
          });
        }
      }
      critiquePanelTrackedRef.current = signature;
      previousCritiqueSignatureRef.current = signature;
      previousCritiqueIssuesRef.current = documentCritique.topIssues;
      return;
    }

    if (previousSignature !== signature) {
      previousCritiqueSignatureRef.current = signature;
      previousCritiqueIssuesRef.current = documentCritique.topIssues;
    }
  }, [documentCritique, effectiveBaselineId, effectiveJobId, hasCompletedGeneration]);
  useEffect(() => {
    if (!roleMatchFinalPass || !hasGeneratedDocumentPair) return;
    if (finalRoleCheckTrackedRef.current === roleMatchFinalSignature) {
      return;
    }
    finalRoleCheckTrackedRef.current = roleMatchFinalSignature;
    trackEvent("final_role_check_viewed", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      overallMatchReadiness: roleMatchFinalPass.overallMatchReadiness,
      priorityCoverageCount: roleMatchFinalPass.priorityCoverage.length,
      recruiterScanRiskCount: roleMatchFinalPass.recruiterScanRisks.length,
      hasRecommendedAdjustments: roleMatchFinalPass.recommendedFinalAdjustments.length > 0,
    });
    if (
      roleMatchFinalPass.overallMatchReadiness === "ready" &&
      roleMatchFinalPass.recommendedFinalAdjustments.length === 0
    ) {
      trackEvent("final_role_check_passed", {
        source: "studio",
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        overallMatchReadiness: roleMatchFinalPass.overallMatchReadiness,
        priorityCoverageCount: roleMatchFinalPass.priorityCoverage.length,
      });
    }
  }, [effectiveBaselineId, effectiveJobId, hasGeneratedDocumentPair, roleMatchFinalPass, roleMatchFinalSignature]);
  const studioGenerationRenderState = useMemo(() => {
    const isGenerating = pairWorkflowState.pairStatus === "generating";
    const artifactType =
      pairWorkflowState.coverLetterStatus === "ready" || pairWorkflowState.coverLetterStatus === "generating"
        ? "cover_letter"
        : pairWorkflowState.resumeStatus === "ready" || pairWorkflowState.resumeStatus === "generating"
          ? "resume"
          : null;
    const shouldShowTrustSummary =
      pairWorkflowState.canGenerate && (pairWorkflowState.resumeStatus === "ready" || pairWorkflowState.coverLetterStatus === "ready");
    return {
      isBlocked: !pairWorkflowState.canGenerate,
      isReady: pairWorkflowState.canGenerate,
      isFromUnlock,
      isFirstGenerationAfterUnlock,
      isGenerating,
      hasGenerated: pairWorkflowState.pairStatus === "generated",
      artifactType,
      shouldShowTrustSummary,
      shouldShowUnlockEntry: isFromUnlock,
      shouldShowEnhancedLoadingCopy: isFromUnlock && isGenerating && !hasGeneratedOnce,
    };
  }, [
    hasGeneratedOnce,
    isFirstGenerationAfterUnlock,
    isFromUnlock,
    pairWorkflowState.canGenerate,
    pairWorkflowState.coverLetterStatus,
    pairWorkflowState.pairStatus,
    pairWorkflowState.resumeStatus,
  ]);
  const unlockGenerationLoadingMessage = studioGenerationRenderState.shouldShowEnhancedLoadingCopy
    ? "Generating from your verified evidence..."
    : null;
  const autoGenerationLoadingMessage =
    autoGenerationInFlight && !hasCompletedGeneration ? "Generating your documents..." : null;
  const generationStorageKey = useMemo(
    () => getGenerationCompletionStorageKey(effectiveJobId, effectiveBaselineId),
    [effectiveBaselineId, effectiveJobId],
  );
  useEffect(() => {
    if (typeof window === "undefined" || !generationStorageKey) return;
    const storage = window.localStorage as
      | { setItem?: (key: string, value: string) => void; removeItem?: (key: string) => void }
      | undefined;
    if (!storage?.setItem || !storage?.removeItem) return;
    if (hasCompletedGeneration) {
      storage.setItem(generationStorageKey, "true");
      return;
    }
    storage.removeItem(generationStorageKey);
  }, [generationStorageKey, hasCompletedGeneration]);

  const applicationPairSignature = useMemo(() => {
    if (!effectiveBaselineId || !effectiveJobId) return null;
    return buildWorkflowRequestKey("application_pair", {
      baselineId: effectiveBaselineId,
      jobId: effectiveJobId,
    });
  }, [effectiveBaselineId, effectiveJobId]);

  const applicationJobUrl = useMemo(() => {
    const candidate =
      selectedJob?.sourceUrl ??
      applicationContext?.jobUrl ??
      applicationContext?.sourceUrl ??
      null;
    return typeof candidate === "string" && candidate.trim().length ? candidate.trim() : null;
  }, [applicationContext?.jobUrl, applicationContext?.sourceUrl, selectedJob?.sourceUrl]);

  const applicationStatus = applicationContext?.status?.toLowerCase() ?? null;
  const isApplicationApplied = applicationStatus === "applied";
  const nextRoleHref = useMemo(() => {
    const params = new URLSearchParams();
    if (effectiveBaselineId) {
      params.set("baselineId", effectiveBaselineId);
    }
    params.set("entry", "studio_post_apply");
    const query = params.toString();
    return query ? `/target?${query}` : "/target";
  }, [effectiveBaselineId]);

  useEffect(() => {
    if (!studioArtifactsHydrated) {
      return;
    }
    const progressSignature = `applications:${effectiveBaselineId ?? "none"}:${effectiveJobId ?? "none"}`;
    if (applicationProgressLoadSignatureRef.current === progressSignature) {
      return;
    }
    applicationProgressLoadSignatureRef.current = progressSignature;
    let cancelled = false;
    setApplicationProgressLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/applications", {
          cache: "no-store",
        });
        const payload = await readResponsePayload(response);
        if (cancelled) return;
        if (!response.ok || !Array.isArray(payload)) {
          setApplicationProgress(null);
          return;
        }
        const records = payload
          .map((record) => {
            if (!record || typeof record !== "object") return null;
            const candidate = record as Record<string, unknown>;
            const id = typeof candidate.id === "string" ? candidate.id : "";
            if (!id) return null;
            const status = typeof candidate.status === "string" ? candidate.status : "Unknown";
            const appliedAt =
              typeof candidate.appliedAt === "string"
                ? candidate.appliedAt
                : typeof candidate.appliedDate === "string"
                  ? candidate.appliedDate
                  : null;
            const updatedAt =
              typeof candidate.lastTouchedAt === "string"
                ? candidate.lastTouchedAt
                : typeof candidate.updatedAt === "string"
                  ? candidate.updatedAt
                  : new Date().toISOString();
            return {
              id,
              company:
                typeof candidate.company === "string" ? candidate.company : "Unknown company",
              title: typeof candidate.title === "string" ? candidate.title : "Untitled role",
              status,
              updatedAt,
              appliedAt,
            };
          })
          .filter(
            (
              record,
            ): record is {
              id: string;
              company: string;
              title: string;
              status: string;
              updatedAt: string;
              appliedAt: string | null;
            } => Boolean(record),
          )
          .sort((left, right) => {
            const leftTime = new Date(left.updatedAt).getTime();
            const rightTime = new Date(right.updatedAt).getTime();
            return rightTime - leftTime;
          });
        const completedApplicationsCount = records.filter(
          (record) => record.status.toLowerCase() === "applied",
        ).length;
        setApplicationProgress({
          totalApplicationsCount: records.length,
          completedApplicationsCount,
          recentActivity: records.slice(0, 3),
        });
      } catch {
        if (!cancelled) {
          setApplicationProgress(null);
        }
      } finally {
        if (!cancelled) {
          setApplicationProgressLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveBaselineId, effectiveJobId, studioArtifactsHydrated]);

  useEffect(() => {
    if (!applicationPairSignature || !studioArtifactsHydrated) {
      setApplicationContext(null);
      return;
    }
    if (applicationPairSignatureRef.current === applicationPairSignature) {
      return;
    }
    let cancelled = false;
    applicationPairSignatureRef.current = applicationPairSignature;
    setApplicationPairLoading(true);
    setApplicationActionMessage(null);

    void (async () => {
      try {
        const params = new URLSearchParams();
        if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
        if (effectiveJobId) params.set("jobId", effectiveJobId);
        const response = await fetch(`/api/applications/pair?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await readResponsePayload(response);
        if (cancelled) return;
        if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
          setApplicationContext(null);
          return;
        }
        const record = payload as Record<string, unknown>;
        setApplicationContext({
          id: typeof record.id === "string" ? record.id : "",
          status: typeof record.status === "string" ? record.status : "Ready",
          appliedAt:
            typeof record.appliedAt === "string"
              ? record.appliedAt
              : typeof record.appliedDate === "string"
                ? record.appliedDate
                : null,
          lastTouchedAt:
            typeof record.lastTouchedAt === "string" ? record.lastTouchedAt : new Date().toISOString(),
          baselineId: typeof record.baselineId === "string" ? record.baselineId : null,
          jobId: typeof record.jobId === "string" ? record.jobId : null,
          jobUrl: typeof record.jobUrl === "string" ? record.jobUrl : null,
          notes: typeof record.notes === "string" ? record.notes : null,
          sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null,
          createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
          resumeArtifacts: Array.isArray(record.resumeArtifacts)
            ? record.resumeArtifacts
                .map((artifact) => {
                  if (!artifact || typeof artifact !== "object") return null;
                  const candidate = artifact as Record<string, unknown>;
                  const resumeArtifactId =
                    typeof candidate.resumeArtifactId === "string"
                      ? candidate.resumeArtifactId
                      : "";
                  if (!resumeArtifactId) return null;
                  return {
                    resumeArtifactId,
                    type: candidate.type === "cover" ? "cover" : "resume",
                    createdAt:
                      typeof candidate.createdAt === "string"
                        ? candidate.createdAt
                        : new Date().toISOString(),
                    exportFormat:
                      typeof candidate.exportFormat === "string"
                        ? candidate.exportFormat
                        : null,
                  } as StudioApplicationArtifactRecord;
                })
                .filter(
                  (artifact): artifact is StudioApplicationArtifactRecord => Boolean(artifact),
                )
            : [],
        });
      } catch {
        if (!cancelled) {
          setApplicationContext(null);
        }
      } finally {
        if (!cancelled) {
          setApplicationPairLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applicationPairSignature, effectiveBaselineId, effectiveJobId, studioArtifactsHydrated]);

  useEffect(() => {
    if (!applicationPairSignature) return;
    if (!hasCompletedGeneration || !canGenerateDocuments || !qualifiedForGeneration) return;
    if (applicationContext?.status?.toLowerCase() === "applied") return;

    const ensureSignature = `${applicationPairSignature}:${applicationContext?.status ?? "missing"}:${hasCompletedGeneration}`;
    if (applicationUpsertSignatureRef.current === ensureSignature) return;
    applicationUpsertSignatureRef.current = ensureSignature;

    let cancelled = false;

    void (async () => {
      try {
        const pairUrl = applicationJobUrl;
        const response = await fetch("/api/applications/pair", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baselineId: effectiveBaselineId,
            jobId: effectiveJobId,
            companyName:
              selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? "Unknown company",
            roleTitle: selectedJob?.title ?? analysis?.jobTitle ?? analysis?.title ?? "Untitled role",
            jobUrl: pairUrl,
            sourceUrl: pairUrl,
            externalApplicationUrl: pairUrl,
            analysisId: requestedAnalysisId || null,
            baselineVersionId: effectiveBaselineVersionId || null,
            applicationStatus: "Ready",
            fitScore: Math.round(analysisScore ?? 0),
            resumeArtifactId:
              readTrackerField(resumeState.response, "audit_id") ??
              readTrackerField(resumeState.response, "auditId") ??
              null,
            resumeArtifactType: "resume",
            resumeArtifactFormat: "docx",
          }),
        });
        const payload = await readResponsePayload(response);
        if (cancelled) return;
        if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
          return;
        }
        const record = payload as Record<string, unknown>;
        const nextStatus = typeof record.status === "string" ? record.status : "Ready";
        const previousStatus = applicationContext?.status ?? null;
        setApplicationContext((current) => ({
          id: typeof record.id === "string" ? record.id : current?.id ?? "",
          status: nextStatus,
          appliedAt:
            typeof record.appliedAt === "string"
              ? record.appliedAt
              : typeof record.appliedDate === "string"
                ? record.appliedDate
                : current?.appliedAt ?? null,
          lastTouchedAt:
            typeof record.lastTouchedAt === "string"
              ? record.lastTouchedAt
              : current?.lastTouchedAt ?? new Date().toISOString(),
          baselineId:
            typeof record.baselineId === "string" ? record.baselineId : current?.baselineId ?? null,
          jobId: typeof record.jobId === "string" ? record.jobId : current?.jobId ?? null,
          jobUrl: typeof record.jobUrl === "string" ? record.jobUrl : current?.jobUrl ?? null,
          notes: typeof record.notes === "string" ? record.notes : current?.notes ?? null,
          sourceUrl:
            typeof record.sourceUrl === "string" ? record.sourceUrl : current?.sourceUrl ?? null,
          createdAt:
            typeof record.createdAt === "string"
              ? record.createdAt
              : current?.createdAt ?? new Date().toISOString(),
          updatedAt:
            typeof record.updatedAt === "string"
              ? record.updatedAt
              : current?.updatedAt ?? new Date().toISOString(),
          resumeArtifacts: current?.resumeArtifacts ?? [],
        }));
        trackEvent("application_created_or_upserted", {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          currentStatus: nextStatus,
          created: !Boolean(previousStatus),
          score: analysisScore,
        });
        if (previousStatus?.toLowerCase() !== nextStatus.toLowerCase()) {
          trackEvent("application_status_updated", {
            source: "studio",
            baselineId: effectiveBaselineId || null,
            jobId: effectiveJobId || null,
            currentStatus: nextStatus,
            previousStatus,
            score: analysisScore,
          });
        }
      } catch {
        // Best effort only.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    analysis?.company,
    analysis?.companyName,
    analysis?.jobTitle,
    analysis?.title,
    analysisScore,
    applicationContext?.status,
    applicationJobUrl,
    applicationPairSignature,
    canGenerateDocuments,
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    hasCompletedGeneration,
    qualifiedForGeneration,
    requestedAnalysisId,
    resumeState.response,
    selectedJob?.company,
    selectedJob?.title,
    studioArtifactsHydrated,
  ]);

  const fitReviewHref = productDecisionState.fitReviewHref;
  const resultsHref = productDecisionState.resultsHref;
  const remediationHref = `${resultsHref}#advanced-insights`;
  const studioCanonicalDecision = productDecisionState.canonicalDecision;
  const primaryNextAction = studioCanonicalDecision.primaryAction;
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEBUG_STUDIO_FLOW !== "true") {
      return;
    }
    if (!analysis || !requestedAnalysisId) return;
    const readinessState = studioCanonicalDecision.readinessState;
    const workflowState = studioCanonicalDecision.workflowState;
    const ctaHref = studioCanonicalDecision.primaryAction.destination;
    const analyticsPayload: {
      state: "READY" | "LIMITED" | "BLOCKED";
      score: number | null;
      blockerCount: number;
    } = {
      state:
        readinessState === "READY"
          ? "READY"
          : readinessState === "LIMITED"
            ? "LIMITED"
            : "BLOCKED",
      score: analysisScore,
      blockerCount: activeGenerationReadiness.verificationIssues.length,
    };
    const decisionKey = [
      requestedAnalysisId,
      effectiveBaselineId ?? "none",
      effectiveJobId ?? "none",
      workflowState,
      primaryNextAction.type,
      ctaHref,
      analysisScore ?? "none",
    ].join(":");
    if (studioDecisionLogKeyRef.current === decisionKey) return;
    studioDecisionLogKeyRef.current = decisionKey;

    trackEvent("studio_generation_state_viewed", analyticsPayload);
    const legacyFallbackAttempted = ctaHref.startsWith("/resolve-gaps");
    logDecisionFlowEvent({
      event: "studio_generation_readiness_resolved",
      entrySource,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      pairKey: studioCanonicalDecision.pairKey,
      score: analysisScore,
      readinessState,
      contractSource: "resolveCanonicalState",
      ctaLabel: primaryNextAction.label,
      ctaHref,
      resolvedRoute: ctaHref,
      legacyFallbackAttempted,
      legacyFallbackBlocked: legacyFallbackAttempted ? ctaHref.startsWith("/fit-review") : true,
      actionType: primaryNextAction.type,
      analyticsPayload,
      dataSource: "mixed",
      persistedAssessmentId: requestedAnalysisId || null,
    });
  }, [
    activeGenerationReadiness.verificationIssues.length,
    analysis,
    analysisScore,
    canGenerateDocuments,
    effectiveBaselineId,
    effectiveJobId,
    effectiveBaselineVersionId,
    isFromUnlock,
    studioCanonicalDecision.primaryAction.destination,
    primaryNextAction.label,
    primaryNextAction.type,
    remediationHref,
    requestedAnalysisId,
    entrySource,
    studioCanonicalDecision.workflowState,
  ]);
  const studioBlockedByNextAction = primaryNextAction.type === "start_fit_review";
  // Important: do not auto-redirect based on legacy `primaryNextAction` here.
  // Redirecting to Results/Fit Review while Studio can still render (or auto-generate) creates Results <-> Studio loops.
  const evidenceLedger = useMemo(
    () =>
      deriveEvidenceLedger(analysis, {
        generationAllowed: primaryNextAction.type !== "start_fit_review",
      }),
    [analysis, primaryNextAction.type],
  );
  useEffect(() => {
    if (!isGuidedActive) return;
    if (primaryNextAction.type !== "start_fit_review") {
      advanceStep("GENERATE");
    }
  }, [advanceStep, isGuidedActive, primaryNextAction.type]);
  const canExportCover =
    canExportDocuments &&
    coverPresenter.status === "success" &&
    hasCoverLetterArtifact &&
    !coverLetterComplianceBlocked &&
    coverLetterQuality.exportable;
  const showCoverDownloadActions =
    Boolean(coverLetterComplianceBlocked) ||
    coverPresenter.status === "blocked" ||
    (coverPresenter.status === "success" && hasCoverLetterArtifact);
  const fullBaselineEvidence = useMemo(() => {
    if (typeof analysis?.summary === "string" && analysis.summary.trim().length) {
      return sanitizeRenderedTextValue(analysis.summary, {
        endpoint: "studio-page",
        field: "analysis.summary",
      });
    }
    return "Evidence is derived from your latest role analysis and baseline signals.";
  }, [analysis?.summary]);
  const evidenceSummaryBullets = useMemo(() => {
    const items = collectEvidenceItems(analysis);
    if (items.length) {
      return items;
    }
    if (hasLoadedAnalysis) {
      return ["Baseline evidence loaded for this role analysis."];
    }
    return [];
  }, [analysis, hasLoadedAnalysis]);
  const generationMessage = useMemo(() => {
    if (!requestedAnalysisId) {
      return "Run a role compatibility analysis first.";
    }
    if (analysisError) {
      return ANALYSIS_LOAD_ERROR_MESSAGE;
    }
    if (!canGenerateDocuments) {
      return (
        activeGenerationReadiness.reasons[0]?.message ??
        "This role scored strongly, but your selected resume does not support compliant generation yet."
      );
    }
    if (analysisScore === null) {
      return "Fit score is unavailable for this role analysis.";
    }
    return null;
  }, [
    analysisError,
    analysisScore,
    effectiveBaselineVersionId,
    activeGenerationReadiness.reasons,
    requestedAnalysisId,
    canGenerateDocuments,
  ]);
  useEffect(() => { 
    setRecentIntent(readRecentIntentState()); 
  }, [requestedAnalysisId, effectiveJobId, effectiveBaselineId]); 
  const canProceedWithStudioDrafts =
    qualifiedForGeneration && activeGenerationReadiness.status === "ready"; 
  const isInstantDraftExperience = canProceedWithStudioDrafts; 
  const resumeSingleFlightInFlight = useMemo(
    () =>
      isStudioArtifactSingleFlightInFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType: "resume",
      }),
    [effectiveBaselineId, effectiveJobId, requestedAnalysisId],
  );
  const coverSingleFlightInFlight = useMemo(
    () =>
      isStudioArtifactSingleFlightInFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType: "cover_letter",
      }),
    [effectiveBaselineId, effectiveJobId, requestedAnalysisId],
  );
  const needsAutoGeneration =
    generateNowEligible &&
    isInstantDraftExperience &&
    Boolean(effectiveBaselineVersionId) &&
    !hasCompletedGeneration &&
    studioArtifactPairStatus === "missing" &&
    !resumeState.response &&
    !coverState.response &&
    !resumeState.artifactFailure &&
    !coverState.artifactFailure &&
    !resumeSingleFlightInFlight &&
    !coverSingleFlightInFlight;
  const autoGenerationSignature = useMemo(() => {
    if (!needsAutoGeneration) return null;
    return buildWorkflowRequestKey("auto_generation", generationWorkflowScope);
  }, [generationWorkflowScope, needsAutoGeneration]);
  const resumeAutoGenerating =
  generateNowEligible &&
  !activeGenerationReadiness.blocked &&
  !hasResumeArtifact &&
  !resumeState.artifactFailure &&
  (resumeGenerating ||
    resumeSingleFlightInFlight ||
    autoGenerationInFlight ||
    studioArtifactPairStatus === "in_progress");
  const coverAutoGenerating =
  generateNowEligible &&
  !activeGenerationReadiness.blocked &&
  !hasCoverLetterArtifact &&
  !coverState.artifactFailure &&
  (coverGenerating ||
    coverSingleFlightInFlight ||
    autoGenerationInFlight ||
    studioArtifactPairStatus === "in_progress");
  // Pending state reflects an explicit generation start, not auto-generation eligibility alone.
  const resumeGenerateNowPending =
  generateNowEligible &&
  !activeGenerationReadiness.blocked &&
  Boolean(effectiveBaselineVersionId) &&
  !hasResumeArtifact &&
  !resumeState.response &&
  !resumeState.error &&
  !resumeState.artifactFailure &&
  (resumeGenerating || resumeSingleFlightInFlight || autoGenerationInFlight);

  const coverGenerateNowPending =
  generateNowEligible &&
  !activeGenerationReadiness.blocked &&
  Boolean(effectiveBaselineVersionId) &&
  !hasCoverLetterArtifact &&
  !coverState.response &&
  !coverState.error &&
  !coverState.artifactFailure &&
  (coverGenerating || coverSingleFlightInFlight || autoGenerationInFlight);
  useEffect(() => {
    if (!hasCompletedGeneration || !isInstantDraftExperience || !applicationContext) return;
    const signature = `${applicationPairSignature ?? "application_pair"}:${applicationContext.status}`;
    if (applicationReadyViewedSignatureRef.current === signature) return;
    applicationReadyViewedSignatureRef.current = signature;
    trackEvent("studio_application_ready_viewed", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
      currentStatus: applicationContext.status,
      totalApplicationsCount: applicationProgress?.totalApplicationsCount ?? null,
    });
  }, [
    analysisScore,
    applicationContext,
    applicationPairSignature,
    effectiveBaselineId,
    effectiveJobId,
    applicationProgress?.totalApplicationsCount,
    hasCompletedGeneration,
    isInstantDraftExperience,
    requestedAnalysisId,
  ]);

  useEffect(() => {
    if (!applicationProgress || !studioArtifactsHydrated) return;
    const signature = `${effectiveBaselineId ?? "none"}:${effectiveJobId ?? "none"}`;
    if (applicationProgressViewedSignatureRef.current === signature) return;
    applicationProgressViewedSignatureRef.current = signature;
    trackEvent("application_progress_viewed", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
      totalApplicationsCount: applicationProgress.totalApplicationsCount,
      completedApplicationsCount: applicationProgress.completedApplicationsCount,
      recentActivityCount: applicationProgress.recentActivity.length,
    });
  }, [
    analysisScore,
    applicationProgress,
    effectiveBaselineId,
    effectiveJobId,
    requestedAnalysisId,
    studioArtifactsHydrated,
  ]);

  useEffect(() => {
    if (!hasCompletedGeneration || !isInstantDraftExperience || !isApplicationApplied || !applicationContext) {
      return;
    }
    const signature = `${applicationPairSignature ?? "application_pair"}:${applicationContext.status}`;
    if (applicationCompletedViewedSignatureRef.current === signature) return;
    applicationCompletedViewedSignatureRef.current = signature;
    trackEvent("studio_application_completed_viewed", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
      currentStatus: applicationContext.status,
      totalApplicationsCount: applicationProgress?.totalApplicationsCount ?? null,
    });
  }, [
    analysisScore,
    applicationContext,
    applicationPairSignature,
    applicationProgress?.totalApplicationsCount,
    effectiveBaselineId,
    effectiveJobId,
    hasCompletedGeneration,
    isApplicationApplied,
    isInstantDraftExperience,
    requestedAnalysisId,
  ]);
  const completionCopy = useMemo(() => {
    if (workflowAuthority.workflowState === "REVIEW_REQUIRED") {
      if (recentIntent === "used_and_committed") {
        return {
          title: "Draft used and tracked",
          body: "Your export is grounded in verified baseline evidence and the role is now saved for follow-through.",
          nextStep: "Keep tracking momentum in Opportunities",
        };
      }
      if (recentIntent === "used_not_committed") {
        return {
          title: "Draft ready to use",
          body: "Your export is grounded in verified baseline evidence. Save the role if you want to keep momentum.",
          nextStep: "Save this role to Opportunities when you're ready",
        };
      }
      return {
        title: "Draft ready to review",
        body: "This draft is grounded in verified baseline evidence and matches the Studio view you reviewed.",
        nextStep: "Use it now or sharpen it later",
      };
    }
    if (workflowAuthority.workflowState === "BLOCKED") {
      return {
        title: "Generation blocked",
        body: "Return to Fit Review to strengthen verified evidence before trying again.",
        nextStep: "Strengthen baseline first",
      };
    }
    if (recentIntent === "used_and_committed") {
      return {
        title: "Your export is ready and tracked",
        body: "Built from verified baseline evidence and saved to Opportunities for follow-through.",
        nextStep: "Keep momentum in Opportunities",
      };
    }
    if (recentIntent === "used_not_committed") {
      return {
        title: "Your export is ready",
        body: "Built from verified baseline evidence and aligned to the role as currently supported.",
        nextStep: "Save this role to Opportunities to keep momentum",
      };
    }
    if (recentIntent === "refine_intent") {
      return {
        title: "Your export is ready",
        body: "Built from verified baseline evidence. You can use it now and refine later if you want a sharper version.",
        nextStep: "Strengthen the baseline when you're ready",
      };
    }
    return {
      title: "Your export is ready",
      body: "Built from verified baseline evidence and aligned to the role as currently supported.",
      nextStep: "Use this for your next application",
    };
  }, [recentIntent, workflowAuthority.workflowState]);
  const prioritizedStrengtheningSuggestions = useMemo(() => {
    if (
      workflowAuthority.workflowState === "READY" &&
      recentIntent !== "refine_intent" &&
      recentIntent !== "used_not_committed"
    ) {
      return [];
    }
    const tips = [
      {
        requirement: "Measurable outcomes",
        action: "Add measurable outcomes to the most relevant experience.",
        rationale: "Quantified impact is the fastest way to strengthen this draft.",
        nextStep: "Run Fit Review to capture supported evidence.",
        priority: 1,
      },
      {
        requirement: "Leadership scope",
        action: "Clarify team size, ownership, or org scope.",
        rationale: "Leadership scope is a major fit signal for this role.",
        nextStep: "Add one verified example from your baseline.",
        priority: 2,
      },
      {
        requirement: "Operational depth",
        action: "Expand incident management or escalation examples.",
        rationale: "Operational depth is still under-supported here.",
        nextStep: "Use Fit Review to strengthen the missing evidence.",
        priority: 3,
      },
      {
        requirement: "Tooling coverage",
        action: "Clarify exposure to the key tools or platforms in this role.",
        rationale: "The role expects clearer tooling coverage.",
        nextStep: "Keep only verified experience in the baseline.",
        priority: 4,
      },
    ];
    return tips.slice(0, recentIntent === "used_not_committed" ? 2 : 4);
  }, [recentIntent, workflowAuthority.workflowState]);

  const generationInputSignature = useMemo(() => {
    return JSON.stringify({
      baselineId: effectiveBaselineId ?? null,
      baselineVersionId: effectiveBaselineVersionId ?? null,
      jobId: effectiveJobId ?? null,
      analysisId: requestedAnalysisId ?? null,
      resumeFocus,
      excludedRequirements: Array.from(excludedTargetingLabels).sort(),
      strategyRoleGoal: documentStrategyPlan?.summaryStrategy ?? null,
    });
  }, [
    documentStrategyPlan?.summaryStrategy,
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    excludedTargetingLabels,
    requestedAnalysisId,
    resumeFocus,
  ]);
  const lastFailureSignatureRef = useRef<string | null>(null);
  const inputsChangedSinceLastFailure = useMemo(() => {
    if (!lastFailureSignatureRef.current) return true;
    return lastFailureSignatureRef.current !== generationInputSignature;
  }, [generationInputSignature]);
  const canRetryGeneration = inputsChangedSinceLastFailure;

  const resumeGating = useMemo(
    () =>
      resolveStudioArtifactGating({
        artifactType: "resume",
        score: analysisScore ?? null,
        readiness: activeGenerationReadiness,
        responsePresent: Boolean(resumeState.response),
        generating: resumeGenerating || autoGenerationInFlight,
        hasFailure: Boolean(resumeState.error || resumeState.artifactFailure),
        tierGateError: resumeState.tierGateError,
      }),
    [
      autoGenerationInFlight,
      activeGenerationReadiness,
      resumeGenerating,
      resumeState.artifactFailure,
      resumeState.error,
      resumeState.response,
      resumeState.tierGateError,
    ],
  ); 
  const isLowQualityDraft = hasCompletedGeneration && artifactQuality.confidence === "LOW"; 
  const isMediumQualityDraft = hasCompletedGeneration && artifactQuality.confidence === "MEDIUM"; 
  const isHighQualityDraft = hasCompletedGeneration && artifactQuality.confidence === "HIGH"; 
  // Low-confidence is still a signal, but score >= 80 must not block or degrade access to usable artifacts.
  const showLowQualityRecoveryLane = isLowQualityDraft && !generateNowEligible;
  const hasUsableResume = artifactContract.hasResumeArtifact;
  const hasUsableCoverLetter = artifactContract.hasCoverLetterArtifact;
  // Canonical READY truth: if we have any usable output, behave as READY. Confidence only modulates tone.
  const isReadySuccessState = hasUsableResume || hasUsableCoverLetter;
  const isApplicationFullyReady = hasUsableResume && hasUsableCoverLetter;
  const suppressAutoGenerationForGenerationReadyShell = false;
  const [showFullLowQualityResume, setShowFullLowQualityResume] = useState(false); 
  const [showFullLowQualityCover, setShowFullLowQualityCover] = useState(false); 
  const [showOptionalEvidenceDetails, setShowOptionalEvidenceDetails] = useState(false);
  const [allowStaleArtifactPreview, setAllowStaleArtifactPreview] = useState(false);

  useEffect(() => { 
    setShowFullLowQualityResume(false); 
    setShowFullLowQualityCover(false); 
    setShowOptionalEvidenceDetails(false);
    setAllowStaleArtifactPreview(false);
  }, [effectiveBaselineId, effectiveJobId, artifactQuality.confidence, requestedAnalysisId]); 
  const coverGating = useMemo(
    () =>
      resolveStudioArtifactGating({
        artifactType: "cover_letter",
        score: analysisScore ?? null,
        readiness: activeGenerationReadiness,
        responsePresent: Boolean(coverState.response),
        generating: coverGenerating || autoGenerationInFlight,
        hasFailure: Boolean(coverState.error || coverState.artifactFailure),
        tierGateError: coverState.tierGateError,
      }),
    [
      autoGenerationInFlight,
      coverGenerating,
      coverState.artifactFailure,
      coverState.error,
      coverState.response,
      coverState.tierGateError,
      activeGenerationReadiness,
    ],
  );

  const isCoverFailureRetryEligible = useMemo(() => {
    const failure = coverState.artifactFailure;
    if (!failure) return false;

    // Never retry into a readiness block (e.g., insufficient verified evidence).
    if (coverGating.primaryBlocker === "readiness_block") return false;

    // Only allow retries for transient/system-ish failures.
    const retryableCategories: StudioArtifactFailurePresentation["category"][] = [
      "generation_failed",
      "generation_timeout",
      "invalid_pair_state",
    ];
    return failure.retryable && retryableCategories.includes(failure.category);
  }, [coverGating.primaryBlocker, coverState.artifactFailure]);

  const isCoverFailureNonRetryable = useMemo(() => {
    const failure = coverState.artifactFailure;
    if (!failure) return false;
    if (coverGating.primaryBlocker === "readiness_block") return true;
    const nonRetryableCategories: StudioArtifactFailurePresentation["category"][] = [
      "generation_blocked",
      "insufficient_verified_evidence",
      "unsupported_input",
    ];
    return nonRetryableCategories.includes(failure.category) || !failure.retryable;
  }, [coverGating.primaryBlocker, coverState.artifactFailure]);

  const guardGenerationAction = useCallback(
    (
      documentType: "resume" | "cover_letter" | "application",
      opts?: { allowVerifiedOnlyFallback?: boolean },
    ) => {
      if (!effectiveBaselineId || !effectiveJobId) {
        trackEvent("studio_generate_blocked", {
          score: analysisScore,
          blockerCodes: ["missing_pair_selection"],
          documentType,
        });
        return false;
      }
      if (documentType === "cover_letter" && !isPro) {
        setCoverState((current) => ({
          ...current,
          tierGateError:
            current.tierGateError ??
            ({
              message: "This feature is available on the Pro plan.",
              requiredTier: SubscriptionTier.Pro,
              currentTier: SubscriptionTier.Free,
              code: "TIER_GATED",
              status: 403,
            } satisfies TierGateError),
        }));
        trackEvent("studio_generate_blocked", {
          score: analysisScore,
          blockerCodes: ["tier_gate"],
          documentType,
        });
        return false;
      }
      if (activeGenerationReadiness.blocked) {
        if (opts?.allowVerifiedOnlyFallback && shouldGenerateDocuments(analysisScore)) {
          return true;
        }
        trackEvent("studio_generate_blocked", {
          score: analysisScore,
          blockerCodes: generationBlockerCodes,
          documentType,
        });
        void router.push(remediationHref);
        return false;
      }
      return true;
    },
    [
      analysisScore,
      activeGenerationReadiness.blocked,
      effectiveBaselineId,
      effectiveBaselineVersionId,
      effectiveJobId,
      generationBlockerCodes,
      remediationHref,
      router,
      trackEvent,
    ],
  );
  const createRequestId = useCallback(
    () =>
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    [],
  );
  const beginStudioGenerationRequest = useCallback(
    (documentType: "resume" | "cover_letter", requestScope: WorkflowRequestScope) => {
      const requestKey = buildWorkflowRequestKey(documentType, requestScope);
      if (!requestKey) return null;
      if (activeGenerationRequestKeysRef.current.has(requestKey)) {
        logWorkflowRequestEvent("duplicate_request_ignored", {
          action: documentType,
          expected: requestScope,
          current: currentWorkflowScopeRef.current,
          reason: "same pair and action already in flight",
          source: "studio",
        });
        return null;
      }

      const requestId = createRequestId();
      activeGenerationRequestKeysRef.current.add(requestKey);
      if (documentType === "resume") {
        activeResumeGenerationRef.current = { requestId, requestKey };
      } else {
        activeCoverGenerationRef.current = { requestId, requestKey };
      }
      currentWorkflowScopeRef.current = requestScope;
      logWorkflowRequestEvent("request_started", {
        action: documentType,
        expected: requestScope,
        current: currentWorkflowScopeRef.current,
        requestId,
        source: "studio",
      });
      return { requestId, requestKey };
    },
    [createRequestId],
  );
  const finishStudioGenerationRequest = useCallback(
    (
      documentType: "resume" | "cover_letter",
      request: { requestId: string; requestKey: string } | null,
      status: "completed" | "failed" | "timeout" | "blocked",
      requestScope: WorkflowRequestScope,
    ) => {
      if (!request) return;
      const activeRef = documentType === "resume" ? activeResumeGenerationRef : activeCoverGenerationRef;
      const activeRequest = activeRef.current;
      if (activeRequest?.requestId === request.requestId && activeRequest.requestKey === request.requestKey) {
        activeRef.current = null;
      }
      activeGenerationRequestKeysRef.current.delete(request.requestKey);
      logWorkflowRequestEvent(
        status === "completed"
          ? "request_completed"
          : status === "timeout"
            ? "request_timeout"
            : status === "blocked"
              ? "request_blocked"
              : "request_failed",
        {
          action: documentType,
          expected: requestScope,
          current: currentWorkflowScopeRef.current,
          requestId: request.requestId,
          reason:
            status === "blocked"
              ? "request blocked before commit"
              : status === "timeout"
                ? "generation timed out"
                : status === "completed"
                  ? "generation completed"
                  : "generation failed",
          source: "studio",
        },
      );
    },
    [],
  );
  const recommendedResumeFocus: ResumeFocusOption = "Operational Leadership";
  const resumeFocusDefinitions: Array<{ value: ResumeFocusOption; label: string; definition: string }> = useMemo(
    () => [
      {
        value: "Auto (recommended)",
        label: "Auto",
        definition: "Uses the default generation mix for this role.",
      },
      {
        value: "Operational Leadership",
        label: "Leadership emphasis",
        definition: "Prioritizes people leadership, ownership, and scope.",
      },
      {
        value: "Technical Depth",
        label: "Technical depth",
        definition: "Optional: highlights systems, platforms, and implementation depth.",
      },
      {
        value: "Customer Experience Strategy",
        label: "Customer strategy",
        definition: "Emphasizes customer outcomes and experience leadership.",
      },
      {
        value: "Scaling Operations",
        label: "Operational execution",
        definition: "Focuses on delivery, scaling, and process ownership.",
      },
    ],
    [],
  );
  const hydratedFromResultsContext = useMemo(() => {
    if (!requestedAnalysisId) return false;
    return hasLoadedAnalysis;
  }, [
    analysisScore,
    hasLoadedAnalysis,
    requestedAnalysisId,
  ]);

  const resumeCardStatus: StudioCardStatus = useMemo(() => {
    const needsMoreBaselineDetail = isInsufficientBaselineEvidenceMessage(resumeState.error);
    if (resumeGenerating) return "generating";
    if (!canGenerateDocuments && activeGenerationReadiness.blocked) return "blocked_by_compliance";
    if (resumePresenter.status === "blocked") return "blocked_by_compliance";
    if (needsMoreBaselineDetail) return "needs_more_baseline_detail";
    if (resumeState.error) return "failed_due_to_system_error";
    if (resumePresenter.status === "success" && hasResumeArtifact) {
      // Never claim success if we cannot render/export a usable preview (e.g. missing normalized model).
      if (!hasResumeDraft) return "needs_correction";
      return resumeQualityPass ? "generated_successfully" : "needs_correction";
    }
    return canGenerateDocuments ? "ready_to_generate" : "not_generated_yet";
  }, [
    canGenerateDocuments,
    activeGenerationReadiness.blocked,
    hasResumeArtifact,
    resumeGenerating,
    resumePresenter.status,
    resumeState.error,
    resumeQualityPass,
  ]);
  const resumeNeedsBaselineDetail = isInsufficientBaselineEvidenceMessage(resumeState.error);

  const coverCardStatus: StudioCardStatus = useMemo(() => {
    if (coverGenerating) return "generating";
    if (!canGenerateDocuments && activeGenerationReadiness.blocked) return "blocked_by_compliance";
    if (coverLetterComplianceBlocked || coverPresenter.status === "blocked") {
      return "blocked_by_compliance";
    }
    if (coverState.error) return "failed_due_to_system_error";
    if (coverPresenter.status === "success" && hasCoverLetterArtifact) {
      // Never claim success if we cannot render/export a usable preview (e.g. sanitized/blocked output).
      if (!hasCoverLetterDraft) return "needs_correction";
      return coverQualityPass ? "generated_successfully" : "needs_correction";
    }
    return canGenerateDocuments ? "ready_to_generate" : "not_generated_yet";
  }, [
    canGenerateDocuments,
    coverGenerating,
    coverLetterComplianceBlocked,
    activeGenerationReadiness.blocked,
    coverPresenter.status,
    coverState.error,
    hasCoverLetterArtifact,
    coverQualityPass,
  ]);

  function buildCoverLetterPayload(oneTap: boolean): CoverLetterPayload {
    return buildExportPayload({
      documentType: "cover_letter",
      oneTap,
      jobId: effectiveJobId,
      baselineId: effectiveBaselineId,
      baselineVersionId: effectiveBaselineVersionId,
      analysisId: requestedAnalysisId,
      extra: {
        documentStrategyPlan,
        closingTemplateKey: defaultClosingTemplateKey,
        ...(coverLetterJobContext ? { jobContext: coverLetterJobContext } : {}),
        ...(excludedTargetingLabels.size > 0
          ? { excludedRequirements: Array.from(excludedTargetingLabels) }
          : {}),
      },
    }) as CoverLetterPayload;
  }

  function buildResumePayload(oneTap: boolean) {
    return buildExportPayload({
      documentType: "resume",
      oneTap,
      jobId: effectiveJobId,
      baselineId: effectiveBaselineId,
      baselineVersionId: effectiveBaselineVersionId,
      analysisId: requestedAnalysisId,
      extra: {
        documentStrategyPlan,
        ...(resumeFocus !== "Auto (recommended)" ? { resumeFocus } : {}),
        ...(savedEditedResumeModel ? { editedResume: savedEditedResumeModel } : {}),
        ...(excludedTargetingLabels.size > 0
          ? { excludedRequirements: Array.from(excludedTargetingLabels) }
          : {}),
      },
    });
  }

  const queueRefinement = useCallback((preset: RefinementPreset) => {
    if (!resumeState.response && !coverState.response) {
      setRefinementStatusMessage("Generate a resume or cover letter before refining the output.");
      return;
    }

    const nextRefinements = [...refinementInstructions, preset];
    setRefinementInstructions(nextRefinements);
    setPendingRefinementAction({
      action: "apply",
      instruction: preset,
      targets: resolveRefinementTargets(preset),
      summary: `Applied ${preset.label}.`,
    });
    setRefinementStatusMessage(`Applying ${preset.label}.`);
    trackEvent("refinement_started", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      refinementType: preset.type,
      refinementTarget: preset.target,
      refinementCount: nextRefinements.length,
    });
    trackEvent("refinement_type_used", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      refinementType: preset.type,
      refinementTarget: preset.target,
    });
  }, [
    coverState.response,
    effectiveBaselineId,
    effectiveJobId,
    refinementInstructions,
    resumeState.response,
  ]);
  const applyFinalRoleAdjustment = useCallback(
    (adjustment: RoleMatchFinalAdjustment) => {
      const preset = resolveRoleMatchFinalAdjustmentPreset(
        {
          plan: documentStrategyPlan,
          resumeModel: generatedResumeModel,
          coverLetterParagraphs,
          jobDescription:
            selectedJob?.rawDescription ?? coverLetterJobDescriptionText ?? null,
        },
        adjustment,
      );
      if (!preset) {
        setRefinementStatusMessage("This final tightening option is not available for the current draft.");
        return;
      }

      finalRoleAdjustmentClickedRef.current = roleMatchFinalSignature;
      trackEvent("final_role_adjustment_clicked", {
        source: "studio",
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        adjustmentType: adjustment.type,
        adjustmentTarget: adjustment.target,
      });
      queueRefinement(preset);
    },
    [
      coverLetterJobDescriptionText,
      coverLetterParagraphs,
      documentStrategyPlan,
      effectiveBaselineId,
      effectiveJobId,
      generatedResumeModel,
      queueRefinement,
      roleMatchFinalSignature,
      selectedJob?.rawDescription,
    ],
  );
  const trackFinalRoleExportTelemetry = useCallback(
    (artifactType: "resume" | "cover_letter") => {
      if (!roleMatchFinalPass || !hasGeneratedDocumentPair) return;
      if (finalRoleCheckTrackedRef.current !== roleMatchFinalSignature) return;

      const followedAdjustment = finalRoleAdjustmentClickedRef.current === roleMatchFinalSignature;
      trackEvent(
        followedAdjustment ? "final_role_check_followed_by_export" : "final_role_check_ignored_then_exported",
        {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          artifactType,
          adjustmentCount: followedAdjustment ? 1 : 0,
          overallMatchReadiness: roleMatchFinalPass.overallMatchReadiness,
          priorityCoverageCount: roleMatchFinalPass.priorityCoverage.length,
          recruiterScanRiskCount: roleMatchFinalPass.recruiterScanRisks.length,
        },
      );
    },
    [
      effectiveBaselineId,
      effectiveJobId,
      hasGeneratedDocumentPair,
      roleMatchFinalPass,
      roleMatchFinalSignature,
    ],
  );
  const applyCritiqueRecommendation = useCallback(
    (preset: RefinementPreset, issueType: DocumentCritiqueIssue["type"], placement: "best_next" | "issue") => {
      trackEvent("critique_recommendation_clicked", {
        source: "studio",
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        issueType,
        severity:
          documentCritique?.topIssues.find((issue) => issue.type === issueType)?.severity ?? "medium",
        refinementType: preset.type,
        refinementTarget: preset.target,
        placement,
      });
      queueRefinement(preset);
    },
    [documentCritique?.topIssues, effectiveBaselineId, effectiveJobId, queueRefinement],
  );

  const undoLastRefinement = useCallback(() => {
    if (!refinementInstructions.length) return;
    const undone = refinementInstructions[refinementInstructions.length - 1];
    const nextRefinements = refinementInstructions.slice(0, -1);
    setRefinementInstructions(nextRefinements);
    setPendingRefinementAction({
      action: "undo",
      instruction: undone,
      targets:
        undone.target === "both"
          ? ["resume", "cover_letter"]
          : [undone.target],
      summary: `Undoing ${undone.label ?? undone.type}.`,
    });
    setRefinementStatusMessage(`Undoing ${undone.label ?? undone.type}.`);
    trackEvent("refinement_undone", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      refinementType: undone.type,
      refinementTarget: undone.target,
      refinementCount: nextRefinements.length,
    });
  }, [effectiveBaselineId, effectiveJobId, refinementInstructions]);

  const revertToOriginalRefinement = useCallback(() => {
    if (!refinementInstructions.length) return;
    const targets: RefinementTarget[] = [
      ...(resumeState.response ? ["resume" as const] : []),
      ...(coverState.response ? ["cover_letter" as const] : []),
    ];
    setRefinementInstructions([]);
    setPendingRefinementAction({
      action: "reset",
      instruction: null,
      targets,
      summary: "Reverted to the original generation.",
    });
    setRefinementStatusMessage("Reverting to the original generation.");
    trackEvent("refinement_undone", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      refinementType: "reset",
      refinementTarget: "both",
      refinementCount: 0,
    });
  }, [coverState.response, effectiveBaselineId, effectiveJobId, refinementInstructions.length, resumeState.response]);

  const applyTargetingAdjustment = useCallback((labels: string[]) => {
    const normalizedLabels = labels
      .map((label) =>
        normalizeUserFacingRequirementLabel(label, {
          sourceContext: null,
          issueCode: "unsupported_technology_claim",
        }),
      )
      .filter((label): label is string => typeof label === "string" && label.length > 0);
    if (!normalizedLabels.length) {
      setTargetingAdjustmentFeedback("No unsupported requirements were found to remove from targeting.");
      setTargetingAdjustmentStatus("warning");
      return;
    }
    setLastRemovedTargetingLabels(Array.from(new Set(normalizedLabels)));
    setExcludedTargetingLabels((current) => {
      const next = new Set(current);
      normalizedLabels.forEach((label) => next.add(label.toLowerCase()));
      return next;
    });
  }, []);
  const resetExpansionForm = useCallback(() => {
    setExpansionContext("");
    setExpansionDescription("");
    setExpansionImpact("");
    setExpansionConfirmedAccurate(false);
    setExpansionError(null);
    setExpansionSubmitting(false);
  }, []);
  const runAnalysisRefreshAfterExpansion = useCallback(async () => {
    if (!effectiveJobId || !effectiveBaselineId) return;
    await runWorkflowActivity("analysis_running", async () => {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: effectiveJobId,
          baseline_id: effectiveBaselineId,
          baseline_version_id: effectiveBaselineVersionId || undefined,
        }),
      });
      const payload = await readResponsePayload(response);
      if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(formatErrorMessage(payload, "Analysis refresh failed after saving evidence."));
      }
      const record = payload as Record<string, unknown>;
      const nextAnalysisId =
        (typeof record.assessmentId === "string" && record.assessmentId.trim()) ||
        (typeof record.id === "string" && record.id.trim()) ||
        requestedAnalysisId;
      const nextBaselineVersionId =
        (typeof record.baselineVersionId === "string" && record.baselineVersionId.trim()) ||
        effectiveBaselineVersionId;
      const params = new URLSearchParams();
      if (nextAnalysisId) params.set("analysisId", nextAnalysisId);
      if (effectiveJobId) params.set("jobId", effectiveJobId);
      if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
      if (nextBaselineVersionId) params.set("baselineVersionId", nextBaselineVersionId);
      const exclusions = Array.from(excludedTargetingLabels);
      exclusions.forEach((value) => params.append("excludedRequirements", value));
      await router.replace(`/studio?${params.toString()}`);
    });
  }, [
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    excludedTargetingLabels,
    runWorkflowActivity,
    requestedAnalysisId,
    router,
  ]);

  const runAnalysisRefreshAfterUnlock = useCallback(
    async (prior: { score: number | null; readiness: PostUnlockReadiness | null }) => {
      if (!effectiveJobId || !effectiveBaselineId) return;
      await runWorkflowActivity("unlock_reanalysis_running", async () => {
        const response = await fetch("/api/analysis/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: effectiveJobId,
            baseline_id: effectiveBaselineId,
            baseline_version_id: effectiveBaselineVersionId || undefined,
          }),
        });
        const payload = await readResponsePayload(response);
        if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error(formatErrorMessage(payload, "Re-evaluation failed. Please retry."));
        }
        const record = payload as Record<string, unknown>;
        const nextAnalysisId =
          (typeof record.assessmentId === "string" && record.assessmentId.trim()) ||
          (typeof record.id === "string" && record.id.trim()) ||
          requestedAnalysisId;
        const nextBaselineVersionId =
          (typeof record.baselineVersionId === "string" && record.baselineVersionId.trim()) ||
          effectiveBaselineVersionId;

        const params = new URLSearchParams();
        if (nextAnalysisId) params.set("analysisId", nextAnalysisId);
        if (effectiveJobId) params.set("jobId", effectiveJobId);
        if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
        if (nextBaselineVersionId) params.set("baselineVersionId", nextBaselineVersionId);
        const exclusions = Array.from(excludedTargetingLabels);
        exclusions.forEach((value) => params.append("excludedRequirements", value));

        params.set("postUnlock", "1");
        if (typeof prior.score === "number" && Number.isFinite(prior.score)) {
          params.set("priorScore", String(Math.round(prior.score)));
        }
        if (prior.readiness) {
          params.set("priorReadiness", prior.readiness);
        }

        await router.replace(`/studio?${params.toString()}`);
      });
    },
    [
      effectiveBaselineId,
      effectiveBaselineVersionId,
      effectiveJobId,
      excludedTargetingLabels,
      runWorkflowActivity,
      requestedAnalysisId,
      router,
    ],
  );

  const handleUnlockFlowSkip = useCallback(() => {
    trackEvent("unlock_flow_skipped", {
      source: "studio",
      baselineId: effectiveBaselineId ?? requestedBaselineId ?? null,
      jobId: effectiveJobId ?? requestedJobId ?? null,
      dimension: unlockContext.dimension,
      evidence_count: unlockContext.missingEvidence.length,
    });
    setUnlockFlowDismissed(true);
    void router.replace(
      getStudioHref({
        jobId: effectiveJobId ?? requestedJobId ?? null,
        baselineId: effectiveBaselineId ?? requestedBaselineId ?? null,
        baselineVersionId: effectiveBaselineVersionId ?? requestedBaselineVersionId ?? null,
        analysisId: requestedAnalysisId || null,
        assessmentId: requestedAnalysisId || null,
        fromUnlock: false,
      }),
    );
  }, [
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    requestedAnalysisId,
    requestedBaselineId,
    requestedBaselineVersionId,
    requestedJobId,
    router,
    unlockContext.dimension,
    unlockContext.missingEvidence.length,
  ]);

  const dismissPostUnlockOutcome = useCallback(() => {
    setPostUnlockDismissed(true);
    void router.replace(
      getStudioHref({
        jobId: effectiveJobId ?? requestedJobId ?? null,
        baselineId: effectiveBaselineId ?? requestedBaselineId ?? null,
        baselineVersionId: effectiveBaselineVersionId ?? requestedBaselineVersionId ?? null,
        analysisId: requestedAnalysisId || null,
        assessmentId: requestedAnalysisId || null,
        fromUnlock: false,
      }),
    );
  }, [
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    requestedAnalysisId,
    requestedBaselineId,
    requestedBaselineVersionId,
    requestedJobId,
    router,
  ]);

  const retryPostUnlockReanalysis = useCallback(async () => {
    if (!postUnlockActive) return;
    setPostUnlockRetrying(true);
    setPostUnlockRetryError(null);
    try {
      await runAnalysisRefreshAfterUnlock({
        score: postUnlockParams.priorScore,
        readiness: postUnlockParams.priorReadiness,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Re-evaluation failed. Please retry.";
      setPostUnlockRetryError(message);
      setPostUnlockRetrying(false);
      trackEvent("unlock_reanalysis_failed", {
        source: "studio",
        prior_score: postUnlockParams.priorScore,
        new_score: typeof analysisScore === "number" ? analysisScore : null,
        score_delta:
          typeof postUnlockParams.priorScore === "number" && typeof analysisScore === "number"
            ? analysisScore - postUnlockParams.priorScore
            : null,
        prior_readiness: postUnlockParams.priorReadiness,
        new_readiness: null,
        outcome_state: "reanalysis_failed",
      });
    }
  }, [
    analysisScore,
    postUnlockActive,
    postUnlockParams.priorReadiness,
    postUnlockParams.priorScore,
    runAnalysisRefreshAfterUnlock,
  ]);

  const handleUnlockFlowSubmit = useCallback(
    async (payload: { dimension: string; answers: Array<{ requirement: string; answer: string }> }) => {
      if (!effectiveBaselineId) {
        setUnlockSubmitError("Baseline context is missing. Return to Results and reopen Studio.");
        return;
      }
      if (!effectiveJobId) {
        setUnlockSubmitError("Job context is missing. Return to Results and reopen Studio.");
        return;
      }

      setUnlockSubmitting(true);
      setUnlockSubmitError(null);
      setUnlockReanalysisFailure(null);

      const uniqueAnswers = payload.answers
        .map((item) => ({
          requirement: String(item.requirement ?? "").trim(),
          answer: String(item.answer ?? "").trim(),
        }))
        .filter((item) => item.requirement && item.answer);

      try {
        for (const item of uniqueAnswers) {
          const rawText = [
            `Unlock dimension: ${payload.dimension}`,
            `Missing evidence: ${item.requirement}`,
            `Example: ${item.answer}`,
          ].join("\n");
          await appendStrengtheningAddition(effectiveBaselineId, {
            signalType: "experience_expansion",
            rawText,
          });
        }
      } catch (saveError) {
        const message =
          saveError instanceof Error
            ? saveError.message
            : "Unable to save evidence. Only include real and defensible experience.";
        setUnlockSubmitError(message);
        setUnlockSubmitting(false);
        return;
      }

      trackEvent("unlock_flow_completed", {
        source: "studio",
        baselineId: effectiveBaselineId,
        jobId: effectiveJobId,
        dimension: payload.dimension,
        evidence_count: uniqueAnswers.length,
      });

      const priorScore = typeof analysisScore === "number" && Number.isFinite(analysisScore) ? analysisScore : null;
      const priorReadiness: PostUnlockReadiness | null = activeGenerationReadiness.blocked
        ? "blocked"
        : activeGenerationReadiness.status === "ready"
          ? "ready"
          : "limited";

      try {
        await runAnalysisRefreshAfterUnlock({ score: priorScore, readiness: priorReadiness });
      } catch (reanalysisError) {
        const message =
          reanalysisError instanceof Error
            ? reanalysisError.message
            : "Re-evaluation failed. Please retry.";
        setUnlockSubmitting(false);
        setUnlockReanalysisFailure({ priorScore, priorReadiness, message });
        trackEvent("unlock_reanalysis_failed", {
          source: "studio",
          prior_score: priorScore,
          new_score: null,
          score_delta: null,
          prior_readiness: priorReadiness,
          new_readiness: null,
          outcome_state: "reanalysis_failed",
        });
      }
    },
    [
      activeGenerationReadiness.blocked,
      activeGenerationReadiness.status,
      analysisScore,
      effectiveBaselineId,
      effectiveJobId,
      runAnalysisRefreshAfterUnlock,
    ],
  );
  const handleEvidenceExpansionSubmit = useCallback(async (overrideRequirement?: string) => {
    const requirement = (overrideRequirement ?? expandingRequirement)?.trim() ?? "";
    if (!requirement) return;
    if (!effectiveBaselineId) {
      setExpansionError("Baseline context is missing. Reload Studio from Results.");
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
      await appendStrengtheningAddition(effectiveBaselineId, {
        signalType: "experience_expansion",
        rawText,
      });
      setExpansionSuccessByRequirement((current) => ({
        ...current,
        [requirement]: `${requirement} is now verified`,
      }));
      setExpandingRequirement(null);
      resetExpansionForm();
      await runAnalysisRefreshAfterExpansion();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to add supporting evidence. Only include real and defensible experience.";
      setExpansionError(message);
      setExpansionSubmitting(false);
    }
  }, [
    effectiveBaselineId,
    expandingRequirement,
    expansionConfirmedAccurate,
    expansionContext,
    expansionDescription,
    expansionImpact,
    resetExpansionForm,
    runAnalysisRefreshAfterExpansion,
  ]);

  const handleAutoAdjustTargeting = useCallback(() => {
    applyTargetingAdjustment(canonicalUnverifiedRequirements);
  }, [applyTargetingAdjustment, canonicalUnverifiedRequirements]);

  const handleRemoveIssueFromTargeting = useCallback(
    (issue: GenerationReadiness["verificationIssues"][number]) => {
      const normalized = normalizeUserFacingRequirementLabel(issue.claim, {
        sourceContext: issue.sourceContext,
        issueCode: issue.code,
      });
      if (!normalized) {
        setTargetingAdjustmentFeedback("This requirement could not be safely adjusted from targeting.");
        setTargetingAdjustmentStatus("warning");
        return;
      }
      applyTargetingAdjustment([normalized]);
    },
    [applyTargetingAdjustment],
  );

  useEffect(() => {
    if (!excludedTargetingLabels.size) return;
    const removedCount = adjustedReadinessResult.removedClaims.length;
    const countLabel = removedCount === 1 ? "requirement" : "requirements";
    const removedSummary =
      lastRemovedTargetingLabels.length > 0
        ? ` Removed: ${lastRemovedTargetingLabels.join(", ")}`
        : "";
    const removedSuffix = removedCount > 0 ? ` ${removedCount} unsupported ${countLabel} were removed from targeting.` : "";
    if (appliedExclusionsFromResults) {
      const resolvedRemovedLabels =
        lastRemovedTargetingLabels.length > 0
          ? lastRemovedTargetingLabels.map(
              (label) =>
                canonicalUnverifiedRequirements.find(
                  (requirement) => requirement.toLowerCase() === label.toLowerCase(),
                ) ?? label,
            )
          : [];
      const removedPrefix =
        resolvedRemovedLabels.length > 0
          ? `Removed from targeting: ${resolvedRemovedLabels.join(", ")}`
          : "Removed from targeting.";
      if (activeGenerationReadiness.status === "ready") {
        setTargetingAdjustmentFeedback(`Generation is now enabled. ${removedPrefix}`);
        setTargetingAdjustmentStatus("success");
        return;
      }
      setTargetingAdjustmentFeedback(`Some limitations remain. ${removedPrefix}`);
      setTargetingAdjustmentStatus("warning");
      return;
    }
    if (activeGenerationReadiness.status === "ready") {
      setTargetingAdjustmentFeedback(`Generation is now fully enabled.${removedSuffix}${removedSummary}`);
      setTargetingAdjustmentStatus("success");
      return;
    }
    setTargetingAdjustmentFeedback(
      `Some requirements were removed, but more verified evidence is needed.${removedSuffix}${removedSummary}`,
    );
    setTargetingAdjustmentStatus("warning");
  }, [
    adjustedReadinessResult.removedClaims.length,
    appliedExclusionsFromResults,
    activeGenerationReadiness.status,
    canonicalUnverifiedRequirements,
    excludedTargetingLabels.size,
    lastRemovedTargetingLabels,
  ]);

  useEffect(() => {
    if (!generatedResumeModel) {
      setSavedEditedResumeModel(null);
      setDraftResumeModel(null);
      setIsResumeEditMode(false);
      setResumeEditError(null);
      return;
    }

    if (!resumeGenerating && !hasSavedResumeEdits) {
      setSavedEditedResumeModel(null);
      setDraftResumeModel(generatedResumeModel);
    }
  }, [generatedResumeModel, hasSavedResumeEdits, resumeGenerating]);

  useEffect(() => {
    let canceled = false;
    const loadJobs = async () => {
      setJobsLoading(true);
      setJobsError(null);
      try {
        const fetched = await listJobs();
        if (canceled) return;
        setJobs(fetched);
        setJobsError(null);
        setSelectedJobId((current) => {
          if (current && fetched.some((job) => job.id === current)) {
            return current;
          }
          if (requestedJobId && fetched.some((job) => job.id === requestedJobId)) {
            return requestedJobId;
          }
          const preferred = fetched.find((job) => !job.archivedAt && !job.isArchived);
          return preferred?.id ?? fetched[0]?.id ?? "";
        });
      } catch (error) {
        if (canceled) return;
        const message = error instanceof Error ? error.message : "Jobs could not be loaded.";
        setJobsError(message);
      } finally {
        if (!canceled) {
          setJobsLoading(false);
        }
      }
    };
    void loadJobs();
    return () => {
      canceled = true;
    };
  }, [requestedJobId]);

  useEffect(() => {
    let canceled = false;
    const loadBaselines = async () => {
      setBaselinesLoading(true);
      setBaselinesError(null);
      try {
        const fetched = await listBaselines();
        if (canceled) return;
        setBaselines(fetched);
        setBaselinesError(null);
        const activeRequestedBaseline =
          requestedBaselineId &&
          fetched.find((baseline) => baseline.id === requestedBaselineId && baseline.status !== "ARCHIVED");
        if (requestedBaselineId && !activeRequestedBaseline) {
          setSelectedBaselineId("");
          setBaselinesError("This resume is archived or unavailable. Select an active resume to continue.");
          return;
        }
        if (activeRequestedBaseline) {
          setSelectedBaselineId(activeRequestedBaseline.id);
          return;
        }
        setSelectedBaselineId("");
        setBaselinesError("Select an active resume to continue.");
      } catch (error) {
        if (canceled) return;
        const message =
          error instanceof Error ? error.message : "Source resume could not be loaded.";
        setBaselinesError(message);
      } finally {
        if (!canceled) {
          setBaselinesLoading(false);
        }
      }
    };
    void loadBaselines();
    return () => {
      canceled = true;
    };
  }, [requestedBaselineId]);

  useEffect(() => {
    if (!selectedBaselineId) {
      setVersions([]);
      setSelectedBaselineVersionId("");
      pendingVersionSelectionRef.current = null;
      setVersionsError(null);
      return;
    }
    let canceled = false;
    setVersionsLoading(true);
    setVersionsError(null);
    const loadVersions = async () => {
      try {
        const response = await fetch(
          `/api/baselines/${encodeURIComponent(selectedBaselineId)}/versions`,
        );
        const payload = await readResponsePayload(response);
        if (canceled) return;
        if (!response.ok || !Array.isArray(payload)) {
          const message = formatErrorMessage(payload, "Resume snapshot could not be loaded.");
          setVersionsError(message);
          setVersions([]);
          setSelectedBaselineVersionId("");
          return;
        }
        const parsed = payload as BaselineVersionDto[];
        setVersions(parsed);
        setVersionsError(null);
        setSelectedBaselineVersionId((current) => {
          const pending = pendingVersionSelectionRef.current;
          if (pending && parsed.some((version) => version.id === pending)) {
            pendingVersionSelectionRef.current = null;
            return pending;
          }
          if (current && parsed.some((version) => version.id === current)) {
            return current;
          }
          if (
            !versionTouchedRef.current &&
            requestedBaselineVersionId &&
            parsed.some((version) => version.id === requestedBaselineVersionId)
          ) {
            return requestedBaselineVersionId;
          }
          return parsed[0]?.id ?? "";
        });
      } catch (error) {
        if (canceled) return;
        const message =
          error instanceof Error ? error.message : "Resume snapshot could not be loaded.";
        setVersionsError(message);
        setVersions([]);
        setSelectedBaselineVersionId("");
      } finally {
        if (!canceled) {
          setVersionsLoading(false);
        }
      }
    };
    void loadVersions();
    return () => {
      canceled = true;
    };
  }, [selectedBaselineId, requestedBaselineVersionId, versionRefreshSignal]);

  useEffect(() => {
    if (!requestedAnalysisId) {
      setAnalysis(null);
      setAnalysisError(null);
      setAnalysisLoading(false);
      return;
    }
    let canceled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);
    console.info("[studio] hydration_started", {
      area: "studio",
      operation: "hydrate_analysis",
      status: "info",
      code: "hydration_started",
      analysisId: requestedAnalysisId,
    });
    const loadAnalysis = async () => {
      try {
        const analysisUrl = buildAssessmentAnalysisUrl(requestedAnalysisId);
        const response = await fetch(analysisUrl, { cache: "no-store" });
        const payload = await readResponsePayload(response);
        if (canceled) return;
        if (!response.ok) {
          const message = sanitizeAnalysisError(payload);
          setAnalysis(null);
          setAnalysisError(message);
          console.warn("[studio] hydration_failed", {
            area: "studio",
            operation: "hydrate_analysis",
            status: "warn",
            code: "hydration_failed",
            analysisId: requestedAnalysisId,
            responseStatus: response.status,
          });
          return;
        }
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
          setAnalysis(null);
          setAnalysisError(ANALYSIS_LOAD_ERROR_MESSAGE);
          console.warn("[studio] hydration_failed", {
            area: "studio",
            operation: "hydrate_analysis",
            status: "warn",
            code: "hydration_failed",
            analysisId: requestedAnalysisId,
            responseStatus: "invalid_payload",
          });
          return;
        }
        const nextAnalysis = payload as LatestAnalysis;
        const nextAnalysisId = trimId((payload as { assessmentId?: unknown }).assessmentId);
        const nextBaselineId = trimId((payload as { baselineId?: unknown }).baselineId);
        if (!nextAnalysisId || !nextBaselineId) {
          setAnalysis(null);
          setAnalysisError(ANALYSIS_LOAD_ERROR_MESSAGE);
          console.warn("[studio] hydration_failed", {
            area: "studio",
            operation: "hydrate_analysis",
            status: "warn",
            code: "hydration_failed",
            analysisId: requestedAnalysisId,
            responseStatus: "missing_required_context",
          });
          return;
        }
        setAnalysis(nextAnalysis);
        setAnalysisError(null);
        console.info("[studio] hydration_succeeded", {
          area: "studio",
          operation: "hydrate_analysis",
          status: "info",
          code: "hydration_succeeded",
          analysisId: requestedAnalysisId,
          jobId: nextAnalysis?.jobId ?? null,
          baselineId: nextAnalysis?.baselineId ?? null,
          baselineVersionId: nextAnalysis?.baselineVersionId ?? null,
        });
        const analysisJobId = trimId((payload as { jobId?: unknown }).jobId);
        const analysisBaselineId = trimId((payload as { baselineId?: unknown }).baselineId);
        const analysisBaselineVersionId = trimId(
          (payload as { baselineVersionId?: unknown }).baselineVersionId,
        );
        if (analysisJobId) {
          setSelectedJobId(analysisJobId);
        }
        if (analysisBaselineId) {
          setSelectedBaselineId(analysisBaselineId);
        }
        if (analysisBaselineVersionId) {
          setSelectedBaselineVersionId(analysisBaselineVersionId);
        }
      } catch (error) {
        if (canceled) return;
        setAnalysis(null);
        setAnalysisError(
          error instanceof Error && !isHtmlLikePayload(error.message)
            ? error.message
            : ANALYSIS_LOAD_ERROR_MESSAGE,
        );
        console.error("[studio] hydration_failed", {
          area: "studio",
          operation: "hydrate_analysis",
          status: "error",
          code: "hydration_failed",
          analysisId: requestedAnalysisId,
          responseStatus: "exception",
        });
      } finally {
        if (!canceled) {
          setAnalysisLoading(false);
        }
      }
    };
    void loadAnalysis();
    return () => {
      canceled = true;
    };
  }, [requestedAnalysisId]);

  useEffect(() => {
    if (!requestedAnalysisId) {
      setContextHydrationMessage(null);
      return;
    }
    if (jobsLoading || baselinesLoading || analysisLoading) {
      setContextHydrationMessage(null);
      return;
    }

    if (analysisError) {
      setContextHydrationMessage(
        "We could not load the selected role context. Please choose a baseline and job to continue.",
      );
      return;
    }

    if (hydratedFromResultsContext) {
      setContextHydrationMessage(null);
      return;
    }
  }, [
    analysisError,
    analysisLoading,
    baselines,
    baselinesLoading,
    hydratedFromResultsContext,
    jobs,
    jobsLoading,
    requestedAnalysisId,
    versions,
  ]);

  // Intentionally avoid scrolling the viewport to the artifact/materials section on route entry.
  // The primary authority panel at the top of Studio is the first-lane UI and must remain visible on load.

  useEffect(() => {
    if (!analysis?.baselineId) return;
    if (baselineTouchedRef.current) return;
    if (!baselines.some((baseline) => baseline.id === analysis.baselineId)) return;
    setSelectedBaselineId(analysis.baselineId);
  }, [analysis?.baselineId, baselines]);

  useEffect(() => {
    if (!analysis?.baselineVersionId) return;
    if (versionTouchedRef.current) return;
    if (!versions.some((version) => version.id === analysis.baselineVersionId)) return;
    setSelectedBaselineVersionId(analysis.baselineVersionId);
  }, [analysis?.baselineVersionId, versions]);

  type StudioArtifactGenerationAttemptResult = {
    artifact: "resume" | "cover";
    ok: boolean;
    status: "success" | "skipped" | "failed";
    errorCode: string | null;
    errorMessage: string | null;
    skippedReason: string | null;
    missingPrereqs: string[];
    ids: {
      baselineId: string | null;
      baselineVersionId: string | null;
      jobId: string | null;
      analysisId: string | null;
    };
    request: {
      sessionKey: string | null;
      requestId: string | null;
    };
    http: {
      status: number | null;
      responseSummary: unknown | null;
    };
  };

  const summarizeStudioGenerationResponse = (payload: unknown): unknown => {
    if (payload === null || payload === undefined) return payload;
    if (typeof payload === "string") {
      const trimmed = payload.trim();
      return trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
    }
    if (Array.isArray(payload)) return { type: "array", length: payload.length };
    if (typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const picked: Record<string, unknown> = {};
      for (const key of ["status", "code", "message", "retryable", "nextAction", "artifactType", "runId", "generationStatus", "exportReady"]) {
        if (key in record) picked[key] = record[key];
      }
      return {
        type: "object",
        ...(Object.keys(picked).length ? { picked } : {}),
        keys: Object.keys(record).slice(0, 30),
      };
    }
    return { type: typeof payload, value: payload };
  };

  const makeStudioAttempt = (
    artifact: StudioArtifactGenerationAttemptResult["artifact"],
    attempt: Partial<StudioArtifactGenerationAttemptResult> &
      Pick<StudioArtifactGenerationAttemptResult, "ok" | "status">,
  ): StudioArtifactGenerationAttemptResult => ({
    artifact,
    ok: attempt.ok,
    status: attempt.status,
    errorCode: attempt.errorCode ?? null,
    errorMessage: attempt.errorMessage ?? null,
    skippedReason: attempt.skippedReason ?? null,
    missingPrereqs: attempt.missingPrereqs ?? [],
    ids: {
      baselineId: attempt.ids?.baselineId ?? effectiveBaselineId ?? null,
      baselineVersionId: attempt.ids?.baselineVersionId ?? effectiveBaselineVersionId ?? null,
      jobId: attempt.ids?.jobId ?? effectiveJobId ?? null,
      analysisId: attempt.ids?.analysisId ?? requestedAnalysisId ?? null,
    },
    request: {
      sessionKey: attempt.request?.sessionKey ?? null,
      requestId: attempt.request?.requestId ?? null,
    },
    http: {
      status: attempt.http?.status ?? null,
      responseSummary: attempt.http?.responseSummary ?? null,
    },
  });

  const handleResumeDraft = async (
    opts?: {
      verifiedOnly?: boolean;
      bypassReadinessGate?: boolean;
      sessionKey?: string;
      forceRegenerate?: boolean;
      regenerationSource?: "manual_retry" | "shell" | "shell_auto" | "post_unlock";
      onAttempt?: (attempt: StudioArtifactGenerationAttemptResult) => void;
    },
  ): Promise<boolean> => {
    const emitAttempt = (attempt: StudioArtifactGenerationAttemptResult) => {
      try {
        opts?.onAttempt?.(attempt);
      } catch {
        // ignore diagnostics failures
      }
    };
    const finish = (attempt: StudioArtifactGenerationAttemptResult) => {
      emitAttempt(attempt);
      return attempt.ok;
    };
    if (
      !opts?.forceRegenerate &&
      studioArtifactPresentationStateRef.current === "hydrated" &&
      hasResumeArtifact &&
      Boolean(resumeState.response)
    ) {
      return finish(
        makeStudioAttempt("resume", {
          ok: true,
          status: "skipped",
          skippedReason: "already_hydrated",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: null },
        }),
      );
    }
    if (!opts?.forceRegenerate && generationLifecycle.phase === "generated" && hasResumeArtifact) {
      return finish(
        makeStudioAttempt("resume", {
          ok: true,
          status: "skipped",
          skippedReason: "already_generated",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: null },
        }),
      );
    }
    if (!generationLifecycle.canStartGeneration) {
      // Manual retry must be able to regenerate when the current artifacts are unusable (quality failed).
      // Do not block on the pair lifecycle "generated" state in that case.
      if (opts?.forceRegenerate && artifactContract.hasUsableArtifacts === false) {
        // proceed
      } else {
      return finish(
        makeStudioAttempt("resume", {
          ok: false,
          status: "failed",
          errorCode: "generation_not_allowed",
          errorMessage: "Generation cannot start in the current lifecycle phase.",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: null },
        }),
      );
      }
    }

    const artifactType: StudioArtifactType = "resume";
    const flightRequestId = createRequestId();
    const flight = acquireStudioArtifactSingleFlight({
      baselineId: effectiveBaselineId ?? null,
      jobId: effectiveJobId ?? null,
      analysisId: requestedAnalysisId ?? null,
      artifactType,
      requestId: flightRequestId,
    });
    if (!flight.acquired) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[studioSingleFlight]", {
          artifactType,
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          analysisId: requestedAnalysisId ?? null,
          allowed: false,
          reason: flight.reason,
        });
      }
      return finish(
        makeStudioAttempt("resume", {
          ok: true,
          status: "skipped",
          skippedReason: `single_flight_not_acquired:${flight.reason ?? "unknown"}`,
          request: { sessionKey: opts?.sessionKey ?? null, requestId: flightRequestId },
        }),
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[studioSingleFlight]", {
        artifactType,
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        allowed: true,
        reason: flight.reason,
        requestId: flightRequestId,
      });
    }

    if (
      !guardGenerationAction("resume", {
        allowVerifiedOnlyFallback: Boolean(opts?.verifiedOnly) || generateNowEligible,
      })
    ) {
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return finish(
        makeStudioAttempt("resume", {
          ok: false,
          status: "failed",
          errorCode: "guard_blocked",
          errorMessage: "Resume generation was blocked by a readiness guard.",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: flightRequestId },
        }),
      );
    }
    const requestScope = generationWorkflowScope;
    const request = beginStudioGenerationRequest("resume", requestScope);
    if (!request) {
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return finish(
        makeStudioAttempt("resume", {
          ok: false,
          status: "failed",
          errorCode: "missing_generation_request",
          errorMessage: "Resume generation could not acquire a request slot.",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: flightRequestId },
        }),
      );
    }
    setUnlockGenerationConfirmation(null);
    if ((hasSavedResumeEdits || hasUnsavedResumeEdits) && resumeState.response) {
      const proceed =
        typeof window !== "undefined"
          ? window.confirm("Regenerating will replace your saved edits for this version.")
          : true;
      if (!proceed) {
        finishStudioGenerationRequest("resume", request, "blocked", requestScope);
        releaseStudioArtifactSingleFlight({
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          analysisId: requestedAnalysisId ?? null,
          artifactType,
        });
        return finish(
          makeStudioAttempt("resume", {
            ok: false,
            status: "failed",
            errorCode: "user_cancelled",
            errorMessage: "User cancelled regeneration because edits would be overwritten.",
            request: { sessionKey: opts?.sessionKey ?? null, requestId: request.requestId },
          }),
        );
      }
      setSavedEditedResumeModel(null);
      setDraftResumeModel(generatedResumeModel);
      setIsResumeEditMode(false);
      setResumeEditError(null);
    }
    if (!opts?.bypassReadinessGate && !canProceedWithStudioDrafts) {
      finishStudioGenerationRequest("resume", request, "blocked", requestScope);
      setResumeState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a resume.",
      }));
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return finish(
        makeStudioAttempt("resume", {
          ok: false,
          status: "failed",
          errorCode: "readiness_blocked",
          errorMessage: generationMessage ?? "Review prerequisites before generating a resume.",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: request.requestId },
        }),
      );
    }
    if (!effectiveBaselineVersionId) {
      finishStudioGenerationRequest("resume", request, "blocked", requestScope);
      const message = "Your resume snapshot is still loading. Please wait a moment and try again.";
      setResumeState((current) => ({
        ...current,
        error: message,
        artifactFailure: {
          artifactType: "resume",
          headline: "Generation cannot start yet",
          explanation: message,
          nextStep: "Wait for your resume snapshot to load, then retry generation.",
          retryable: true,
          category: "invalid_pair_state",
          code: "missing_baseline_version",
        },
      }));
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return finish(
        makeStudioAttempt("resume", {
          ok: false,
          status: "failed",
          errorCode: "missing_baseline_version",
          errorMessage: message,
          missingPrereqs: ["baselineVersionId"],
          request: { sessionKey: opts?.sessionKey ?? null, requestId: request.requestId },
        }),
      );
    }
    let activityOutcome: "success" | "failure" = "failure";
    let requestFinalStatus: "completed" | "timeout" = "completed";
    setResumeGenerating(true);
    startWorkflowActivity("generation_running");
    const shouldShowUnlockConfirmation = isFirstGenerationAfterUnlock;
    trackEvent("resume_generation_attempted", {
      source: "studio",
      analysisId: requestedAnalysisId || undefined,
    });
    console.info("[studio] generation_requested", {
      area: "studio",
      operation: "generate",
      status: "info",
      code: "generation_requested",
      artifactType: "resume",
      requestId: request.requestId,
      analysisId: requestedAnalysisId || null,
      jobId: effectiveJobId || null,
      baselineId: effectiveBaselineId || null,
      baselineVersionId: effectiveBaselineVersionId || null,
    });
    setResumeState((current) => ({
      ...current,
      error: null,
      tierGateError: inputsChangedSinceLastFailure ? null : current.tierGateError,
      artifactFailure: null,
    }));
    setResumeWarningFlags([]);
    setResumeAuditId(undefined);
    const verifiedOnly = Boolean(opts?.verifiedOnly) || generateNowEligible;
    const payload = normalizeGenerationPayload(buildResumePayload(verifiedOnly), "resume"); 
    const payloadWithRequestId = {
      ...payload,
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(opts?.sessionKey ? { sessionKey: opts.sessionKey } : {}),
      ...(opts?.regenerationSource ? { regenerationSource: opts.regenerationSource } : {}),
    };
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = 2 * 60_000;
    const timeoutId =
      typeof window !== "undefined" && controller
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null;
    try {
      const response = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadWithRequestId),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      const responsePayload = await readResponsePayload(response);
      if (
        isWorkflowRequestStale(requestScope, currentWorkflowScopeRef.current) ||
        activeResumeGenerationRef.current?.requestId !== request.requestId
      ) {
        // Request finished, but Studio moved to a different workflow scope. Release so we don't deadlock
        // if the user returns to this same pair.
        releaseStudioArtifactSingleFlight({
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          analysisId: requestedAnalysisId ?? null,
          artifactType,
        });
        finishStudioGenerationRequest("resume", request, "blocked", requestScope);
        return false;
      }
      if (!response.ok) {
        console.warn("[studio] generation_failed", {
          area: "studio",
          operation: "generate",
          status: "warn",
          code: "generation_failed",
          artifactType: "resume",
          responseStatus: response.status,
          requestId: request.requestId,
        });
        if (
          response.status === 403 &&
          responsePayload &&
          typeof responsePayload === "object" &&
          (responsePayload as Record<string, unknown>).errorCode === "TIER_GATED"
        ) {
          const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
          setResumeState((current) => ({ ...current, tierGateError: tierGate }));
          return false;
        }
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setResumeState((current) => ({ ...current, tierGateError: tierGate }));
          return false;
        }
        if (response.status === 422) {
          const failure = readArtifactFailurePresentation(responsePayload);
          if (failure) {
            setResumeState((current) => ({
              ...current,
              artifactFailure: failure,
              error: null,
            }));
            return false;
          }
          const blockedState = parseComplianceBlockedFromPayload(responsePayload);
          if (blockedState) {
            trackEvent("resume_generation_blocked_compliance", {
              source: "studio",
              analysisId: requestedAnalysisId || undefined,
              reasonCode: "generation_blocked",
            });
            setResumeState((current) => ({
              ...current,
              error: [blockedState.body, ...blockedState.reasons].filter(Boolean).join(" "),
            }));
            lastFailureSignatureRef.current = generationInputSignature;
            return false;
          }
        }
        lastFailureSignatureRef.current = generationInputSignature;
        throw new Error(formatErrorMessage(responsePayload, "Resume generation failed."));
      }
      const presenter = presentResumeGeneration(responsePayload);
      const failure = presenter.failure;
      if (failure) {
        setResumeState((current) => ({
          ...current,
          artifactFailure: failure,
          error: null,
        }));
        return false;
      }
      if (presenter.status === "blocked" && presenter.display) {
        trackEvent("resume_generation_blocked_compliance", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "blocked",
        });
        setResumeState((current) => ({
          ...current,
          error: presenter.display?.description ?? current.error,
        }));
        setResumeWarningFlags([]);
        setResumeAuditId(undefined);
        lastFailureSignatureRef.current = generationInputSignature;
        return false;
      }
      if (presenter.status === "error") {
        trackEvent("resume_generation_limited", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "error",
        });
        setResumeState((current) => ({
          ...current,
          error:
            presenter.display?.description ??
            "Resume generation failed. Please review your baseline and try again.",
        }));
        setResumeWarningFlags([]);
        setResumeAuditId(undefined);
        lastFailureSignatureRef.current = generationInputSignature;
        return false;
      }
      if (presenter.status === "unknown") {
        throw new Error("Resume generation returned an unexpected response. Please try again.");
      }
      const validatedResult = await generateWithRetry({
        generate: async (strictMode) => {
          if (!strictMode) return responsePayload;
          const retryResponse = await fetch("/api/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              ...normalizeGenerationPayload(buildResumePayload(generateNowEligible), "resume"), 
              trustGateMode: "strict", 
              ...(request.requestId ? { requestId: request.requestId } : {}),
              ...(opts?.sessionKey ? { sessionKey: opts.sessionKey } : {}),
              ...(opts?.regenerationSource ? { regenerationSource: opts.regenerationSource } : {}),
            }), 
          }); 
          const retryPayload = await readResponsePayload(retryResponse);
          if (!retryResponse.ok) {
            throw new Error(formatErrorMessage(retryPayload, "Resume generation failed."));
          }
          const retryPresenter = presentResumeGeneration(retryPayload);
          if (retryPresenter.status !== "success") {
            throw new Error("Resume retry did not return a usable document.");
          }
          return retryPayload;
        },
        validate: (payload) => validateResumeOutput(payload),
      });
      if (
        isWorkflowRequestStale(requestScope, currentWorkflowScopeRef.current) ||
        activeResumeGenerationRef.current?.requestId !== request.requestId
      ) {
        releaseStudioArtifactSingleFlight({
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          analysisId: requestedAnalysisId ?? null,
          artifactType,
        });
        finishStudioGenerationRequest("resume", request, "blocked", requestScope);
        return false;
      }

      if (!validatedResult.success) {
        trackEvent("resume_generation_limited", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "validation_failed",
        });
        if (generateNowEligible) {
          // Generate-now contract: do not block the artifact on trust-validation failures.
          // We keep the first successful payload so the user always gets usable documents.
          setResumeState((current) => ({
            ...current,
            response: responsePayload,
            artifactFailure: null,
            error: null,
          }));
          setStudioArtifactPairStatus("completed");
          studioArtifactPresentationStateRef.current = "generated";
          setResumeWarningFlags(extractComplianceWarnings(responsePayload));
          setResumeAuditId(normalizeAuditId(responsePayload));
          return true;
        }
        setStudioArtifactPairStatus("failed");
        setResumeState((current) => ({
          ...current,
          error: GENERATION_TRUST_FALLBACK_ERROR,
        }));
        lastFailureSignatureRef.current = generationInputSignature;
        return false;
      }

      setResumeState((current) => ({
        ...current,
        response: validatedResult.output,
        artifactFailure: null,
        error: null,
      }));
      setStudioArtifactPairStatus("completed");
      studioArtifactPresentationStateRef.current = "generated";
      trackEvent("resume_generation_succeeded", {
        source: "studio",
        analysisId: requestedAnalysisId || undefined,
      });
      if (isGuidedActive) {
        completeGuidedMode();
      }
      setResumeWarningFlags(extractComplianceWarnings(validatedResult.output));
      setResumeAuditId(normalizeAuditId(validatedResult.output));
      if (shouldShowUnlockConfirmation) {
        setHasGeneratedOnce(true);
        setUnlockGenerationConfirmation("Generated from verified evidence aligned to this role.");
      }
      console.info("[studio] generation_succeeded", {
        area: "studio",
        operation: "generate",
        status: "info",
        code: "generation_succeeded",
        artifactType: "resume",
        requestId: request.requestId,
      });
      activityOutcome = "success";
      return true;
    } catch (error) {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        requestFinalStatus = "timeout";
      }
      if (
        isWorkflowRequestStale(requestScope, currentWorkflowScopeRef.current) ||
        activeResumeGenerationRef.current?.requestId !== request.requestId
      ) {
        finishStudioGenerationRequest("resume", request, "blocked", requestScope);
        return false;
      }
      trackEvent("resume_generation_limited", {
        source: "studio",
        analysisId: requestedAnalysisId || undefined,
        reasonCode: requestFinalStatus === "timeout" ? "timeout" : "exception",
      });
      const message =
        requestFinalStatus === "timeout"
          ? "Resume generation timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "Resume generation failed.";
      setResumeState((current) => ({
        ...current,
        error: message,
        artifactFailure: {
          artifactType: "resume",
          headline: "Generation did not complete",
          explanation: message,
          nextStep: "Review the input and try again with stronger baseline evidence.",
          retryable: true,
          category: requestFinalStatus === "timeout" ? "generation_timeout" : "generation_failed",
          code: requestFinalStatus === "timeout" ? "generation_timeout" : "generation_failed",
        },
      }));
      setStudioArtifactPairStatus("failed");
      return false;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (!activeResumeGenerationRef.current || activeResumeGenerationRef.current?.requestId === request.requestId) {
        setResumeGenerating(false);
      }
      await stopWorkflowActivity("generation_running", activityOutcome);
      finishStudioGenerationRequest("resume", request, requestFinalStatus, requestScope);
    }
  };

  const handleEnterResumeEditMode = useCallback(() => {
    if (!effectiveResumeModel) {
      setResumeEditError("Generate a resume before editing.");
      return;
    }
    setDraftResumeModel(JSON.parse(JSON.stringify(effectiveResumeModel)) as ResumeModel);
    setResumeEditError(null);
    setIsResumeEditMode(true);
  }, [effectiveResumeModel]);

  const handleResumeSummaryChange = useCallback((value: string) => {
    setDraftResumeModel((current) => {
      if (!current) return current;
      return { ...current, summary: value };
    });
  }, []);

  const handleResumeBulletChange = useCallback(
    (experienceIndex: number, bulletIndex: number, value: string) => {
      setDraftResumeModel((current) => {
        if (!current?.experience) return current;
        const nextExperience = current.experience.map((entry, currentIndex) => {
          if (currentIndex !== experienceIndex) return entry;
          const nextBullets = [...(entry.bullets ?? [])];
          nextBullets[bulletIndex] = value;
          return { ...entry, bullets: nextBullets };
        });
        return { ...current, experience: nextExperience };
      });
    },
    [],
  );

  const handleCancelResumeEdits = useCallback(() => {
    setDraftResumeModel(savedEditedResumeModel ?? generatedResumeModel);
    setIsResumeEditMode(false);
    setResumeEditError(null);
  }, [generatedResumeModel, savedEditedResumeModel]);

  const handleSaveResumeEdits = useCallback(() => {
    if (!draftResumeModel) {
      setResumeEditError("No generated resume content is available to save.");
      return;
    }

    setSavedEditedResumeModel(draftResumeModel);
    setIsResumeEditMode(false);
    setResumeEditError(null);
  }, [draftResumeModel]);

  const exportResume = async (format: "docx" | "pdf") => {
    if (!canProceedWithStudioDrafts) {
      setResumeState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a resume.",
      }));
      return;
    }
    if (!isPro) {
      return;
    }
    if (!hasResumeArtifact) {
      setResumeState((current) => ({
        ...current,
        error: "Generate Resume before downloading.",
      }));
      return;
    }
    setResumeExportFormat(format);
    setResumeState((current) => ({ ...current, error: null, tierGateError: null }));
    const payload = normalizeGenerationPayload(buildResumePayload(true), "resume");
    try {
      const response = await fetch(`/api/resume/export?format=${encodeURIComponent(format)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responsePayload = await readResponsePayload(response);
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setResumeState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
        throw new Error(formatErrorMessage(responsePayload, "Resume export failed."));
      }

      const serverFilename = getFilenameFromContentDisposition(
        response.headers.get("content-disposition"),
      );
      const blob = await response.blob();
      downloadBlob(blob, serverFilename ?? `resume.${format}`);
      recordArtifactUsedIntent();
      setRecentIntent(readRecentIntentState());
      trackEvent("studio_resume_downloaded", {
        source: "studio",
        analysisId: requestedAnalysisId || null,
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        score: analysisScore,
        format,
      });
      trackEvent("artifact_used_intent", {
        source: "studio",
        artifactType: "resume",
        action: "export",
        format,
        status: completionCopy.title,
      });
      trackFinalRoleExportTelemetry("resume");
      if (refinementInstructions.length > 0) {
        trackEvent("refinement_followed_by_export", {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          artifactType: "resume",
          refinementCount: refinementInstructions.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resume export failed.";
      setResumeState((current) => ({ ...current, error: message }));
    } finally {
      setResumeExportFormat(null);
    }
  };

  const handleCopyResume = useCallback(async () => {
    if (!hasResumeArtifact || !resumeState.response) {
      setResumeState((current) => ({ ...current, error: "Generate Resume before copying." }));
      return;
    }
    const copied = await copyTextToClipboard(resumePreviewText);
    if (!copied) {
      setResumeState((current) => ({ ...current, error: "Copying the resume text was not available." }));
      return;
    }
    setResumeCopyStatus("Resume copied");
    recordArtifactUsedIntent();
    setRecentIntent(readRecentIntentState());
    trackEvent("studio_resume_copied", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
    });
    trackEvent("artifact_used_intent", {
      source: "studio",
      artifactType: "resume",
      action: "use_now",
      status: completionCopy.title,
    });
  }, [
    analysisScore,
    completionCopy.title,
    effectiveBaselineId,
    effectiveJobId,
    hasResumeArtifact,
    requestedAnalysisId,
    resumePreviewText,
    resumeState.response,
  ]);

  async function loadCoverLetterById(coverLetterId: string) {
    setCoverLetterComplianceBlocked(null);
    try {
      const response = await fetch(
        `/api/cover-letters/${encodeURIComponent(coverLetterId)}`,
        { method: "GET" },
      );
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        const tierGate = parseTierGateError({
          status: response.status,
          payload: responsePayload,
        });
        if (tierGate) {
          setCoverState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
        throw new Error(formatErrorMessage(responsePayload, "Cover letter unavailable."));
      }
      const presenter = presentCoverLetterGeneration(responsePayload);
      if (presenter.status === "blocked" && presenter.display) {
        applyCoverLetterComplianceBlocked({
          title: presenter.display.title,
          body: presenter.display.description,
          reasons: presenter.display.reasons,
          cta: presenter.display.cta,
        });
        return;
      }
      setCoverState((current) => ({ ...current, response: responsePayload }));
      setStudioArtifactPairStatus("completed");
      studioArtifactPresentationStateRef.current = "hydrated";
      setCoverWarningFlags(extractComplianceWarnings(responsePayload));
      setCoverAuditId(normalizeAuditId(responsePayload));
      setCoverLetterComplianceBlocked(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cover letter unavailable.";
      setCoverState((current) => ({ ...current, error: message }));
    }
  }

  const handleCoverDraft = async (
    opts?: {
      verifiedOnly?: boolean;
      bypassReadinessGate?: boolean;
      sessionKey?: string;
      forceRegenerate?: boolean;
      regenerationSource?: "manual_retry" | "shell" | "shell_auto" | "post_unlock";
      onAttempt?: (attempt: StudioArtifactGenerationAttemptResult) => void;
    },
  ): Promise<boolean> => {
    const emitAttempt = (attempt: StudioArtifactGenerationAttemptResult) => {
      try {
        opts?.onAttempt?.(attempt);
      } catch {
        // ignore diagnostics failures
      }
    };
    const finish = (attempt: StudioArtifactGenerationAttemptResult) => {
      emitAttempt(attempt);
      return attempt.ok;
    };
    const fail = (args: {
      errorCode: string;
      errorMessage: string;
      missingPrereqs?: string[];
      http?: { status: number | null; responsePayload?: unknown };
      requestId?: string | null;
    }) =>
      finish(
        makeStudioAttempt("cover", {
          ok: false,
          status: "failed",
          errorCode: args.errorCode,
          errorMessage: args.errorMessage,
          missingPrereqs: args.missingPrereqs ?? [],
          request: {
            sessionKey: opts?.sessionKey ?? null,
            requestId: args.requestId ?? null,
          },
          http: args.http
            ? {
                status: args.http.status ?? null,
                responseSummary: summarizeStudioGenerationResponse(args.http.responsePayload),
              }
            : undefined,
        }),
      );
    const succeed = (requestId?: string | null) =>
      finish(
        makeStudioAttempt("cover", {
          ok: true,
          status: "success",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: requestId ?? null },
        }),
      );
    if (
      !opts?.forceRegenerate &&
      studioArtifactPresentationStateRef.current === "hydrated" &&
      hasCoverLetterArtifact &&
      Boolean(coverState.response)
    ) {
      return finish(
        makeStudioAttempt("cover", {
          ok: true,
          status: "skipped",
          skippedReason: "already_hydrated",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: null },
        }),
      );
    }
    if (!opts?.forceRegenerate && generationLifecycle.phase === "generated" && hasCoverLetterArtifact) {
      return finish(
        makeStudioAttempt("cover", {
          ok: true,
          status: "skipped",
          skippedReason: "already_generated",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: null },
        }),
      );
    }
    if (!generationLifecycle.canStartGeneration) {
      // Manual retry must be able to regenerate when the current artifacts are unusable (quality failed).
      // Do not block on the pair lifecycle "generated" state in that case.
      if (opts?.forceRegenerate && artifactContract.hasUsableArtifacts === false) {
        // proceed
      } else {
      return finish(
        makeStudioAttempt("cover", {
          ok: false,
          status: "failed",
          errorCode: "generation_not_allowed",
          errorMessage: "Generation cannot start in the current lifecycle phase.",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: null },
        }),
      );
      }
    }

    const artifactType: StudioArtifactType = "cover_letter";
    const flightRequestId = createRequestId();
    const flight = acquireStudioArtifactSingleFlight({
      baselineId: effectiveBaselineId ?? null,
      jobId: effectiveJobId ?? null,
      analysisId: requestedAnalysisId ?? null,
      artifactType,
      requestId: flightRequestId,
    });
    if (!flight.acquired) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[studioSingleFlight]", {
          artifactType,
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          analysisId: requestedAnalysisId ?? null,
          allowed: false,
          reason: flight.reason,
        });
      }
      return finish(
        makeStudioAttempt("cover", {
          ok: true,
          status: "skipped",
          skippedReason: `single_flight_not_acquired:${flight.reason ?? "unknown"}`,
          request: { sessionKey: opts?.sessionKey ?? null, requestId: flightRequestId },
        }),
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[studioSingleFlight]", {
        artifactType,
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        allowed: true,
        reason: flight.reason,
        requestId: flightRequestId,
      });
    }

    if (
      !guardGenerationAction("cover_letter", {
        allowVerifiedOnlyFallback: Boolean(opts?.verifiedOnly) || generateNowEligible,
      })
    ) {
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return finish(
        makeStudioAttempt("cover", {
          ok: false,
          status: "failed",
          errorCode: "guard_blocked",
          errorMessage: "Cover letter generation was blocked by a readiness guard.",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: flightRequestId },
        }),
      );
    }
    const requestScope = generationWorkflowScope;
    const request = beginStudioGenerationRequest("cover_letter", requestScope);
    if (!request) {
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return finish(
        makeStudioAttempt("cover", {
          ok: false,
          status: "failed",
          errorCode: "missing_generation_request",
          errorMessage: "Cover letter generation could not acquire a request slot.",
          request: { sessionKey: opts?.sessionKey ?? null, requestId: flightRequestId },
        }),
      );
    }
    setUnlockGenerationConfirmation(null);
    if (!opts?.bypassReadinessGate && !canProceedWithStudioDrafts) {
      finishStudioGenerationRequest("cover_letter", request, "blocked", requestScope);
      setCoverState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a cover letter.",
      }));
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return fail({
        errorCode: "readiness_blocked",
        errorMessage: generationMessage ?? "Review prerequisites before generating a cover letter.",
        requestId: request.requestId,
      });
    }
    if (!effectiveBaselineVersionId) {
      finishStudioGenerationRequest("cover_letter", request, "blocked", requestScope);
      const message = "Your resume snapshot is still loading. Please wait a moment and try again.";
      setCoverState((current) => ({
        ...current,
        error: message,
        artifactFailure: {
          artifactType: "cover_letter",
          headline: "Generation cannot start yet",
          explanation: message,
          nextStep: "Wait for your resume snapshot to load, then retry generation.",
          retryable: true,
          category: "invalid_pair_state",
          code: "missing_baseline_version",
        },
      }));
      releaseStudioArtifactSingleFlight({
        baselineId: effectiveBaselineId ?? null,
        jobId: effectiveJobId ?? null,
        analysisId: requestedAnalysisId ?? null,
        artifactType,
      });
      return fail({
        errorCode: "missing_baseline_version",
        errorMessage: message,
        missingPrereqs: ["baselineVersionId"],
        requestId: request.requestId,
      });
    }
    let activityOutcome: "success" | "failure" = "failure";
    let requestFinalStatus: "completed" | "timeout" = "completed";
    setCoverGenerating(true);
    startWorkflowActivity("generation_running");
    const shouldShowUnlockConfirmation = isFirstGenerationAfterUnlock;
    trackEvent("cover_letter_generation_attempted", {
      source: "studio",
      analysisId: requestedAnalysisId || undefined,
    });
    console.info("[studio] generation_requested", {
      area: "studio",
      operation: "generate",
      status: "info",
      code: "generation_requested",
      artifactType: "cover_letter",
      requestId: request.requestId,
      analysisId: requestedAnalysisId || null,
      jobId: effectiveJobId || null,
      baselineId: effectiveBaselineId || null,
      baselineVersionId: effectiveBaselineVersionId || null,
    });
    setCoverState((current) => ({
      ...current,
      error: null,
      tierGateError: inputsChangedSinceLastFailure ? null : current.tierGateError,
      artifactFailure: null,
    }));
    setCoverWarningFlags([]);
    setCoverAuditId(undefined);
    setCoverLetterComplianceBlocked(null);
    const verifiedOnly = Boolean(opts?.verifiedOnly) || generateNowEligible;
    const payload = normalizeGenerationPayload(buildCoverLetterPayload(verifiedOnly), "cover_letter"); 
    const payloadWithRequestId = {
      ...payload,
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(opts?.sessionKey ? { sessionKey: opts.sessionKey } : {}),
      ...(opts?.regenerationSource ? { regenerationSource: opts.regenerationSource } : {}),
    };
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = 2 * 60_000;
    const timeoutId =
      typeof window !== "undefined" && controller
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null;
    try {
      const response = await fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadWithRequestId),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      const responsePayload = await readResponsePayload(response);
      if (
        isWorkflowRequestStale(requestScope, currentWorkflowScopeRef.current) ||
        activeCoverGenerationRef.current?.requestId !== request.requestId
      ) {
        // Request finished, but Studio moved to a different workflow scope. Release so we don't deadlock
        // if the user returns to this same pair.
        releaseStudioArtifactSingleFlight({
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          analysisId: requestedAnalysisId ?? null,
          artifactType,
        });
        finishStudioGenerationRequest("cover_letter", request, "blocked", requestScope);
        return fail({
          errorCode: "stale_request_scope",
          errorMessage: "Cover letter generation finished after the workflow scope changed.",
          requestId: request.requestId,
          http: { status: response.status, responsePayload },
        });
      }
      if (!response.ok) {
        console.warn("[studio] generation_failed", {
          area: "studio",
          operation: "generate",
          status: "warn",
          code: "generation_failed",
          artifactType: "cover_letter",
          responseStatus: response.status,
          requestId: request.requestId,
        });
        if (
          response.status === 403 &&
          responsePayload &&
          typeof responsePayload === "object" &&
          (responsePayload as Record<string, unknown>).errorCode === "TIER_GATED"
        ) {
          const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
          setCoverState((current) => ({ ...current, tierGateError: tierGate }));
          return fail({
            errorCode: "tier_gated",
            errorMessage: "Cover letter generation was tier gated.",
            requestId: request.requestId,
            http: { status: response.status, responsePayload },
          });
        }
        if (response.status === 409) {
          const existingId = readDuplicateCoverLetterId(responsePayload);
          if (existingId) {
            await loadCoverLetterById(existingId);
            return succeed(request.requestId);
          }
        }
        if (response.status === 422) {
          const failure = readArtifactFailurePresentation(responsePayload);
          if (failure) {
            setCoverState((current) => ({
              ...current,
              artifactFailure: failure,
              error: null,
            }));
            return fail({
              errorCode: failure.code ?? "validation_failed",
              errorMessage: failure.explanation ?? "Cover letter generation returned a validation error.",
              requestId: request.requestId,
              http: { status: response.status, responsePayload },
            });
          }
          const blockedState = parseComplianceBlockedFromPayload(responsePayload);
          if (blockedState) {
            trackEvent("cover_letter_generation_blocked_compliance", {
              source: "studio",
              analysisId: requestedAnalysisId || undefined,
              reasonCode: "compliance_blocked",
            });
            applyCoverLetterComplianceBlocked(blockedState);
            lastFailureSignatureRef.current = generationInputSignature;
            return fail({
              errorCode: "compliance_blocked",
              errorMessage: blockedState.body ?? "Cover letter generation was blocked by compliance requirements.",
              requestId: request.requestId,
              http: { status: response.status, responsePayload },
            });
          }
        }
        lastFailureSignatureRef.current = generationInputSignature;
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setCoverState((current) => ({ ...current, tierGateError: tierGate }));
          return fail({
            errorCode: "tier_gated",
            errorMessage: "Cover letter generation was tier gated.",
            requestId: request.requestId,
            http: { status: response.status, responsePayload },
          });
        }
        throw new Error(formatErrorMessage(responsePayload, "Cover letter generation failed."));
      }
      const existingDuplicateId = readDuplicateCoverLetterId(responsePayload);
      if (existingDuplicateId) {
        await loadCoverLetterById(existingDuplicateId);
        return succeed(request.requestId);
      }
      const initialPresenter = presentCoverLetterGeneration(responsePayload);
      const failure = initialPresenter.failure;
      if (failure) {
        setCoverState((current) => ({
          ...current,
          artifactFailure: failure,
          error: null,
        }));
        return fail({
          errorCode: failure.code ?? "generation_failed",
          errorMessage: failure.explanation ?? "Cover letter generation failed.",
          requestId: request.requestId,
          http: { status: response.status, responsePayload },
        });
      }
      if (initialPresenter.status === "blocked" && initialPresenter.display) {
        trackEvent("cover_letter_generation_blocked_compliance", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "blocked",
        });
        applyCoverLetterComplianceBlocked({
          title: initialPresenter.display.title,
          body: initialPresenter.display.description,
          reasons: initialPresenter.display.reasons,
          cta: initialPresenter.display.cta,
        });
        lastFailureSignatureRef.current = generationInputSignature;
        return fail({
          errorCode: "compliance_blocked",
          errorMessage: initialPresenter.display.description ?? "Cover letter generation was blocked.",
          requestId: request.requestId,
          http: { status: response.status, responsePayload },
        });
      }
      if (initialPresenter.status !== "success") {
        return fail({
          errorCode: "presenter_no_document",
          errorMessage: "Cover letter generation did not return a usable document.",
          requestId: request.requestId,
          http: { status: response.status, responsePayload },
        });
      }
      const validatedResult = await generateWithRetry({
        generate: async (strictMode) => {
          if (!strictMode) return responsePayload;
          const retryResponse = await fetch("/api/cover-letters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              ...normalizeGenerationPayload(buildCoverLetterPayload(generateNowEligible), "cover_letter"), 
              trustGateMode: "strict", 
              ...(request.requestId ? { requestId: request.requestId } : {}),
              ...(opts?.sessionKey ? { sessionKey: opts.sessionKey } : {}),
              ...(opts?.regenerationSource ? { regenerationSource: opts.regenerationSource } : {}),
            }), 
          }); 
          const retryPayload = await readResponsePayload(retryResponse);
          if (!retryResponse.ok) {
            throw new Error(formatErrorMessage(retryPayload, "Cover letter generation failed."));
          }
          const retryPresenter = presentCoverLetterGeneration(retryPayload);
          if (retryPresenter.status !== "success") {
            throw new Error("Cover letter retry did not return a usable document.");
          }
          return retryPayload;
        },
        validate: (payload) =>
          validateCoverLetterOutput(payload, coverLetterJobDescriptionText ?? ""),
      });
      if (
        isWorkflowRequestStale(requestScope, currentWorkflowScopeRef.current) ||
        activeCoverGenerationRef.current?.requestId !== request.requestId
      ) {
        releaseStudioArtifactSingleFlight({
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          analysisId: requestedAnalysisId ?? null,
          artifactType,
        });
        finishStudioGenerationRequest("cover_letter", request, "blocked", requestScope);
        return fail({
          errorCode: "stale_request_scope",
          errorMessage: "Cover letter generation finished after the workflow scope changed.",
          requestId: request.requestId,
        });
      }

      if (!validatedResult.success) {
        trackEvent("cover_letter_generation_limited", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "validation_failed",
        });
        if (generateNowEligible) {
          // Generate-now contract: do not block the artifact on trust-validation failures.
          // Preserve the first successful payload so Studio always has a cover letter to refine/export.
          setCoverState((current) => ({
            ...current,
            response: responsePayload,
            artifactFailure: null,
            error: null,
          }));
          setStudioArtifactPairStatus("completed");
          studioArtifactPresentationStateRef.current = "generated";
          setCoverWarningFlags(extractComplianceWarnings(responsePayload));
          setCoverAuditId(normalizeAuditId(responsePayload));
          return true;
        }
        setStudioArtifactPairStatus("failed");
        setCoverState((current) => ({
          ...current,
          error: GENERATION_TRUST_FALLBACK_ERROR,
        }));
        lastFailureSignatureRef.current = generationInputSignature;
        return fail({
          errorCode: "trust_validation_failed",
          errorMessage: GENERATION_TRUST_FALLBACK_ERROR,
          requestId: request.requestId,
        });
      }

      setCoverState((current) => ({
        ...current,
        response: validatedResult.output,
        artifactFailure: null,
        error: null,
      }));
      setStudioArtifactPairStatus("completed");
      studioArtifactPresentationStateRef.current = "generated";
      if (shouldShowUnlockConfirmation) {
        setHasGeneratedOnce(true);
        setUnlockGenerationConfirmation("Generated from verified evidence aligned to this role.");
      }
      trackEvent("cover_letter_generation_succeeded", {
        source: "studio",
        analysisId: requestedAnalysisId || undefined,
      });
      setCoverWarningFlags(extractComplianceWarnings(validatedResult.output));
      setCoverAuditId(normalizeAuditId(validatedResult.output));
      console.info("[studio] generation_succeeded", {
        area: "studio",
        operation: "generate",
        status: "info",
        code: "generation_succeeded",
        artifactType: "cover_letter",
        requestId: request.requestId,
      });
      activityOutcome = "success";
      return true;
    } catch (error) {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        requestFinalStatus = "timeout";
      }
      if (
        isWorkflowRequestStale(requestScope, currentWorkflowScopeRef.current) ||
        activeCoverGenerationRef.current?.requestId !== request.requestId
      ) {
        finishStudioGenerationRequest("cover_letter", request, "blocked", requestScope);
        return fail({
          errorCode: "stale_request_scope",
          errorMessage: "Cover letter generation aborted because the workflow scope changed.",
          requestId: request.requestId,
        });
      }
      trackEvent("cover_letter_generation_limited", {
        source: "studio",
        analysisId: requestedAnalysisId || undefined,
        reasonCode: requestFinalStatus === "timeout" ? "timeout" : "exception",
      });
      console.error("Cover letter generation failed", error);
      const message =
        requestFinalStatus === "timeout"
          ? "Cover letter generation timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "Cover letter generation failed.";
      setCoverState((current) => ({
        ...current,
        error: message,
        artifactFailure: {
          artifactType: "cover_letter",
          headline: "Generation did not complete",
          explanation: message,
          nextStep: "Review the input and try again with stronger baseline evidence.",
          retryable: true,
          category: requestFinalStatus === "timeout" ? "generation_timeout" : "generation_failed",
          code: requestFinalStatus === "timeout" ? "generation_timeout" : "generation_failed",
        },
      }));
      setStudioArtifactPairStatus("failed");
      return fail({
        errorCode: requestFinalStatus === "timeout" ? "generation_timeout" : "generation_failed",
        errorMessage: message,
        requestId: request.requestId,
      });
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (!activeCoverGenerationRef.current || activeCoverGenerationRef.current?.requestId === request.requestId) {
        setCoverGenerating(false);
      }
      await stopWorkflowActivity("generation_running", activityOutcome);
      finishStudioGenerationRequest("cover_letter", request, requestFinalStatus, requestScope);
    }
  };

  useEffect(() => {
    if (!pendingRefinementAction) return;
    let cancelled = false;

    const run = async () => {
      setRefinementApplying(true);
      try {
        if (pendingRefinementAction.targets.includes("resume")) {
          await handleResumeDraft();
        }
        if (pendingRefinementAction.targets.includes("cover_letter")) {
          await handleCoverDraft();
        }
        if (!cancelled) {
          setRefinementStatusMessage(pendingRefinementAction.summary);
        }
        trackEvent("refinement_applied", {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          refinementAction: pendingRefinementAction.action,
          refinementType: pendingRefinementAction.instruction?.type ?? "reset",
          refinementTarget: pendingRefinementAction.instruction?.target ?? "both",
          refinementCount: refinementInstructions.length,
        });
      } finally {
        if (!cancelled) {
          setPendingRefinementAction(null);
          setRefinementApplying(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [effectiveBaselineId, effectiveJobId, pendingRefinementAction, refinementInstructions.length]);

  const buildClaimVerificationHref = useCallback(
    (claimText: string) => {
      return getFitReviewHref({
        jobId: effectiveJobId,
        baselineId: effectiveBaselineId,
        baselineVersionId: effectiveBaselineVersionId,
        assessmentId: requestedAnalysisId || null,
        analysisId: requestedAnalysisId || null,
        highlightClaim: claimText,
      });
    },
    [effectiveBaselineId, effectiveBaselineVersionId, effectiveJobId, requestedAnalysisId],
  );

  const handleRegenerateDraft = useCallback(async () => {
    const sessionKey = `${effectiveBaselineId ?? "base"}:${effectiveJobId ?? "job"}:regenerate:${Date.now()}`;
    await handleResumeDraft({ sessionKey });
    await handleCoverDraft({ sessionKey });
  }, [effectiveBaselineId, effectiveJobId, handleCoverDraft, handleResumeDraft]);

  const handleGenerateDraftAnyway = useCallback(async () => {
    if (draftAnywayRequestedRef.current) return;
    draftAnywayRequestedRef.current = true;
    setDraftAnywayRequested(true);

    const sessionKey = `${effectiveBaselineId ?? "base"}:${effectiveJobId ?? "job"}:draft_anyway:${Date.now()}`;
    await handleResumeDraft({ verifiedOnly: true, bypassReadinessGate: true, sessionKey });
    await handleCoverDraft({ verifiedOnly: true, bypassReadinessGate: true, sessionKey });
  }, [effectiveBaselineId, effectiveJobId, handleCoverDraft, handleResumeDraft]);

  const openClaimEditModal = useCallback(
    (claim: ArtifactClaimRef) => {
      setClaimEditDraft(claim);
      setClaimEditText(claim.text);
      trackEvent("claim_edit_clicked", {
        source: "studio",
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        claimText: claim.text,
        artifactType: claim.artifactType,
        confidence: artifactQuality.confidence,
        artifactScore: artifactQuality.artifactScore,
      });
    },
    [artifactQuality.artifactScore, artifactQuality.confidence, effectiveBaselineId, effectiveJobId],
  );

  const dismissClaim = useCallback(
    (claim: ArtifactClaimRef) => {
      setDismissedClaimTexts((current) => {
        const next = new Set(current.map(normalizeClaimText));
        next.add(normalizeClaimText(claim.text));
        return Array.from(next);
      });
      trackEvent("claim_dismissed", {
        source: "studio",
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        claimText: claim.text,
        artifactType: claim.artifactType,
        confidence: artifactQuality.confidence,
        artifactScore: artifactQuality.artifactScore,
      });
    },
    [artifactQuality.artifactScore, artifactQuality.confidence, effectiveBaselineId, effectiveJobId],
  );

  const verifyClaim = useCallback(
    (claim: ArtifactClaimRef) => {
      trackEvent("claim_verify_clicked", {
        source: "studio",
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        claimText: claim.text,
        artifactType: claim.artifactType,
        confidence: artifactQuality.confidence,
        artifactScore: artifactQuality.artifactScore,
      });
      void router.push(buildClaimVerificationHref(claim.text));
    },
    [
      artifactQuality.artifactScore,
      artifactQuality.confidence,
      buildClaimVerificationHref,
      effectiveBaselineId,
      effectiveJobId,
      router,
    ],
  );

  const saveEditedClaim = useCallback(() => {
    if (!claimEditDraft) return;
    const nextClaimText = claimEditText.trim();
    if (!nextClaimText) return;
    setVerifiedClaimTexts((current) => {
      const next = new Set(current.map(normalizeClaimText));
      next.add(normalizeClaimText(nextClaimText));
      return Array.from(next);
    });
    setClaimEditDraft(null);
    setClaimEditText("");
    trackEvent("claim_verify_clicked", {
      source: "studio",
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      claimText: nextClaimText,
      artifactType: claimEditDraft.artifactType,
      confidence: artifactQuality.confidence,
      artifactScore: artifactQuality.artifactScore,
    });
    void router.push(buildClaimVerificationHref(nextClaimText));
  }, [
    artifactQuality.artifactScore,
    artifactQuality.confidence,
    buildClaimVerificationHref,
    claimEditDraft,
    claimEditText,
    effectiveBaselineId,
    effectiveJobId,
    router,
  ]);

  const cancelClaimEdit = useCallback(() => {
    setClaimEditDraft(null);
    setClaimEditText("");
  }, []);

  useEffect(() => {
    if (!verifiedClaimParams.length) return;
    if (studioArtifactPresentationStateRef.current === "hydrated") return;
    if (hasCompletedGeneration || studioArtifactPairStatus === "completed") return;
    const nextKey = verifiedClaimParams.map(normalizeClaimText).sort().join("|");
    if (processedVerificationRef.current === nextKey) return;
    processedVerificationRef.current = nextKey;
    setVerifiedClaimTexts((current) => {
      const next = new Set(current.map(normalizeClaimText));
      verifiedClaimParams.forEach((claim) => next.add(normalizeClaimText(claim)));
      return Array.from(next);
    });
    if (resumeState.response) {
      void handleResumeDraft();
    }
    if (coverState.response) {
      void handleCoverDraft();
    }
  }, [coverState.response, handleCoverDraft, hasCompletedGeneration, resumeState.response, verifiedClaimParams]);

  // Legacy auto-generation path removed: canonical contract-driven effect below is authoritative.
  useEffect(() => {}, []);

  useEffect(() => {
    if (!autoOpportunitySignature) return;
    if (autoOpportunitySignatureRef.current === autoOpportunitySignature) return;
    if (!canGenerateDocuments || !qualifiedForGeneration) return;

    const storageKey = `ttr:auto-opportunity:${autoOpportunitySignature}`;
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    if (storage && typeof storage.getItem === "function" && storage.getItem(storageKey) === "true") {
      autoOpportunitySignatureRef.current = autoOpportunitySignature;
      return;
    }

    autoOpportunitySignatureRef.current = autoOpportunitySignature;
    if (activeAutoOpportunityRef.current === autoOpportunitySignature) return;
    activeAutoOpportunityRef.current = autoOpportunitySignature;

    void (async () => {
      try {
        const response = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: effectiveJobId,
            analysisId: requestedAnalysisId,
            baselineId: effectiveBaselineId,
            score: Math.round(analysisScore ?? 0),
            company: selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? "Unknown company",
            roleTitle: selectedJob?.title ?? analysis?.jobTitle ?? analysis?.title ?? "Untitled role",
            generationCompleted: Boolean(hasCompletedGeneration),
            savedEvidenceSummary: evidenceSummaryBullets.slice(0, 3),
          }),
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { updatedAt?: string; status?: string; baselineId?: string | null; jobId?: string | null }
          | null;
        if (storage && typeof storage.setItem === "function") {
          storage.setItem(storageKey, "true");
        }
        setOpportunityContext({
          status: typeof payload?.status === "string" ? payload.status : "SAVED",
          updatedAt: typeof payload?.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
          baselineId: effectiveBaselineId ?? null,
          jobId: effectiveJobId ?? null,
          pairKey: buildWorkflowRequestKey("opportunity_auto_add", {
            baselineId: effectiveBaselineId,
            jobId: effectiveJobId,
          }),
        });
        trackEvent("opportunity_saved", {
          source: "workspace",
          score: Math.round(analysisScore ?? 0),
          baselineId: effectiveBaselineId ?? undefined,
          jobId: effectiveJobId ?? undefined,
        });
      } catch {
        // Best effort: do not block generation.
      } finally {
        activeAutoOpportunityRef.current = null;
      }
    })();
  }, [
    analysis?.company,
    analysis?.companyName,
    analysis?.jobTitle,
    analysis?.title,
    analysisScore,
    autoOpportunitySignature,
    canGenerateDocuments,
    effectiveBaselineId,
    effectiveJobId,
    hasCompletedGeneration,
    qualifiedForGeneration,
    requestedAnalysisId,
    selectedJob?.company,
    selectedJob?.title,
    evidenceSummaryBullets,
  ]);

  // Canonical post-generation authority:
  // Once we have *any* usable output, we do not surface lifecycle failure language in the hero/top summary.
  // Failures still render at the specific artifact card level (resume/cover) where they govern the next action.
  const lifecycleArtifactFailure = resumeState.artifactFailure ?? coverState.artifactFailure ?? null;
  const suppressTopLevelFailureLanguage = hasCompletedGeneration;
  const topLevelArtifactFailure = suppressTopLevelFailureLanguage ? null : lifecycleArtifactFailure;
  const showGenericRetry =
    !suppressTopLevelFailureLanguage &&
    !topLevelArtifactFailure &&
    studioArtifactPairStatus === "failed";
  const studioNextMove = useMemo(
    () =>
      resolveStudioNextMove({
        decision: studioCanonicalDecision,
        analysisScore,
        artifactFailure: topLevelArtifactFailure,
        actions: {
          generateResume: () => {
            void handleResumeDraft();
          },
          generateCoverLetter: () => {
            void handleCoverDraft();
          },
          reviewTopGaps: () => {
            void router.push(fitReviewHref);
          },
          improveExperience: () => {
            void router.push(improveBaselineHref);
          },
          analyzeAnotherRole: () => {
            void router.push("/analyze");
          },
          learnSupportedInputs: () => {
            void router.push(resultsHref);
          },
          retryGeneration: () => {
            if (resumeState.artifactFailure) {
              void handleResumeDraft();
              return;
            }
            if (coverState.artifactFailure) {
              void handleCoverDraft();
              return;
            }
            void handleResumeDraft();
          },
        },
      }),
    [
      topLevelArtifactFailure,
      studioCanonicalDecision,
      analysisScore,
      coverState.artifactFailure,
      handleCoverDraft,
      handleResumeDraft,
      improveBaselineHref,
      fitReviewHref,
      resultsHref,
      router,
    ],
  );

  const handleRetryResumeGeneration = useCallback(() => {
    trackEvent("studio_retry_clicked", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
      artifactType: "resume",
      failureCategory: resumeState.artifactFailure?.category ?? resumePresenter.failure?.category ?? null,
    });
    void handleResumeDraft();
  }, [
    analysisScore,
    effectiveBaselineId,
    effectiveJobId,
    handleResumeDraft,
    requestedAnalysisId,
    resumePresenter.failure?.category,
    resumeState.artifactFailure?.category,
  ]);

  const handleRetryCoverGeneration = useCallback(() => {
    trackEvent("studio_retry_clicked", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
      artifactType: "cover_letter",
      failureCategory: coverState.artifactFailure?.category ?? coverPresenter.failure?.category ?? null,
    });
    void handleCoverDraft();
  }, [
    analysisScore,
    coverPresenter.failure?.category,
    coverState.artifactFailure?.category,
    effectiveBaselineId,
    effectiveJobId,
    handleCoverDraft,
    requestedAnalysisId,
  ]);

  const handleApplyToThisRole = useCallback(() => {
    const previousStatus = applicationContext?.status ?? null;
    trackEvent("studio_apply_clicked", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
      currentStatus: previousStatus,
    });

    if (previousStatus?.toLowerCase() === "applied") {
      setApplicationActionMessage("This application is already marked applied.");
      return;
    }

    const openUrl = applicationJobUrl;
    if (openUrl && typeof window !== "undefined") {
      window.open(openUrl, "_blank", "noopener,noreferrer");
    }

    const applySignature = `${applicationPairSignature ?? "application_pair"}:applied`;
    if (applicationApplySignatureRef.current === applySignature) {
      return;
    }
    applicationApplySignatureRef.current = applySignature;

    void (async () => {
      try {
        const response = await fetch("/api/applications/pair", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baselineId: effectiveBaselineId,
            jobId: effectiveJobId,
            companyName:
              selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? "Unknown company",
            roleTitle: selectedJob?.title ?? analysis?.jobTitle ?? analysis?.title ?? "Untitled role",
            jobUrl: openUrl,
            sourceUrl: openUrl,
            externalApplicationUrl: openUrl,
            analysisId: requestedAnalysisId || null,
            baselineVersionId: effectiveBaselineVersionId || null,
            applicationStatus: "Applied",
            appliedDate: new Date().toISOString(),
            fitScore: Math.round(analysisScore ?? 0),
          }),
        });
        const payload = await readResponsePayload(response);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          return;
        }
        const record = payload as Record<string, unknown>;
        const nextStatus = typeof record.status === "string" ? record.status : "Applied";
        setApplicationContext((current) => ({
          id: typeof record.id === "string" ? record.id : current?.id ?? "",
          status: nextStatus,
          appliedAt:
            typeof record.appliedAt === "string"
              ? record.appliedAt
              : typeof record.appliedDate === "string"
                ? record.appliedDate
                : new Date().toISOString(),
          lastTouchedAt:
            typeof record.lastTouchedAt === "string"
              ? record.lastTouchedAt
              : current?.lastTouchedAt ?? new Date().toISOString(),
          baselineId:
            typeof record.baselineId === "string" ? record.baselineId : current?.baselineId ?? null,
          jobId: typeof record.jobId === "string" ? record.jobId : current?.jobId ?? null,
          jobUrl: typeof record.jobUrl === "string" ? record.jobUrl : current?.jobUrl ?? openUrl ?? null,
          notes: typeof record.notes === "string" ? record.notes : current?.notes ?? null,
          sourceUrl:
            typeof record.sourceUrl === "string" ? record.sourceUrl : current?.sourceUrl ?? openUrl ?? null,
          createdAt:
            typeof record.createdAt === "string"
              ? record.createdAt
              : current?.createdAt ?? new Date().toISOString(),
          updatedAt:
            typeof record.updatedAt === "string"
              ? record.updatedAt
              : current?.updatedAt ?? new Date().toISOString(),
          resumeArtifacts: current?.resumeArtifacts ?? [],
        }));
        setApplicationProgress((current) => {
          if (!current) return current;
          const nextActivity = {
            id:
              typeof record.id === "string"
                ? record.id
                : applicationContext?.id ?? applicationPairSignature ?? "current-application",
            company:
              selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? "Unknown company",
            title: selectedJob?.title ?? analysis?.jobTitle ?? analysis?.title ?? "Untitled role",
            status: nextStatus,
            updatedAt:
              typeof record.updatedAt === "string"
                ? record.updatedAt
                : new Date().toISOString(),
            appliedAt:
              typeof record.appliedAt === "string"
                ? record.appliedAt
              : typeof record.appliedDate === "string"
                  ? record.appliedDate
                  : new Date().toISOString(),
          };
          const existingIndex = current.recentActivity.findIndex(
            (item) => item.id === nextActivity.id,
          );
          const nextRecentActivity =
            existingIndex >= 0
              ? [
                  nextActivity,
                  ...current.recentActivity
                    .filter((item) => item.id !== nextActivity.id)
                    .slice(0, 2),
                ]
              : [nextActivity, ...current.recentActivity].slice(0, 3);
          const nextCompleted =
            nextStatus.toLowerCase() === "applied"
              ? current.completedApplicationsCount +
                (previousStatus?.toLowerCase() === "applied" ? 0 : 1)
              : current.completedApplicationsCount;
          const nextTotal =
            current.totalApplicationsCount +
            (previousStatus?.toLowerCase() === "applied"
              ? 0
              : nextStatus.toLowerCase() === "applied"
                ? 1
                : 0);
          return {
            totalApplicationsCount: nextTotal,
            completedApplicationsCount: nextCompleted,
            recentActivity: nextRecentActivity,
          };
        });
        setApplicationActionMessage(
          "Application submitted. Your resume and cover letter were marked applied.",
        );
        trackEvent("application_created_or_upserted", {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          currentStatus: nextStatus,
          created: !Boolean(previousStatus),
          score: analysisScore,
        });
        if (previousStatus?.toLowerCase() !== nextStatus.toLowerCase()) {
          trackEvent("application_status_updated", {
            source: "studio",
            baselineId: effectiveBaselineId || null,
            jobId: effectiveJobId || null,
            currentStatus: nextStatus,
            previousStatus,
            score: analysisScore,
          });
        }
      } catch {
        setApplicationActionMessage(
          openUrl
            ? "Open the job posting and submit your application."
            : "Open the job posting and submit your application.",
        );
      }
    })();
  }, [
    analysis?.company,
    analysis?.companyName,
    analysis?.jobTitle,
    analysis?.title,
    analysisScore,
    applicationContext?.status,
    applicationJobUrl,
    applicationPairSignature,
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    requestedAnalysisId,
    selectedJob?.company,
    selectedJob?.title,
  ]);

  const handleAnalyzeAnotherRole = useCallback(() => {
    trackEvent("studio_next_role_clicked", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
      currentStatus: applicationContext?.status ?? null,
      totalApplicationsCount: applicationProgress?.totalApplicationsCount ?? null,
    });
    router.push(nextRoleHref);
  }, [
    analysisScore,
    applicationContext?.status,
    applicationProgress?.totalApplicationsCount,
    effectiveBaselineId,
    effectiveJobId,
    nextRoleHref,
    requestedAnalysisId,
    router,
  ]);

  const handlePrimaryResumeAction = useCallback(() => {
    if (hasResumeArtifact) {
      generationSectionRef.current?.scrollIntoView?.({ block: "start" });
      return;
    }
    void handleResumeDraft();
  }, [generationSectionRef, handleResumeDraft, hasResumeArtifact]);

  const handlePrimaryCoverAction = useCallback(() => {
    if (hasCoverLetterArtifact) {
      generationSectionRef.current?.scrollIntoView?.({ block: "start" });
      return;
    }
    void handleCoverDraft();
  }, [generationSectionRef, handleCoverDraft, hasCoverLetterArtifact]);

  const handleResumeBasicDraft = async () => {
    await handleResumeDraft();
  };

  const exportCoverLetter = async (format: "docx" | "pdf") => {
    if (!canProceedWithStudioDrafts) {
      setCoverState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a cover letter.",
      }));
      return;
    }
    if (!isPro) {
      setCoverState((current) => ({
        ...current,
        error: "Upgrade to Pro to download documents.",
      }));
      return;
    }
    if (!hasCoverLetterArtifact || coverPresenter.status !== "success") {
      setCoverState((current) => ({
        ...current,
        error: "Generate Cover Letter before downloading.",
      }));
      return;
    }
    setCoverExportFormat(format);
    setCoverState((current) => ({ ...current, error: null, tierGateError: null }));
    const payload = normalizeGenerationPayload(buildCoverLetterPayload(true), "cover_letter");
    try {
      const response = await fetch(
        `/api/cover-letters/export?format=${encodeURIComponent(format)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const responsePayload = await readResponsePayload(response);
        if (response.status === 422) {
          const blockedState = parseComplianceBlockedFromPayload(responsePayload);
          if (blockedState) {
            applyCoverLetterComplianceBlocked(blockedState);
            return;
          }
        }
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setCoverState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
        throw new Error(formatErrorMessage(responsePayload, "Cover letter export failed."));
      }

      const blob = await response.blob();
      downloadBlob(blob, `cover-letter.${format}`);
      recordArtifactUsedIntent();
      setRecentIntent(readRecentIntentState());
      trackEvent("studio_cover_letter_downloaded", {
        source: "studio",
        analysisId: requestedAnalysisId || null,
        baselineId: effectiveBaselineId || null,
        jobId: effectiveJobId || null,
        score: analysisScore,
        format,
      });
      trackEvent("artifact_used_intent", {
        source: "studio",
        artifactType: "cover_letter",
        action: "export",
        format,
        status: completionCopy.title,
      });
      trackFinalRoleExportTelemetry("cover_letter");
      if (refinementInstructions.length > 0) {
        trackEvent("refinement_followed_by_export", {
          source: "studio",
          baselineId: effectiveBaselineId || null,
          jobId: effectiveJobId || null,
          artifactType: "cover_letter",
          refinementCount: refinementInstructions.length,
        });
      }
    } catch (error) {
      console.error("Cover letter export failed", error);
      const message = error instanceof Error ? error.message : "Cover letter export failed.";
      setCoverState((current) => ({ ...current, error: message }));
    } finally {
      setCoverExportFormat(null);
    }
  };

  const handleCopyCoverLetter = useCallback(async () => {
    if (!hasCoverLetterArtifact || !coverState.response) {
      setCoverState((current) => ({ ...current, error: "Generate Cover Letter before copying." }));
      return;
    }
    const text = coverLetterParagraphs.join("\n\n");
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      setCoverState((current) => ({ ...current, error: "Copying the cover letter text was not available." }));
      return;
    }
    setCoverCopyStatus("Cover letter copied");
    recordArtifactUsedIntent();
    setRecentIntent(readRecentIntentState());
    trackEvent("studio_cover_letter_copied", {
      source: "studio",
      analysisId: requestedAnalysisId || null,
      baselineId: effectiveBaselineId || null,
      jobId: effectiveJobId || null,
      score: analysisScore,
    });
    trackEvent("artifact_used_intent", {
      source: "studio",
      artifactType: "cover_letter",
      action: "use_now",
      status: completionCopy.title,
    });
  }, [
    analysisScore,
    completionCopy.title,
    coverLetterParagraphs,
    coverState.response,
    effectiveBaselineId,
    effectiveJobId,
    hasCoverLetterArtifact,
    requestedAnalysisId,
  ]);

  useEffect(() => {
    if (!resumeCopyStatus) return;
    const timeout = window.setTimeout(() => setResumeCopyStatus(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [resumeCopyStatus]);

  useEffect(() => {
    if (!coverCopyStatus) return;
    const timeout = window.setTimeout(() => setCoverCopyStatus(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [coverCopyStatus]);

  function renderCardStatus(status: StudioCardStatus, documentName: string) {
    switch (status) {
      case "not_generated_yet":
        return `${documentName} not generated yet`;
      case "ready_to_generate":
        return `Ready to review ${documentName.toLowerCase()}`;
      case "generating":
        return `Generating ${documentName.toLowerCase()}`;
      case "generated_successfully":
        return `${documentName} generated successfully`;
      case "needs_correction":
        return `${documentName} needs correction`;
      case "blocked_by_compliance":
        return `${documentName} blocked by compliance`;
      case "needs_more_baseline_detail":
        return "More detail needed";
      case "failed_due_to_system_error":
        return `${documentName} generation is currently constrained`;
      default:
        return `${documentName} status unavailable`;
    }
  }

  const appliedMomentumHero =
    isInstantDraftExperience && hasCompletedGeneration && isApplicationApplied ? (
      <section
        className="space-y-5 rounded-[28px] border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.16),rgba(15,23,42,0.82))] p-6 md:p-8 shadow-[0_24px_60px_rgba(15,23,42,0.35)]"
        data-testid="studio-application-complete-hero"
      >
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
            Application complete
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 md:text-[36px]">
            Application submitted
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-200">
            Let&apos;s find your next opportunity.
          </p>
          {applicationActionMessage ? (
            <p className="text-sm font-medium text-emerald-100">{applicationActionMessage}</p>
          ) : null}
        </div>
        {applicationProgress ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Progress
                </p>
                <p className="text-sm text-slate-200">
                  {applicationProgress.completedApplicationsCount} applications completed
                </p>
              </div>
              <p className="text-xs font-medium text-slate-300">
                {applicationProgress.recentActivity.length > 0
                  ? `Latest: ${applicationProgress.recentActivity[0].company}, ${applicationProgress.recentActivity[0].title}`
                  : "No recent activity yet"}
              </p>
            </div>
          </section>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <FormButton
            variant="secondary"
            onClick={() => void exportResume("docx")}
            disabled={!canExportResume || resumeExportFormat === "docx"}
          >
            {resumeExportFormat === "docx" ? "Downloading..." : "Download Resume"}
          </FormButton>
          <FormButton
            variant="secondary"
            onClick={() => void exportCoverLetter("docx")}
            disabled={!canExportCover || coverExportFormat === "docx"}
          >
            {coverExportFormat === "docx" ? "Downloading..." : "Download Cover Letter"}
          </FormButton>
          <FormButton variant="secondary" onClick={() => void handleCopyResume()}>
            Copy Resume
          </FormButton>
          <FormButton variant="secondary" onClick={() => void handleCopyCoverLetter()}>
            Copy Cover Letter
          </FormButton>
          <FormButton onClick={handleAnalyzeAnotherRole}>Analyze another role</FormButton>
          <Link
            href={fitReviewHref}
            className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
          >
            Refine
          </Link>
        </div>
      </section>
    ) : null;

  const focusResumeTarget = useCallback(
    (target: { type: "summary" } | { type: "role"; index: number }) => {
      if (showLowQualityRecoveryLane && !showFullLowQualityResume) {
        setShowFullLowQualityResume(true);
      }

      const clearHighlights = () => {
        document
          .querySelectorAll<HTMLElement>('[data-studio-focus-highlight="true"]')
          .forEach((node) => node.removeAttribute("data-studio-focus-highlight"));
      };

      const highlight = (element: HTMLElement | null) => {
        if (!element) return;
        clearHighlights();
        element.setAttribute("data-studio-focus-highlight", "true");
        window.setTimeout(() => {
          element.removeAttribute("data-studio-focus-highlight");
        }, 1800);
      };

      const focusElement = (element: HTMLElement | null) => {
        if (!element) return false;
        element.scrollIntoView?.({ block: "start" });
        element.focus?.({ preventScroll: true });
        return true;
      };

      if (target.type === "summary") {
        const section = document.querySelector<HTMLElement>('[data-testid="studio-resume-summary-section"]');
        const header = document.querySelector<HTMLElement>('[data-testid="studio-resume-summary-header"]');
        const expanded = header?.getAttribute("aria-expanded") === "true";
        if (header && !expanded) header.click();
        highlight(section);
        focusElement(section);
        return;
      }

      const header = document.querySelector<HTMLElement>(
        `[data-testid="studio-resume-experience-role-header-${target.index}"]`,
      );
      if (!header) return;

      const roleBlock = document.querySelector<HTMLElement>(
        `[data-studio-role-block=\"true\"][data-role-index=\"${target.index}\"]`,
      );
      const expanded = header.getAttribute("aria-expanded") === "true";
      if (!expanded) {
        header.click();
      }

      // Defer focus until after the accordion updates.
      window.setTimeout(() => {
        const refreshed = document.querySelector<HTMLElement>(
          `[data-testid="studio-resume-experience-role-header-${target.index}"]`,
        );
        highlight(roleBlock);
        focusElement(refreshed);
      }, 0);
    },
    [showFullLowQualityResume, showLowQualityRecoveryLane],
  );

  const resumeModelForFocus = useMemo(
    () => effectiveResumeModel ?? readResumeModel(resumeState.response),
    [effectiveResumeModel, resumeState.response],
  );

  const studioFocusInputs = useMemo(() => {
    const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const summary = toText(resumeModelForFocus?.summary);
    const experiences = Array.isArray(resumeModelForFocus?.experience)
      ? resumeModelForFocus!.experience
          .map((entry) => {
            const company = toText(entry.company);
            const roleTitle = toText(entry.roleTitle);
            const bullets = Array.isArray(entry.bullets)
              ? entry.bullets.map((value) => toText(value)).filter(Boolean)
              : [];
            return { company, roleTitle, bullets };
          })
          .filter((entry) => entry.company && entry.roleTitle && entry.bullets.length > 0)
      : [];

    return { hasSummary: Boolean(summary), experienceCount: experiences.length };
  }, [resumeModelForFocus]);

  const studioFocusRole0: FocusAction | null =
    isReadySuccessState && studioFocusInputs.experienceCount
      ? {
          testId: "studio-focus-action-role-0",
          title: "Improve your most recent role",
          description: "Recruiters usually scan your most recent experience first.",
          onClick: () => focusResumeTarget({ type: "role", index: 0 }),
        }
      : null;
  const studioFocusSummary: FocusAction | null =
    isReadySuccessState && studioFocusInputs.hasSummary
      ? {
          testId: "studio-focus-action-summary",
          title: "Review your summary",
          description: "Your summary shapes the first impression of your fit.",
          onClick: () => focusResumeTarget({ type: "summary" }),
        }
      : null;
  const studioFocusRole1: FocusAction | null =
    isReadySuccessState && studioFocusInputs.experienceCount > 1
      ? {
          testId: "studio-focus-action-role-1",
          title: "Strengthen another key role",
          description: "A second strong role reinforces depth and consistency.",
          onClick: () => focusResumeTarget({ type: "role", index: 1 }),
        }
      : null;

  const studioFocusPrimary: FocusAction | null = studioFocusRole0 ?? studioFocusSummary ?? null;
  const studioFocusSecondary: FocusAction[] = [];
  if (studioFocusPrimary === studioFocusRole0) {
    if (studioFocusSummary) studioFocusSecondary.push(studioFocusSummary);
    if (studioFocusRole1) studioFocusSecondary.push(studioFocusRole1);
  } else if (studioFocusPrimary === studioFocusSummary) {
    if (studioFocusRole1) studioFocusSecondary.push(studioFocusRole1);
  }

  const readyHeaderMode = isReadySuccessState && !isApplicationApplied
    ? hasUsableResume && !hasUsableCoverLetter
      ? "resume_only"
      : !hasUsableResume && hasUsableCoverLetter
        ? "cover_only"
        : hasUsableResume && hasUsableCoverLetter
          ? "application"
          : "application"
    : null;

  const workflowOrchestratorCore = useMemo(() => {
    const suppressPairGeneratingPresentation = activeGenerationReadiness.blocked;
    // Keep pair authority consistent with the exact local booleans that can make the artifact cards render "Generating...".
    const resumeVisibleGenerating =
      resumeAutoGenerating || resumeGenerateNowPending || resumeGenerating || resumeSingleFlightInFlight;
    const coverVisibleGenerating =
      coverAutoGenerating || coverGenerateNowPending || coverGenerating || coverSingleFlightInFlight;
    const resumeStatus: "missing" | "generating" | "ready" | "failed" = hasUsableResume
      ? "ready"
      : !suppressPairGeneratingPresentation &&
          (resumeVisibleGenerating || autoGenerationInFlight || studioArtifactPairStatus === "in_progress")
        ? "generating"
        : resumeState.artifactFailure
          ? "failed"
          : "missing";

    const coverStatus: "missing" | "generating" | "ready" | "failed" = hasUsableCoverLetter
      ? "ready"
      : !suppressPairGeneratingPresentation &&
          (coverVisibleGenerating || autoGenerationInFlight || studioArtifactPairStatus === "in_progress")
        ? "generating"
        : coverState.artifactFailure
          ? "failed"
          : "missing";

    return resolveWorkflowOrchestrator({
      surface: "studio",
      ids: {
        baselineId: effectiveBaselineId || null,
        baselineVersionId: effectiveBaselineVersionId || null,
        jobId: effectiveJobId || null,
        analysisId: effectiveRequestedAnalysisId || null,
        assessmentId: effectiveRequestedAnalysisId || null,
      },
      score: typeof analysisScore === "number" ? analysisScore : null,
      generationReadiness: activeGenerationReadiness,
      workflowAuthority,
      artifact: {
        hasResume: hasUsableResume,
        hasCoverLetter: hasUsableCoverLetter,
        pairStatus: studioArtifactPairStatus ?? null,
        generating:
          !suppressPairGeneratingPresentation &&
          (autoGenerationInFlight ||
            resumeVisibleGenerating ||
            coverVisibleGenerating ||
            studioArtifactPairStatus === "in_progress"),
        failure: topLevelArtifactFailure
          ? { category: topLevelArtifactFailure.category, retryable: topLevelArtifactFailure.retryable }
          : null,
      },
      resume: {
        status: resumeStatus,
        confidence: artifactQuality.confidence ?? null,
        failure: resumeState.artifactFailure
          ? { category: resumeState.artifactFailure.category, retryable: resumeState.artifactFailure.retryable }
          : null,
      },
      coverLetter: {
        status: coverStatus,
        confidence: artifactQuality.confidence ?? null,
        failure: coverState.artifactFailure
          ? { category: coverState.artifactFailure.category, retryable: coverState.artifactFailure.retryable }
          : null,
      },
      artifactQuality: { confidence: artifactQuality.confidence ?? null },
      allowStaleArtifactPreview: allowStaleArtifactPreview,
      searchParamsString: searchParamValue,
      unlockDismissed: unlockFlowDismissed,
      unlockReanalysisFailure: unlockReanalysisFailure
        ? { priorScore: unlockReanalysisFailure.priorScore, priorReadiness: unlockReanalysisFailure.priorReadiness, returnToEvidenceHref: "" }
        : null,
      postUnlock: {
        active: false,
        dismissed: true,
        priorScore: null,
        priorReadiness: null,
        newReadiness: null,
        reanalysisFailed: false,
        generationAllowedNow: false,
        returnToEvidenceHref: "",
      },
      generationReady: { dismissed: true, phase: "ready" },
      resumeFailure: resumeState.artifactFailure,
      coverFailure: coverState.artifactFailure,
      activity: workflowActivity,
    });
  }, [
    activeGenerationReadiness,
    allowStaleArtifactPreview,
    analysisScore,
    autoGenerationInFlight,
    coverAutoGenerating,
    coverGenerating,
    coverGenerateNowPending,
    coverSingleFlightInFlight,
    coverState.artifactFailure,
    hasUsableCoverLetter,
    hasUsableResume,
    resumeAutoGenerating,
    resumeGenerating,
    resumeGenerateNowPending,
    resumeSingleFlightInFlight,
    resumeState.artifactFailure,
    searchParamValue,
    studioArtifactPairStatus,
    topLevelArtifactFailure?.category,
    topLevelArtifactFailure?.retryable,
    unlockFlowDismissed,
    unlockReanalysisFailure?.priorReadiness,
    unlockReanalysisFailure?.priorScore,
    workflowActivity,
    workflowAuthority,
  ]);

  const workflowSurfaceAuthorityHero = workflowOrchestratorCore.authorityState;
  const heroHeadline = workflowSurfaceAuthorityHero.headline;
  const heroBody = workflowSurfaceAuthorityHero.body;
  const normalizedArtifacts = workflowOrchestratorCore.artifactState;

  // Studio "generated_unusable" lane: generation completed but output failed quality and is not usable.
  // Must be declared before any render branches that reference it (e.g. low-quality recovery lanes).
  const studioContractSignature = workflowOrchestratorCore.contract?.generation.auto.signature ?? null;
  const studioEffectiveGenerationState =
    workflowOrchestratorCore.contract?.generation.state === "generated" && !artifactContract.hasUsableArtifacts
      ? "generated_unusable"
      : workflowOrchestratorCore.contract?.generation.state ?? null;
  const studioIsGeneratedUnusable = studioEffectiveGenerationState === "generated_unusable";

  const resumeVisibleGeneratingDebug =
    resumeAutoGenerating || resumeGenerateNowPending || resumeGenerating || resumeSingleFlightInFlight;
  const coverVisibleGeneratingDebug =
    coverAutoGenerating || coverGenerateNowPending || coverGenerating || coverSingleFlightInFlight;
  const artifactGeneratingDebug =
    !activeGenerationReadiness.blocked &&
    (autoGenerationInFlight ||
      resumeVisibleGeneratingDebug ||
      coverVisibleGeneratingDebug ||
      studioArtifactPairStatus === "in_progress");
  const authorityDebugAttrs: Record<string, string> =
    process.env.NODE_ENV !== "production"
      ? {
          "data-debug-canonical-state": workflowSurfaceAuthorityHero.canonicalState,
          "data-debug-resume-auto-generating": String(resumeAutoGenerating),
          "data-debug-cover-auto-generating": String(coverAutoGenerating),
          "data-debug-resume-visible-generating": String(resumeVisibleGeneratingDebug),
          "data-debug-cover-visible-generating": String(coverVisibleGeneratingDebug),
          "data-debug-artifact-generating": String(artifactGeneratingDebug),
        }
      : {};

  const normalizedArtifactsPanelModel = useMemo(() => {
    const state = normalizedArtifacts.artifactDisplayState;
    const headline = normalizedArtifacts.primaryArtifactTruth.headline;
    const body = normalizedArtifacts.primaryArtifactTruth.body;

    if (state === "none") return null;

    if (state === "both_ready_high_confidence") {
      return { canonicalState: "documents_ready" as const, trustTone: "complete" as const, headline, body };
    }

    if (state === "both_ready_mixed_confidence") {
      return { canonicalState: "documents_ready" as const, trustTone: "ready" as const, headline, body };
    }

    if (state === "stale_output_hidden") {
      return {
        canonicalState: workflowSurfaceAuthorityHero.canonicalState,
        trustTone: workflowSurfaceAuthorityHero.trustTone,
        headline,
        body,
      };
    }

    if (state === "both_failed_retryable") {
      return { canonicalState: "generation_failed" as const, trustTone: "failure" as const, headline, body };
    }

    if (state === "both_failed_non_retryable") {
      return { canonicalState: "hard_blocked" as const, trustTone: "blocked" as const, headline, body };
    }

    if (state === "partial_failure_retryable" || state === "partial_failure_non_retryable") {
      return { canonicalState: "partial_documents" as const, trustTone: "recovery" as const, headline, body };
    }

    if (state === "resume_only_ready" || state === "cover_only_ready") {
      return { canonicalState: "partial_documents" as const, trustTone: "recovery" as const, headline, body };
    }

    return { canonicalState: "partial_documents" as const, trustTone: "recovery" as const, headline, body };
  }, [
    normalizedArtifacts.artifactDisplayState,
    normalizedArtifacts.primaryArtifactTruth.body,
    normalizedArtifacts.primaryArtifactTruth.headline,
    workflowSurfaceAuthorityHero.canonicalState,
    workflowSurfaceAuthorityHero.trustTone,
  ]);

  const normalizedArtifactsTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    const signature = [
      normalizedArtifacts.artifactDisplayState,
      artifactQuality.confidence ?? "none",
      normalizedArtifacts.primaryAction.action,
    ].join("|");

    if (normalizedArtifactsTrackedRef.current === signature) return;
    normalizedArtifactsTrackedRef.current = signature;

    trackEvent("artifact_state_normalized_viewed", {
      surface: "studio",
      artifact_display_state: normalizedArtifacts.artifactDisplayState,
      resume_state: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
      cover_state: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
      resume_confidence: artifactQuality.confidence ?? null,
      cover_confidence: artifactQuality.confidence ?? null,
      primary_action: normalizedArtifacts.primaryAction.action,
    });

    if (normalizedArtifacts.shouldSuppressStalePreview) {
      trackEvent("stale_artifact_suppressed", {
        surface: "studio",
        artifact_display_state: normalizedArtifacts.artifactDisplayState,
        resume_state: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
        cover_state: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
        resume_confidence: artifactQuality.confidence ?? null,
        cover_confidence: artifactQuality.confidence ?? null,
        primary_action: normalizedArtifacts.primaryAction.action,
      });
    }

    if (normalizedArtifacts.shouldShowLowConfidenceWarning) {
      trackEvent("low_confidence_artifact_viewed", {
        surface: "studio",
        artifact_display_state: normalizedArtifacts.artifactDisplayState,
        resume_state: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
        cover_state: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
        resume_confidence: artifactQuality.confidence ?? null,
        cover_confidence: artifactQuality.confidence ?? null,
        primary_action: normalizedArtifacts.primaryAction.action,
      });
    }
  }, [
    artifactQuality.confidence,
    coverState.artifactFailure,
    hasUsableCoverLetter,
    hasUsableResume,
    normalizedArtifacts.artifactDisplayState,
    normalizedArtifacts.primaryAction.action,
    normalizedArtifacts.shouldShowLowConfidenceWarning,
    normalizedArtifacts.shouldSuppressStalePreview,
    resumeState.artifactFailure,
    trackEvent,
  ]);

  const shouldPrimaryCompleteCover =
    readyHeaderMode === "resume_only" && !autoGenerationInFlight && studioArtifactPairStatus !== "in_progress";
  const shouldPrimaryCompleteResume =
    readyHeaderMode === "cover_only" && !autoGenerationInFlight && studioArtifactPairStatus !== "in_progress";

  const instantDraftHero = appliedMomentumHero ?? (isInstantDraftExperience ? (
 	    <section
 	      className="space-y-6"
 	      data-testid="studio-instant-draft-hero"
          {...authorityDebugAttrs}
 	    >
 	      <WorkflowAuthorityPanel
 	        testId="studio-workflow-authority"
 	        model={{
 	          canonicalState: workflowSurfaceAuthorityHero.canonicalState,
	          headline: heroHeadline,
	          body: heroBody,
	          trustTone: workflowSurfaceAuthorityHero.trustTone,
	        }}
	        primaryAction={
	          isApplicationFullyReady && !isApplicationApplied
	            ? {
	                label: "Apply to this role",
	                onClick: handleApplyToThisRole,
	                testId: "studio-primary-cta-apply",
	              }
	            : shouldPrimaryCompleteCover
	              ? {
	                  label: "Complete cover letter",
	                  onClick: handlePrimaryCoverAction,
	                  disabled:
	                    coverGenerating ||
	                    autoGenerationInFlight ||
	                    (generateNowEligible && !isReadySuccessState && !hasCoverLetterArtifact && !coverState.artifactFailure),
	                  testId: "studio-primary-cta-complete-cover",
	                }
	              : shouldPrimaryCompleteResume
	                ? {
	                    label: "Complete resume",
	                    onClick: handlePrimaryResumeAction,
	                    disabled:
	                      resumeGenerating ||
	                      autoGenerationInFlight ||
	                      (generateNowEligible && !isReadySuccessState && !hasResumeArtifact && !resumeState.artifactFailure),
	                    testId: "studio-primary-cta-complete-resume",
	                  }
	                : null
	        }
	        supporting={
	          <div className="space-y-2">
	            {isReadySuccessState && !isApplicationApplied && hasUsableResume && !hasUsableCoverLetter ? (
	              <p className="text-sm font-medium text-slate-100">Resume ready. Complete your cover letter.</p>
	            ) : null}
	            {isReadySuccessState && !isApplicationApplied && !hasUsableResume && hasUsableCoverLetter ? (
	              <p className="text-sm font-medium text-slate-100">Cover letter ready. Complete your resume.</p>
	            ) : null}
	            {isReadySuccessState ? (
	              <p className="text-xs font-medium text-slate-200" data-testid="studio-confidence-label">
	                Confidence: {artifactQuality.confidence.toLowerCase()} (non-blocking)
	              </p>
	            ) : null}
	          </div>
	        }
	        afterActions={
	          <div className="space-y-5">
	            {isReadySuccessState ? (
	              <VerifiedGenerationTrustSummary testId="studio-ready-trust-summary" />
	            ) : null}
	            {studioFocusPrimary ? (
	              <StudioFocusPanel primary={studioFocusPrimary} secondary={studioFocusSecondary} />
	            ) : null}
	          </div>
	        }
	      />
	      <div className="flex flex-wrap gap-3">
	        {!shouldPrimaryCompleteResume ? (
	          <FormButton
	            variant={isApplicationFullyReady || isReadySuccessState || shouldPrimaryCompleteCover ? "secondary" : undefined}
	            onClick={handlePrimaryResumeAction}
            disabled={
              resumeGenerating ||
              autoGenerationInFlight ||
              (generateNowEligible && !isReadySuccessState && !hasResumeArtifact && !resumeState.artifactFailure)
            }
          >
            {hasResumeArtifact || generateNowEligible ? "Resume" : "Generate Resume"}
          </FormButton>
        ) : null}
        {!shouldPrimaryCompleteCover ? (
          <FormButton
            variant={isApplicationFullyReady || isReadySuccessState || shouldPrimaryCompleteResume ? "secondary" : undefined}
            onClick={handlePrimaryCoverAction}
            disabled={
              coverGenerating ||
              autoGenerationInFlight ||
              (generateNowEligible && !isReadySuccessState && !hasCoverLetterArtifact && !coverState.artifactFailure)
            }
          >
            {hasCoverLetterArtifact || generateNowEligible ? "Cover Letter" : "Generate Cover Letter"}
          </FormButton>
        ) : null}
        <Link
          href={fitReviewHref}
          className="inline-flex items-center justify-center px-1 py-2 text-sm font-semibold text-slate-100 underline decoration-slate-400/70 underline-offset-4 transition hover:decoration-slate-200"
	        >
	          Refine
	        </Link>
	      </div>
	      {topLevelArtifactFailure && canRetryGeneration ? (
	        <ArtifactFailureState
	          failure={topLevelArtifactFailure}
	          onRetry={
            topLevelArtifactFailure.artifactType === "cover_letter"
              ? handleRetryCoverGeneration
              : handleRetryResumeGeneration
          }
          retryLabel="Retry"
        />
      ) : null}
      {!topLevelArtifactFailure && (autoGenerationInFlight || studioArtifactPairStatus === "in_progress") ? (
        <RouteStateShell
          tone="neutral"
          eyebrow="In progress"
          title="We are generating your application draft now"
          body={
            <p className="text-sm text-slate-100">
              This usually finishes in a moment. Your resume and cover letter are being built from verified evidence.
            </p>
          }
        />
      ) : null}
      {/* Deprecated: duplicate READY/export lane. READY UX is owned by the hero + materials sections. */}
      {isReadySuccessState ? (
        <div className="space-y-5">
          <p className="text-sm font-medium text-slate-200" data-testid="studio-ready-materials-copy">
            {normalizedArtifacts.artifactDisplayState === "both_ready_high_confidence" ||
            normalizedArtifacts.artifactDisplayState === "both_ready_mixed_confidence"
              ? "Your documents are ready. Download or refine below."
              : normalizedArtifacts.artifactDisplayState === "resume_only_ready"
                ? "Your resume is ready. Your cover letter still needs attention."
                : normalizedArtifacts.artifactDisplayState === "cover_only_ready"
                  ? "Your cover letter is ready. Your resume still needs attention."
                  : normalizedArtifacts.primaryArtifactTruth.headline}
          </p>
          {normalizedArtifacts.shouldShowLowConfidenceWarning && !showLowQualityRecoveryLane ? (
            <p className="text-xs font-medium text-amber-200" data-testid="studio-low-confidence-documents-warning">
              One draft is low confidence. Review closely before exporting.
            </p>
          ) : null}
          {normalizedArtifactsPanelModel &&
          (normalizedArtifacts.artifactDisplayState === "stale_output_hidden" ||
            normalizedArtifacts.artifactDisplayState === "partial_failure_retryable" ||
            normalizedArtifacts.artifactDisplayState === "partial_failure_non_retryable" ||
            normalizedArtifacts.artifactDisplayState === "both_failed_retryable" ||
            normalizedArtifacts.artifactDisplayState === "both_failed_non_retryable") ? (
            <WorkflowAuthorityPanel
              testId="studio-artifact-truth"
              eyebrow="Documents"
              model={normalizedArtifactsPanelModel}
              primaryAction={{
                label: normalizedArtifacts.primaryAction.label,
                testId: "studio-artifact-primary-cta",
                onClick: () => {
                  const action = normalizedArtifacts.primaryAction.action;
                  if (action === "return_to_evidence") return router.push(fitReviewHref);
                  if (action === "open_workspace" || action === "open_documents") {
                    const anchor = document.querySelector("[data-testid='studio-workflow-authority']") as HTMLElement | null;
                    if (anchor) {
                      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
                      anchor.focus?.();
                    }
                    return;
                  }
                  if (action === "retry_both") {
                    trackEvent("artifact_retry_started", {
                      surface: "studio",
                      artifact_display_state: normalizedArtifacts.artifactDisplayState,
                      resume_state: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
                      cover_state: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
                      resume_confidence: artifactQuality.confidence ?? null,
                      cover_confidence: artifactQuality.confidence ?? null,
                      primary_action: action,
                    });

                    return void (async () => {
                      try {
                        await startGenerationFromReadyShell("shell");
                      } catch (error) {
                        trackEvent("artifact_retry_failed", {
                          surface: "studio",
                          artifact_display_state: normalizedArtifacts.artifactDisplayState,
                          resume_state: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
                          cover_state: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
                          resume_confidence: artifactQuality.confidence ?? null,
                          cover_confidence: artifactQuality.confidence ?? null,
                          primary_action: action,
                          failure_category: null,
                          message: error instanceof Error ? error.message : "Retry failed",
                        });
                      }
                    })();
                  }
                  if (action === "retry_failed_artifact") {
                    const coverFailed = Boolean(coverState.artifactFailure) && !hasUsableCoverLetter;

                    trackEvent("artifact_retry_started", {
                      surface: "studio",
                      artifact_display_state: normalizedArtifacts.artifactDisplayState,
                      resume_state: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
                      cover_state: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
                      resume_confidence: artifactQuality.confidence ?? null,
                      cover_confidence: artifactQuality.confidence ?? null,
                      primary_action: action,
                    });

                    return void (async () => {
                      try {
                        if (coverFailed) {
                          await handleRetryCoverGeneration();
                        } else {
                          await handleRetryResumeGeneration();
                        }
                      } catch (error) {
                        trackEvent("artifact_retry_failed", {
                          surface: "studio",
                          artifact_display_state: normalizedArtifacts.artifactDisplayState,
                          resume_state: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
                          cover_state: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
                          resume_confidence: artifactQuality.confidence ?? null,
                          cover_confidence: artifactQuality.confidence ?? null,
                          primary_action: action,
                          failure_category: null,
                          message: error instanceof Error ? error.message : "Retry failed",
                        });
                      }
                    })();
                  }
                },
              }}
              secondaryAction={
                normalizedArtifacts.secondaryAction
                  ? {
                      label: normalizedArtifacts.secondaryAction.label,
                      testId: "studio-artifact-secondary-cta",
                      variant: "secondary",
                      onClick: () => {
                        const action = normalizedArtifacts.secondaryAction?.action;
                        if (action === "return_to_evidence") return router.push(fitReviewHref);
                        if (action === "open_documents") return setAllowStaleArtifactPreview(true);
                      },
                    }
                  : null
              }
            />
          ) : null}
          {false && (<div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
                {isApplicationApplied ? "Application complete" : "Application ready"}
              </span>
              {applicationPairLoading ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
                  Syncing application state
                </span>
              ) : null}
              {applicationProgressLoading ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
                  Loading progress
                </span>
              ) : null}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-[32px]">
              {isApplicationApplied ? "Application submitted" : "Your application is ready"}
            </h2>
            <p className="max-w-3xl text-base leading-7 text-slate-200">
              {isApplicationApplied
                ? "Let’s find your next opportunity."
                : "Download your resume and cover letter, then apply to this role."}
            </p>
            {applicationActionMessage ? (
              <p className="text-sm font-medium text-emerald-100">{applicationActionMessage}</p>
            ) : null}
          </div>)}
          {applicationProgress ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Progress
                  </p>
                  <p className="text-sm text-slate-200">
                    {applicationProgress?.completedApplicationsCount ?? 0} applications completed
                  </p>
                </div>
                <p className="text-xs font-medium text-slate-300">
                  {(applicationProgress?.recentActivity?.length ?? 0) > 0
                    ? `Latest: ${applicationProgress?.recentActivity?.[0]?.company ?? ""}, ${applicationProgress?.recentActivity?.[0]?.title ?? ""}`
                    : "No recent activity yet"}
                </p>
              </div>
            </section>
          ) : null}
          {!normalizedArtifacts.shouldSuppressStalePreview ? (
            <div className="flex flex-wrap gap-3">
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("docx")}
              disabled={!canExportResume || resumeExportFormat === "docx"}
            >
              {resumeExportFormat === "docx" ? "Downloading..." : "Download Resume"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportCoverLetter("docx")}
              disabled={!canExportCover || coverExportFormat === "docx"}
            >
              {coverExportFormat === "docx" ? "Downloading..." : "Download Cover Letter"}
            </FormButton>
            <FormButton variant="secondary" onClick={() => void handleCopyResume()}>
              Copy Resume
            </FormButton>
            <FormButton variant="secondary" onClick={() => void handleCopyCoverLetter()}>
              Copy Cover Letter
            </FormButton>
            {/* Keep a single obvious primary action: promote Apply in the hero, avoid duplicating it here. */}
            {!isReadySuccessState ? (
              isApplicationApplied ? (
                <FormButton onClick={handleAnalyzeAnotherRole}>Analyze another role</FormButton>
              ) : (
                <FormButton onClick={handleApplyToThisRole}>Apply to this role</FormButton>
              )
            ) : null}
            <Link
              href={fitReviewHref}
              className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
            >
              Refine
            </Link>
            {!isApplicationApplied ? (
              <a
                href="#studio-fit-reasoning"
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
              >
                View fit reasoning
              </a>
            ) : null}
            </div>
          ) : null}
          {!normalizedArtifacts.shouldSuppressStalePreview ? (
            <div className="grid gap-4 lg:grid-cols-2">
            {resumePresenter.status === "success" && resumeState.response ? (
              <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4" data-testid="studio-instant-resume-panel">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Resume</p> 
                    <p className="text-sm text-slate-300"> 
                      {showLowQualityRecoveryLane
                        ? "Draft (low quality)"
                        : hasUsableResume && hasUsableCoverLetter
                          ? "Application ready"
                          : "Resume ready"} 
                    </p> 
                  </div> 
                </div> 
                <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-3"> 
                  {showLowQualityRecoveryLane && !showFullLowQualityResume && !studioIsGeneratedUnusable ? ( 
                    <div className="space-y-3" data-testid="studio-low-quality-resume-preview"> 
                      <div className="rounded-xl border border-amber-300/25 bg-amber-500/5 p-3">
                        <p className="text-sm font-semibold text-amber-100">This draft needs another pass.</p>
                        <p className="mt-1 text-sm text-slate-200">
                          Usable only as a rough starting point. Regenerate after verifying evidence.
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Excerpt</p>
                        <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">
{resumePreviewText.slice(0, 900)}
{resumePreviewText.length > 900 ? "\n\n…(excerpt truncated)" : ""}
                        </pre>
                      </div>
                      <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <summary
                          className="cursor-pointer text-sm font-semibold text-slate-100"
                          data-testid="studio-low-quality-resume-view-full"
                          onClick={() => setShowFullLowQualityResume(true)}
                        >
                          View full draft anyway
                        </summary>
                      </details>
                    </div>
                  ) : canonicalResumePreviewPayload ? (
                    <ResumePreview payload={canonicalResumePreviewPayload} />
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-sm font-semibold text-slate-100">Resume needs correction before export.</p>
                      <p className="mt-1 text-sm text-slate-200">
                        Review the flagged issue, edit the resume, or regenerate.
                      </p>
                    </div>
                  )}
                </div>
                {resumeCopyStatus ? (
                  <p className="mt-2 text-xs font-medium text-emerald-200">{resumeCopyStatus}</p>
                ) : null}
              </section>
            ) : null}
            {coverPresenter.status === "success" && coverState.response ? (
              <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4" data-testid="studio-instant-cover-panel">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Cover Letter</p> 
                    <p className="text-sm text-slate-300"> 
                      {showLowQualityRecoveryLane
                        ? "Draft (low quality)"
                        : hasUsableResume && hasUsableCoverLetter
                          ? "Application ready"
                          : "Cover letter ready"} 
                    </p> 
                  </div> 
                </div> 
                <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3"> 
                  {showLowQualityRecoveryLane && !showFullLowQualityCover ? ( 
                    <div className="space-y-3" data-testid="studio-low-quality-cover-preview"> 
                      <div className="rounded-xl border border-amber-300/25 bg-amber-500/5 p-3">
                        <p className="text-sm font-semibold text-amber-100">This draft needs another pass.</p>
                        <p className="mt-1 text-sm text-slate-200">
                          Usable only as a rough starting point. Regenerate after verifying evidence.
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Excerpt</p>
                        <div className="mt-2 space-y-3">
                          {coverLetterParagraphs.slice(0, 2).map((paragraph, index) => (
                            <p key={`instant-cover-excerpt-${index}`} className="text-sm leading-6 text-slate-200">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                      <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <summary
                          className="cursor-pointer text-sm font-semibold text-slate-100"
                          data-testid="studio-low-quality-cover-view-full"
                          onClick={() => setShowFullLowQualityCover(true)}
                        >
                          View full draft anyway
                        </summary>
                      </details>
                    </div>
                  ) : (
                    coverLetterParagraphs.slice(0, 4).map((paragraph, index) => (
                      <p key={`instant-cover-paragraph-${index}`} className="text-sm leading-6 text-slate-200">
                        {paragraph}
                      </p>
                    ))
                  )}
                </div>
                {coverCopyStatus ? (
                  <p className="mt-2 text-xs font-medium text-emerald-200">{coverCopyStatus}</p>
                ) : null}
              </section>
            ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {!hasCompletedGeneration && studioArtifactPairStatus === "failed" && !generateNowEligible ? (
        <RouteStateShell
          tone="warning"
          eyebrow="Needs another pass"
          title="Your draft is ready to retry"
          body={
            <p className="text-sm text-slate-100">
              We could not finish the last draft attempt. Use retry to generate a fresh version from the current verified inputs.
            </p>
          }
        />
      ) : null}
      {!isReadySuccessState &&
      (studioGenerationRenderState.isGenerating ||
        resumeGenerating ||
        coverGenerating ||
        autoGenerationInFlight ||
        studioArtifactPairStatus === "in_progress") ? (
        <RouteStateShell
          tone="success"
          eyebrow="Drafting"
          title="Your draft is taking shape"
          body={
            <p className="text-sm text-slate-100">
              We are preparing your resume and cover letter from the baseline evidence already in place.
            </p>
          }
        />
      ) : null}
      <details id="studio-fit-reasoning" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"> 
        <summary className="cursor-pointer text-sm font-semibold text-slate-100"> 
          Why this is a strong match 
        </summary> 
        <div className="mt-4 space-y-3"> 
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4"> 
            <p className="text-sm font-semibold text-slate-100">Fit confirmation</p> 
            <p className="mt-1 text-sm text-slate-300"> 
              You are above the Studio generation floor and your baseline supports clean drafting. 
            </p> 
          </div> 
          {hasLoadedAnalysis && !generateNowEligible ? (
            <StudioArtifactQualityPanel
              model={artifactQuality}
              confidence={artifactQuality.confidence}
              onVerifyClaim={verifyClaim}
              onEditClaim={openClaimEditModal}
              onDismissClaim={dismissClaim}
            />
          ) : null}
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4"> 
            <p className="text-sm font-semibold text-slate-100">Evidence and rationale</p> 
            <ul className="mt-3 space-y-2 text-sm text-slate-300"> 
              {evidenceLedger.entries.slice(0, 4).map((entry) => ( 
                <li key={`instant-evidence-${entry.id}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-slate-100">
                    {String(entry.text ?? "")
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 240)}
                    {String(entry.text ?? "").replace(/\s+/g, " ").trim().length > 240 ? "..." : ""}
                  </p>
                  {entry.sourceLabel ? <p className="mt-1 text-xs text-slate-400">{entry.sourceLabel}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  ) : null);

  const unlockEntryPanel = studioGenerationRenderState.shouldShowUnlockEntry ? (
      <RouteStateShell
      testId="studio-unlock-entry-panel"
      tone="success"
      eyebrow="Unlock"
      title="Your draft is ready to review"
      body={
        <p className="text-sm text-slate-100">
          Your verified evidence supports this role. Your materials are now grounded and ready.
        </p>
      }
      cta={
        <div className="flex flex-wrap gap-3">
          <FormButton
            onClick={() => {
              scrollToStudioTop("smooth");
              void handleResumeDraft();
            }}
            disabled={resumeGenerating}
          >
            {resumeGenerating
              ? studioGenerationRenderState.shouldShowEnhancedLoadingCopy
                ? "GENERATING VERIFIED DRAFT..."
                : "Generating..."
              : "GENERATE RESUME"}
          </FormButton>
          <FormButton
            variant="secondary"
            onClick={() => {
              scrollToStudioTop("smooth");
              void handleCoverDraft();
            }}
            disabled={coverGenerating}
          >
            {coverGenerating
              ? studioGenerationRenderState.shouldShowEnhancedLoadingCopy
                ? "GENERATING VERIFIED DRAFT..."
                : "Generating..."
              : "GENERATE COVER LETTER"}
          </FormButton>
        </div>
      }
    >
      {unlockGenerationLoadingMessage && studioGenerationRenderState.isGenerating ? (
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-emerald-100">
          {unlockGenerationLoadingMessage}
        </p>
      ) : null}
    </RouteStateShell>
  ) : null;

  const pageTruth = buildStudioPageTruth({
    workflowState: workflowAuthority.workflowState,
    readiness: productReadiness ?? null,
    trustGate: trustGateDecision ?? null,
    hasCompletedGeneration,
    isGenerating: activeGenerationReadiness.blocked
      ? false
      : Boolean(
          studioGenerationRenderState.isGenerating ||
            resumeGenerating ||
            coverGenerating ||
            autoGenerationInFlight,
        ),
    hasAnyArtifacts: Boolean(hasCompletedGeneration || resumeState.response || coverState.response),
    resumeState,
    coverState,
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.debug("[studioAuthority]", {
      pathname,
      baselineId: effectiveBaselineId ?? null,
      jobId: effectiveJobId ?? null,
      analysisId: requestedAnalysisId ?? null,
      score: typeof analysisScore === "number" ? analysisScore : null,
      generationReadinessBlocked: activeGenerationReadiness.blocked,
      workflowState: workflowAuthority.workflowState,
      pageTruth: pageTruth.state,
      suppressFailureMessaging: workflowAuthority.suppressFailureMessaging,
    });
  }, [
    activeGenerationReadiness.blocked,
    analysisScore,
    effectiveBaselineId,
    effectiveJobId,
    pageTruth.state,
    pathname,
    requestedAnalysisId,
    workflowAuthority.suppressFailureMessaging,
    workflowAuthority.workflowState,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const resumeRenderer = showLowQualityRecoveryLane && !showFullLowQualityResume
      ? "low_quality_excerpt"
      : generatedResumeModel
        ? "structured_preview"
        : resumePreviewText
          ? "fallback_text"
          : "none";

    const coverRenderer = showLowQualityRecoveryLane && !showFullLowQualityCover
      ? "low_quality_excerpt"
      : coverLetterParagraphs.length
        ? "bounded_preview"
        : coverState.response
          ? "unknown_payload"
          : "none";

    const resumeTotalBodyLength = generatedResumeModel
      ? estimateResumeModelBodyLength(generatedResumeModel)
      : resumePreviewText.length;

    const resumePreview =
      resumeRenderer === "low_quality_excerpt"
        ? truncateForPreview(resumePreviewText, { maxChars: 1200, maxLines: 60 })
        : resumeRenderer === "fallback_text"
          ? truncateForPreview(resumePreviewText, { maxChars: 4000, maxLines: 120 })
          : { text: "", totalLength: resumeTotalBodyLength, previewLength: resumeTotalBodyLength, truncated: false };

    devLogArtifactRendererSelection({
      page: "studio",
      artifactType: "resume",
      confidence: artifactQuality.confidence ?? null,
      generationPhase: generationLifecycle.phase ?? null,
      pairStatus: workflowAuthority.workflowState ?? null,
      renderer: resumeRenderer,
      previewLength: resumeRenderer === "structured_preview" ? resumeTotalBodyLength : resumePreview.previewLength,
      totalBodyLength: resumeTotalBodyLength,
      truncated:
        resumeRenderer === "structured_preview"
          ? false
          : resumeRenderer === "none"
            ? false
            : resumePreview.truncated,
      reason: "render",
    });

    const coverTotalBodyLength = coverLetterParagraphs.join("\n\n").length;
    const coverPreviewParagraphs =
      coverRenderer === "low_quality_excerpt"
        ? coverLetterParagraphs.slice(0, 2)
        : coverRenderer === "bounded_preview"
          ? coverLetterParagraphs.slice(0, 4)
          : [];
    const coverPreviewLength = coverPreviewParagraphs.join("\n\n").length;

    devLogArtifactRendererSelection({
      page: "studio",
      artifactType: "cover_letter",
      confidence: artifactQuality.confidence ?? null,
      generationPhase: generationLifecycle.phase ?? null,
      pairStatus: workflowAuthority.workflowState ?? null,
      renderer: coverRenderer,
      previewLength: coverPreviewLength,
      totalBodyLength: coverTotalBodyLength,
      truncated:
        coverRenderer === "bounded_preview" || coverRenderer === "low_quality_excerpt"
          ? coverLetterParagraphs.length > coverPreviewParagraphs.length
          : false,
      reason: "render",
    });
  }, [
    artifactQuality.confidence,
    coverLetterParagraphs,
    coverState.response,
    generatedResumeModel,
    generationLifecycle.phase,
    resumePreviewText,
    showFullLowQualityCover,
    showFullLowQualityResume,
    showLowQualityRecoveryLane,
    workflowAuthority.workflowState,
  ]);

  // Avoid flashing blocked/recovery UI before analysis hydration resolves score + readiness.
  const showReadinessRecoveryExperience =
    hasLoadedAnalysis &&
    !generateNowEligible &&
    ((resumeGating.accessState === "allowed" &&
      (resumeGating.primaryBlocker === "readiness_block" || resumeGating.primaryBlocker === "draft_only")) ||
      (coverGating.accessState === "allowed" &&
        (coverGating.primaryBlocker === "readiness_block" || coverGating.primaryBlocker === "draft_only")) ||
      (pageTruth.state === "blocked_evidence" &&
        (!shouldGenerateDocuments(analysisScore) || productReadiness?.state === "BLOCKED")));

  const draftAnywayEligible =
    !activeGenerationReadiness.blocked &&
    (isDraftAnywayEligible(analysisScore, resumeGating) || isDraftAnywayEligible(analysisScore, coverGating));

  const readinessImpactedArtifacts = useMemo(() => {
    const impacted: string[] = [];
    if (
      resumeGating.accessState === "allowed" &&
      (resumeGating.readinessState === "blocked" || resumeGating.readinessState === "draft_only")
    ) {
      impacted.push("Resume");
    }
    if (
      coverGating.accessState === "allowed" &&
      (coverGating.readinessState === "blocked" || coverGating.readinessState === "draft_only")
    ) {
      impacted.push("Cover letter");
    }
    return impacted;
  }, [coverGating.accessState, coverGating.readinessState, resumeGating.accessState, resumeGating.readinessState]);
  const readinessMessageScopeSuffix =
    readinessImpactedArtifacts.length === 0
      ? ""
      : readinessImpactedArtifacts.length === 1
        ? ` (${readinessImpactedArtifacts[0]})`
        : ` (${readinessImpactedArtifacts.join(" + ")})`;

  const showPrimaryGeneratingNotice =
    pageTruth.isGenerating && (pageTruth.state === "ready" || pageTruth.state === "draftable_limited");
  const showInstantDraftHero =
    pageTruth.state === "ready" ||
    pageTruth.state === "draftable_limited" ||
    pageTruth.state === "generated_reviewable" ||
    (pageTruth.state === "failed" && (hasCompletedGeneration || Boolean(resumeState.response) || Boolean(coverState.response)));
  const showInstantDraftHeroSafe =
    showInstantDraftHero && !showReadinessRecoveryExperience && !activeGenerationReadiness.blocked;

  const highestImpactEvidenceActions = useMemo(() => {
    const candidates = canonicalUnverifiedRequirements.length
      ? canonicalUnverifiedRequirements
      : evidenceLedger.remainingWeakAreas;
    return candidates
      .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 2);
  }, [canonicalUnverifiedRequirements, evidenceLedger.remainingWeakAreas]);
  const strengthenPrimaryHref = useMemo(() => {
    const focus = highestImpactEvidenceActions[0];
    return focus ? buildClaimVerificationHref(focus) : fitReviewHref;
  }, [buildClaimVerificationHref, fitReviewHref, highestImpactEvidenceActions]);

  const showArtifactMaterials =
    !studioBlockedByNextAction &&
    (!studioGenerationRenderState.isBlocked ||
      resumeGating.primaryBlocker === "tier_gate" ||
      coverGating.primaryBlocker === "tier_gate");

  const canonicalStudioReadinessMessage =
    activeGenerationReadiness.status === "ready" && !activeGenerationReadiness.blocked
      ? "You're ready to generate"
      : "Add more verified experience";

  const postUnlockNewReadiness: PostUnlockReadiness | null =
    hasLoadedAnalysis
      ? activeGenerationReadiness.blocked
        ? "blocked"
        : activeGenerationReadiness.status === "ready"
          ? "ready"
          : "limited"
      : null;
  const postUnlockModel = useMemo(() => {
    if (!postUnlockActive) return null;

    const resumeVisibleGenerating =
      resumeAutoGenerating || resumeGenerateNowPending || resumeGenerating || resumeSingleFlightInFlight;
    const coverVisibleGenerating =
      coverAutoGenerating || coverGenerateNowPending || coverGenerating || coverSingleFlightInFlight;

    const resumeStatus: "missing" | "generating" | "ready" | "failed" = hasUsableResume
      ? "ready"
      : resumeVisibleGenerating || autoGenerationInFlight || studioArtifactPairStatus === "in_progress"
        ? "generating"
        : resumeState.artifactFailure
          ? "failed"
          : "missing";

    const coverStatus: "missing" | "generating" | "ready" | "failed" = hasUsableCoverLetter
      ? "ready"
      : coverVisibleGenerating || autoGenerationInFlight || studioArtifactPairStatus === "in_progress"
        ? "generating"
        : coverState.artifactFailure
          ? "failed"
          : "missing";

    const orchestrator = resolveWorkflowOrchestrator({
      surface: "studio",
      ids: {
        baselineId: effectiveBaselineId || null,
        baselineVersionId: effectiveBaselineVersionId || null,
        jobId: effectiveJobId || null,
        analysisId: effectiveRequestedAnalysisId || null,
        assessmentId: effectiveRequestedAnalysisId || null,
      },
      score: typeof analysisScore === "number" ? analysisScore : null,
      generationReadiness: activeGenerationReadiness,
      workflowAuthority,
      artifact: {
        hasResume: hasUsableResume,
        hasCoverLetter: hasUsableCoverLetter,
        pairStatus: studioArtifactPairStatus ?? null,
        generating:
          autoGenerationInFlight ||
          resumeVisibleGenerating ||
          coverVisibleGenerating ||
          studioArtifactPairStatus === "in_progress",
        failure: topLevelArtifactFailure
          ? { category: topLevelArtifactFailure.category, retryable: topLevelArtifactFailure.retryable }
          : null,
      },
      resume: {
        status: resumeStatus,
        confidence: artifactQuality.confidence ?? null,
        failure: resumeState.artifactFailure
          ? { category: resumeState.artifactFailure.category, retryable: resumeState.artifactFailure.retryable }
          : null,
      },
      coverLetter: {
        status: coverStatus,
        confidence: artifactQuality.confidence ?? null,
        failure: coverState.artifactFailure
          ? { category: coverState.artifactFailure.category, retryable: coverState.artifactFailure.retryable }
          : null,
      },
      artifactQuality: { confidence: artifactQuality.confidence ?? null },
      allowStaleArtifactPreview: allowStaleArtifactPreview,
      searchParamsString: searchParamValue,
      unlockDismissed: unlockFlowDismissed,
      unlockReanalysisFailure: unlockReanalysisFailure
        ? { priorScore: unlockReanalysisFailure.priorScore, priorReadiness: unlockReanalysisFailure.priorReadiness, returnToEvidenceHref: strengthenPrimaryHref }
        : null,
      postUnlock: {
        active: true,
        dismissed: postUnlockDismissed,
        priorScore: postUnlockParams.priorScore,
        priorReadiness: postUnlockParams.priorReadiness,
        newReadiness: postUnlockNewReadiness,
        reanalysisFailed: Boolean((analysisError && !analysisLoading) || !hasLoadedAnalysis),
        generationAllowedNow: Boolean(generateNowEligible || activeGenerationReadiness.status === "ready"),
        returnToEvidenceHref: strengthenPrimaryHref,
      },
      generationReady: { dismissed: generationReadyDismissed, phase: generationReadyPhase },
      resumeFailure: resumeState.artifactFailure,
      coverFailure: coverState.artifactFailure,
      activity: workflowActivity,
    });

    return orchestrator.postUnlockState.model;
  }, [
    activeGenerationReadiness,
    allowStaleArtifactPreview,
    analysisError,
    analysisLoading,
    analysisScore,
    autoGenerationInFlight,
    coverAutoGenerating,
    coverGenerating,
    coverGenerateNowPending,
    coverSingleFlightInFlight,
    coverState.artifactFailure,
    generateNowEligible,
    generationReadyDismissed,
    generationReadyPhase,
    hasLoadedAnalysis,
    hasUsableCoverLetter,
    hasUsableResume,
    postUnlockActive,
    postUnlockDismissed,
    postUnlockNewReadiness,
    postUnlockParams.priorReadiness,
    postUnlockParams.priorScore,
    resumeAutoGenerating,
    resumeGenerating,
    resumeGenerateNowPending,
    resumeSingleFlightInFlight,
    resumeState.artifactFailure,
    searchParamValue,
    strengthenPrimaryHref,
    studioArtifactPairStatus,
    topLevelArtifactFailure?.category,
    topLevelArtifactFailure?.retryable,
    unlockFlowDismissed,
    unlockReanalysisFailure?.priorReadiness,
    unlockReanalysisFailure?.priorScore,
    workflowActivity,
    workflowAuthority,
    artifactQuality.confidence,
  ]);

  useEffect(() => {
    if (!postUnlockActive) return;
    if (!postUnlockModel) return;
    if (postUnlockTrackedRef.current) return;
    if (analysisLoading) return;

    postUnlockTrackedRef.current = true;

    const priorScore = postUnlockParams.priorScore;
    const newScore = typeof analysisScore === "number" ? analysisScore : null;
    const scoreDelta =
      typeof priorScore === "number" && typeof newScore === "number" ? newScore - priorScore : null;

    trackEvent("unlock_outcome_viewed", {
      source: "studio",
      prior_score: priorScore,
      new_score: newScore,
      score_delta: scoreDelta,
      prior_readiness: postUnlockParams.priorReadiness,
      new_readiness: postUnlockNewReadiness,
      outcome_state: postUnlockModel.outcomeState,
    });

    if (postUnlockModel.outcomeState === "reanalysis_failed") {
      trackEvent("unlock_reanalysis_failed", {
        source: "studio",
        prior_score: priorScore,
        new_score: newScore,
        score_delta: scoreDelta,
        prior_readiness: postUnlockParams.priorReadiness,
        new_readiness: postUnlockNewReadiness,
        outcome_state: postUnlockModel.outcomeState,
      });
      return;
    }

    trackEvent("unlock_reanalysis_succeeded", {
      source: "studio",
      prior_score: priorScore,
      new_score: newScore,
      score_delta: scoreDelta,
      prior_readiness: postUnlockParams.priorReadiness,
      new_readiness: postUnlockNewReadiness,
      outcome_state: postUnlockModel.outcomeState,
    });
  }, [
    analysisError,
    analysisLoading,
    analysisScore,
    hasLoadedAnalysis,
    postUnlockActive,
    postUnlockModel,
    postUnlockNewReadiness,
    postUnlockParams.priorReadiness,
    postUnlockParams.priorScore,
  ]);

  const generationReadyModel = workflowOrchestratorCore.generationReadyState.model;

  const generationReadyShellActive =
    !generationReadyDismissed &&
    !isApplicationApplied &&
    !showReadinessRecoveryExperience &&
    !activeGenerationReadiness.blocked &&
    workflowOrchestratorCore.authorityState.canonicalState !== "generation_in_progress" &&
    generationReadyPhase !== "generating" &&
    (generationReadyModel.isGenerationReadyPriority || generationReadyPhase === "failed");

  const suppressGeneratingMessaging = showReadinessRecoveryExperience || activeGenerationReadiness.blocked;
  const workflowActivityBannerTracker = suppressGeneratingMessaging
    ? { ...workflowActivity, isActive: false, activeOperations: [] }
    : workflowActivity;

  useWorkflowGuardrails({
    surface: "studio",
    orchestrator: workflowOrchestratorCore,
    rendered: {
      workflowAuthorityPanel:
        showInstantDraftHeroSafe &&
        !unlockFlowActive &&
        !(postUnlockActive && Boolean(postUnlockModel)) &&
        !generationReadyShellActive,
      unlockFlow: unlockFlowActive,
      postUnlockOutcome: postUnlockActive && Boolean(postUnlockModel),
      generationReadyShell: generationReadyShellActive,
      artifactTruthPanel: Boolean(normalizedArtifactsPanelModel),
      staleArtifactPreview: false,
      activityBanner: true,
    },
    context: {
      failureActive: Boolean(pageTruth.state === "failed"),
      resumeState: hasUsableResume ? "ready" : resumeState.artifactFailure ? "failed" : "missing",
      coverState: hasUsableCoverLetter ? "ready" : coverState.artifactFailure ? "failed" : "missing",
      resumeReadinessState: pairReadinessContractState.resume,
      coverReadinessState: pairReadinessContractState.cover,
      blockedRecoveryActive: showReadinessRecoveryExperience,
    },
    orchestratorViolations: workflowOrchestratorCore.diagnostics?.violations ?? null,
    trackEvent,
  });

  useEffect(() => {
    if (!generationReadyShellActive) return;
    // Generation-ready shell is the explicit authority for starting generation.
    // Only suppress auto-generation when the contract is not instructing an auto-start.
    // When `shouldStart` is true, the auto-generation effect will start through the
    // ready shell entrypoint (`shell_auto`), so suppression would incorrectly block
    // legitimate auto-starts (including in tests).
    suppressAutoGenerationRef.current = workflowOrchestratorCore.contract.generation.auto.shouldStart !== true;
  }, [generationReadyShellActive, workflowOrchestratorCore.contract.generation.auto.shouldStart]);

  const generationReadyAnalyticsContext = useMemo(() => {
    const trust = generationReadyModel.trustSummary;
    return {
      fit_score: typeof trust?.fitScore === "number" ? Math.round(trust.fitScore) : null,
      readiness_state: trust?.readinessState ?? null,
      outcome_state: postUnlockModel?.outcomeState ?? null,
    };
  }, [generationReadyModel.trustSummary, postUnlockModel?.outcomeState]);

  useEffect(() => {
    if (!generationReadyShellActive) return;
    if (unlockFlowActive || postUnlockActive) return;
    if (generationReadyTrackedRef.current) return;
    generationReadyTrackedRef.current = true;

    trackEvent("generation_ready_shell_viewed", {
      source: "studio",
      ...generationReadyAnalyticsContext,
    });
  }, [
    generationReadyAnalyticsContext,
    generationReadyShellActive,
    postUnlockActive,
    trackEvent,
    unlockFlowActive,
  ]);

  const deriveGenerationReadyShellFailure = useCallback((): GenerationReadyShellFailure => {
    const resumeFailure = resumeStateSnapshotRef.current.artifactFailure;
    const coverFailure = coverStateSnapshotRef.current.artifactFailure;

    const resumeError = resumeStateSnapshotRef.current.error;
    const coverError = coverStateSnapshotRef.current.error;

    const failures = [resumeFailure, coverFailure].filter(
      (failure): failure is StudioArtifactFailurePresentation => Boolean(failure),
    );
    const nonRetryableCategories: StudioArtifactFailurePresentation["category"][] = [
      "generation_blocked",
      "insufficient_verified_evidence",
      "unsupported_input",
      "trace_failure",
    ];
    const retryableCategories: StudioArtifactFailurePresentation["category"][] = [
      "generation_failed",
      "generation_timeout",
      "invalid_pair_state",
    ];

    const readinessBlocked = activeGenerationReadiness.blocked;
    const blockedByReadinessGate =
      resumeGating.primaryBlocker === "readiness_block" || coverGating.primaryBlocker === "readiness_block";

    if (readinessBlocked || blockedByReadinessGate) {
      return {
        category: "generation_blocked",
        retryable: false,
        message: "Generation is blocked. Add more verified evidence to unlock document generation.",
      };
    }

    const hasNonRetryableFailure =
      failures.some((failure) => nonRetryableCategories.includes(failure.category)) ||
      failures.some((failure) => !failure.retryable);

    if (hasNonRetryableFailure) {
      const failure = failures.find((candidate) => nonRetryableCategories.includes(candidate.category)) ?? failures[0];
      return {
        category: failure?.category ?? null,
        retryable: false,
        message: failure?.explanation ?? "Generation can't continue from the current state.",
      };
    }

    const hasRetryableFailure = failures.some(
      (failure) => failure.retryable && retryableCategories.includes(failure.category),
    );

    if (hasRetryableFailure) {
      const failure = failures.find((candidate) => retryableCategories.includes(candidate.category)) ?? failures[0];
      return {
        category: failure?.category ?? null,
        retryable: true,
        message: failure?.explanation ?? "Generation failed. Retry generation now.",
      };
    }

    const errorMessage = String(resumeError || coverError || "").trim();
    return {
      category: failures[0]?.category ?? null,
      retryable: true,
      message: failures[0]?.explanation ?? (errorMessage || "Generation failed. Retry generation now."),
    };
  }, [
    activeGenerationReadiness.blocked,
    coverGating.primaryBlocker,
    resumeGating.primaryBlocker,
    coverStateSnapshotRef,
    resumeStateSnapshotRef,
  ]);

  const dismissGenerationReadyShell = useCallback(
    (reason: "open_workspace" | "dismiss") => {
      setGenerationReadyDismissed(true);
      setGenerationReadyFailure(null);
      setGenerationReadyPhase("ready");
      suppressAutoGenerationRef.current = true;
      trackEvent("generation_ready_shell_dismissed", {
        source: "studio",
        ...generationReadyAnalyticsContext,
        reason,
      });
    },
    [generationReadyAnalyticsContext, trackEvent],
  );

  const startGenerationFromReadyShell = useCallback(
    async (
      source: "shell" | "shell_auto" | "post_unlock" | "manual_retry",
    ): Promise<{
      ok: boolean;
      resumeResult: StudioArtifactGenerationAttemptResult | null;
      coverResult: StudioArtifactGenerationAttemptResult | null;
    }> => {
      console.log("[STUDIO][AUTO_GEN][START_CALLED_INNER]", { source });
      if (generationReadyPhase === "generating" && source !== "manual_retry") {
        return {
          ok: false,
          resumeResult: null,
          coverResult: null,
        };
      }

      if (source === "shell_auto") {
        const contractSignature = workflowOrchestratorCore.contract?.generation.auto.signature;
        if (contractSignature) {
          const next = (retryCountRef.current[contractSignature] ?? 0) + 1;
          retryCountRef.current[contractSignature] = next;
          try {
            if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.setItem === "function") {
              window.localStorage.setItem(retryCountStorageKey(contractSignature), String(next));
            }
          } catch {
            // ignore
          }
        }
      }

      scrollToStudioTop("smooth");
      setGenerationReadyFailure(null);
      setGenerationReadyPhase("generating");
      setAutoGenerationInFlight(true);
      trackEvent("generation_ready_shell_started", {
        source: "studio",
        ...generationReadyAnalyticsContext,
        entrypoint: source === "shell_auto" ? "shell" : source === "manual_retry" ? "shell" : source,
      });

      try {
        const manualRequestId = source === "manual_retry" ? createRequestId() : null;
        const stableSessionKey = `${effectiveBaselineId ?? "base"}:${effectiveJobId ?? "job"}:${requestedAnalysisId ?? "analysis"}:ready_shell`;
        const sessionKey =
          source === "manual_retry"
            ? `${stableSessionKey}:manual_retry:${manualRequestId ?? "unknown"}:${Date.now()}`
            : stableSessionKey;
        const runAttempt = async (
          artifact: "resume" | "cover",
        ): Promise<StudioArtifactGenerationAttemptResult> => {
          let attempt: StudioArtifactGenerationAttemptResult | null = null;
          if (source === "manual_retry") {
            console.info(
              artifact === "resume"
                ? "[studio][manual_regenerate_resume_requested]"
                : "[studio][manual_regenerate_cover_requested]",
              { requestId: manualRequestId, sessionKey },
            );
          }
          const ok =
            artifact === "resume"
              ? await handleResumeDraft({
                  sessionKey,
                  bypassReadinessGate: true,
                  forceRegenerate: source === "manual_retry",
                  regenerationSource: source,
                  onAttempt: (next) => {
                    attempt = next;
                  },
                })
              : await handleCoverDraft({
                  sessionKey,
                  bypassReadinessGate: true,
                  forceRegenerate: source === "manual_retry",
                  regenerationSource: source,
                  onAttempt: (next) => {
                    attempt = next;
                  },
                });

          if (attempt) return attempt;

          // Guardrail: never allow a silent boolean to leak into the ready-shell path.
          return makeStudioAttempt(artifact, {
            ok,
            status: ok ? "success" : "failed",
            errorCode: ok ? null : "silent_false",
            errorMessage: ok
              ? null
              : `${artifact === "resume" ? "Resume" : "Cover letter"} generation returned false with no diagnostic.`,
            skippedReason: null,
            request: { sessionKey, requestId: manualRequestId },
          });
        };

        const [resumeResult, coverResult] = await Promise.all([
          runAttempt("resume"),
          runAttempt("cover"),
        ]);

        const ok = resumeResult.ok && coverResult.ok;
        if (source === "manual_retry") {
          console.info("[studio][manual_regenerate_result]", {
            ok,
            requestId: manualRequestId,
            resumeResult,
            coverResult,
          });
        }

        if (ok) {
          setGenerationReadyDismissed(true);
          setGenerationReadyFailure(null);
          setGenerationReadyPhase("ready");
          return { ok: true, resumeResult, coverResult };
        }

        const failure = deriveGenerationReadyShellFailure();
        setGenerationReadyFailure(failure);
        setGenerationReadyPhase("failed");

        trackEvent("generation_ready_shell_failed", {
          source: "studio",
          ...generationReadyAnalyticsContext,
          failure_category: failure.category,
          retryable: failure.retryable,
        });
        return { ok: false, resumeResult, coverResult };
      } finally {
        setAutoGenerationInFlight(false);
      }
    },
    [
      deriveGenerationReadyShellFailure,
      effectiveBaselineId,
      effectiveJobId,
      requestedAnalysisId,
      generationReadyAnalyticsContext,
      generationReadyPhase,
      handleCoverDraft,
      handleResumeDraft,
      makeStudioAttempt,
      scrollToStudioTop,
      setAutoGenerationInFlight,
      trackEvent,
    ],
  );

  const [debugAutoGenerationEnabled, setDebugAutoGenerationEnabled] = useState(
    process.env.NODE_ENV !== "production",
  );
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    try {
      setDebugAutoGenerationEnabled(
        typeof window !== "undefined" && window.localStorage?.getItem("ttr:debug:autoGen") === "true",
      );
    } catch {
      setDebugAutoGenerationEnabled(false);
    }
  }, []);

  const studioBuildMarker =
    process.env.NEXT_PUBLIC_APP_VERSION ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_SHA ??
    process.env.NEXT_PUBLIC_COMMIT_SHA ??
    null;
  const studioBuildLoggedRef = useRef(false);
  useEffect(() => {
    if (studioBuildLoggedRef.current) return;
    studioBuildLoggedRef.current = true;
    // Single-line so production logs can be grep'd reliably.
    console.log("[STUDIO][BUILD]", JSON.stringify({ build: studioBuildMarker, nodeEnv: process.env.NODE_ENV ?? null }));
  }, [studioBuildMarker]);

  const artifactContractInvariantLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    const contract = workflowOrchestratorCore.contract;
    if (!contract) return;
    if (contract.generation.state !== "generated") return;
    if (artifactContract.hasResumeArtifact || artifactContract.hasCoverLetterArtifact) return;

    const signature = [
      requestedAnalysisId ?? "_",
      effectiveJobId ?? "_",
      effectiveBaselineId ?? "_",
      effectiveBaselineVersionId ?? "_",
    ].join(":");
    if (artifactContractInvariantLoggedRef.current === signature) return;
    artifactContractInvariantLoggedRef.current = signature;

    const resumeKeys =
      artifactContract.normalized.resumeResponse && typeof artifactContract.normalized.resumeResponse === "object"
        ? Object.keys(artifactContract.normalized.resumeResponse as Record<string, unknown>)
        : [];
    const coverKeys =
      artifactContract.normalized.coverLetterResponse &&
      typeof artifactContract.normalized.coverLetterResponse === "object"
        ? Object.keys(artifactContract.normalized.coverLetterResponse as Record<string, unknown>)
        : [];

    console.warn("[STUDIO][ARTIFACT_CONTRACT][GENERATED_WITH_NO_ARTIFACTS]", {
      area: "studio",
      operation: "artifact_contract_invariant",
      status: "warn",
      code: "generated_with_no_normalized_artifacts",
      analysisId: requestedAnalysisId ?? null,
      jobId: effectiveJobId ?? null,
      baselineId: effectiveBaselineId ?? null,
      baselineVersionId: effectiveBaselineVersionId ?? null,
      resumeResponseKeys: resumeKeys,
      coverLetterResponseKeys: coverKeys,
    });
  }, [
    artifactContract.hasCoverLetterArtifact,
    artifactContract.hasResumeArtifact,
    artifactContract.normalized.coverLetterResponse,
    artifactContract.normalized.resumeResponse,
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    requestedAnalysisId,
    workflowOrchestratorCore.contract,
  ]);

  const MAX_AUTO_RETRIES = 1;
  const retryCountRef = useRef<Record<string, number>>({});
  const retryCountStorageKey = (signature: string) => `ttr:studio:auto-generate:retry-count:${signature}`;
  useEffect(() => {
    const signature = workflowOrchestratorCore.contract?.generation.auto.signature;
    if (!signature) return;
    if (!artifactContract.hasUsableArtifacts) return;
    retryCountRef.current[signature] = 0;
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.removeItem === "function") {
        window.localStorage.removeItem(retryCountStorageKey(signature));
      }
    } catch {
      // ignore
    }
  }, [artifactContract.hasUsableArtifacts, workflowOrchestratorCore.contract?.generation.auto.signature]);

  const studioAutoRetryCount = useMemo(() => {
    if (!studioContractSignature) return 0;
    const inMemory = retryCountRef.current[studioContractSignature] ?? 0;
    if (inMemory > 0) return inMemory;
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
        const raw = window.localStorage.getItem(retryCountStorageKey(studioContractSignature));
        const parsed = raw ? Number(raw) : 0;
        return Number.isFinite(parsed) ? parsed : 0;
      }
    } catch {
      // ignore
    }
    return 0;
  }, [studioContractSignature]);
  const studioHasRetriesRemaining = studioAutoRetryCount < MAX_AUTO_RETRIES;
  const studioRetryInProgress =
    studioEffectiveGenerationState === "generated_unusable" &&
    studioHasRetriesRemaining &&
    (autoGenerationInFlight ||
      generationReadyPhase === "generating" ||
      resumeGenerating ||
      coverGenerating ||
      resumeAutoGenerating ||
      coverAutoGenerating ||
      resumeGenerateNowPending ||
      coverGenerateNowPending ||
      studioArtifactPairStatus === "in_progress");
  const studioAutoRetryCapReached =
    studioEffectiveGenerationState === "generated_unusable" && studioAutoRetryCount >= MAX_AUTO_RETRIES;

  const generationReadyAutoStartRef = useRef<string | null>(null);

  const shouldShowResumeRegenerate =
    studioEffectiveGenerationState === "generated_unusable" && resumeNeedsRefinement;
  const shouldShowCoverRegenerate =
    studioEffectiveGenerationState === "generated_unusable" && coverNeedsRefinement;

  useEffect(() => {
    // Prod-safe diagnostic: only log when the UX is in the "generated unusable" lane.
    if (studioEffectiveGenerationState !== "generated_unusable") return;
    console.info("[studio][manual_regenerate_visibility]", {
      effectiveGenerationState: studioEffectiveGenerationState,
      retryCount: studioAutoRetryCount,
      MAX_AUTO_RETRIES,
      resumeNeedsRefinement,
      coverNeedsRefinement,
      shouldShowResumeRegenerate,
      shouldShowCoverRegenerate,
    });
    console.log("RENDER_SOURCE", { state: studioEffectiveGenerationState, using: "preview_only" });
  }, [
    studioEffectiveGenerationState,
    studioAutoRetryCount,
    resumeNeedsRefinement,
    coverNeedsRefinement,
    shouldShowResumeRegenerate,
    shouldShowCoverRegenerate,
  ]);

  const handleManualRegenerate = useCallback(async (source: "resume" | "cover") => {
    console.log("[studio][manual_regenerate_handler_entered]", { source });
    const signature = workflowOrchestratorCore.contract?.generation.auto.signature ?? null;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[studio][manual_regenerate_clicked]", {
        contractSignature: signature,
        retryCount: signature ? (retryCountRef.current[signature] ?? 0) : null,
      });
    }

    // Bypass the auto-generation succeeded latch for this signature so a user-initiated retry
    // always triggers POST /api/resume and POST /api/cover-letters without relying on URL noise.
    try {
      if (signature && typeof window !== "undefined" && window.localStorage) {
        const storageKey = `ttr:studio:auto-generate:${signature}`;
        if (typeof window.localStorage.removeItem === "function") {
          window.localStorage.removeItem(storageKey);
        }
      }
    } catch {
      // ignore
    }

    // Do not rely on the auto-start effect re-running; call generation directly.
    // Also prevent the auto-start effect from treating this signature as "already started".
    generationReadyAutoStartRef.current = null;

    if (process.env.NODE_ENV !== "production") {
      console.warn("[studio][manual_regenerate_start]", { contractSignature: signature });
    }

    // Manual retry must bypass all helper flows and hit the generation endpoints directly.
    // This avoids any readiness-only routing in helpers and ensures Railway logs show:
    // - REQ POST /resume
    // - REQ POST /cover-letters
    const manualRequestId = createRequestId();
    const stableSessionKey = `${effectiveBaselineId ?? "base"}:${effectiveJobId ?? "job"}:${requestedAnalysisId ?? "analysis"}:manual_retry`;
    const sessionKey = `${stableSessionKey}:${manualRequestId}:${Date.now()}`;

    const baselineId = effectiveBaselineId ?? null;
    const baselineVersionId = effectiveBaselineVersionId ?? null;
    const jobId = effectiveJobId ?? null;
    const analysisId = requestedAnalysisId ?? null;

    console.log("[studio][manual_regenerate_resume_requested]", { requestId: manualRequestId, sessionKey });
    console.log("[studio][manual_regenerate_cover_requested]", { requestId: manualRequestId, sessionKey });

    const payload = {
      baselineId,
      baselineVersionId,
      jobId,
      analysisId,
      requestId: manualRequestId,
      sessionKey,
      regenerationSource: "manual_retry" as const,
    };

    console.log("[studio][manual_regenerate_direct_resume]", payload);
    console.log("[studio][manual_regenerate_direct_cover]", payload);

    const [resumeResponse, coverResponse] = await Promise.all([
      fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ]);

    console.log("[studio][manual_regenerate_result]", {
      ok: resumeResponse.ok && coverResponse.ok,
      requestId: manualRequestId,
      resumeStatus: resumeResponse.status,
      coverStatus: coverResponse.status,
    });
  }, [
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    requestedAnalysisId,
    workflowOrchestratorCore.contract?.generation.auto.signature,
  ]);
  useEffect(() => {
    const contract = workflowOrchestratorCore.contract;
    if (!contract) return;

    const signature = contract.generation.auto.signature;
    if (generationReadyAutoStartRef.current === signature) return;

    const effectiveGenerationState =
      contract.generation.state === "generated" && !artifactContract.hasUsableArtifacts
        ? "generated_unusable"
        : contract.generation.state;

    let contractShouldStart = contract.generation.auto.shouldStart === true;
    if (effectiveGenerationState === "generated_unusable") {
      const retryCount = retryCountRef.current[signature] ?? 0;
      if (retryCount >= MAX_AUTO_RETRIES) {
        contractShouldStart = false;

        if (process.env.NODE_ENV !== "production") {
          console.warn("[studio][retry_cap_reached]", {
            contractSignature: signature,
            retryCount,
          });
        }
      } else {
        contractShouldStart = true;
      }
    }
    const ready = effectiveGenerationState === "ready" || effectiveGenerationState === "generated_unusable";

    if (
      effectiveGenerationState === "generated_unusable" &&
      invalidGeneratedStateLoggedRef.current !== signature &&
      process.env.NODE_ENV !== "production"
    ) {
      invalidGeneratedStateLoggedRef.current = signature;
      console.warn("[studio][invalid_generated_state]", {
        hasResume: Boolean(artifactContract.hasResumeArtifact),
        hasCover: Boolean(artifactContract.hasCoverLetterArtifact),
        resumeQuality: artifactContract.quality.resume,
        coverQuality: artifactContract.quality.coverLetter,
      });
    }

    // Treat "artifacts exist" as "usable artifacts exist". Unusable outputs should not suppress
    // regeneration (manual or auto) and should not trip the artifacts_already_generated lane.
    const artifactsExist = artifactContract.hasUsableArtifacts;
    const generatingNow =
      autoGenerationInFlight ||
      resumeGenerating ||
      coverGenerating ||
      studioArtifactPairStatus === "in_progress" ||
      generationReadyPhase === "generating";

    const storageKey = `ttr:studio:auto-generate:${signature}`;
    const lastSignatureKey = "ttr:studio:auto-generate:last-signature";
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    let latch: string | null = null;
    try {
      latch = storage && typeof storage.getItem === "function" ? storage.getItem(storageKey) : null;
    } catch {
      latch = null;
    }

    // Instrumentation: run on every dependency change for this effect scope.
    // In production, avoid noisy logs unless explicitly enabled or we're in the ready lane.
    const shouldLog =
      debugAutoGenerationEnabled || ready || contractShouldStart || process.env.NODE_ENV !== "production";
    if (shouldLog) {
      console.log("[STUDIO][AUTO_GEN][EFFECT_ENTER]", {
        contractGenerationState: effectiveGenerationState,
        contractShouldStart,
        signature,
        latch,
        urlJobId: selectedJobId ?? null,
        urlAnalysisId: requestedAnalysisId ?? null,
        urlBaselineId: selectedBaselineId ?? null,
        resolvedJobId: effectiveJobId ?? null,
        resolvedAnalysisId: effectiveRequestedAnalysisId ?? null,
        resolvedBaselineVersionId: effectiveBaselineVersionId ?? null,
      });
      console.log("[STUDIO][AUTO_GEN][CONTRACT]", contract.generation);
      console.log("[STUDIO][AUTO_GEN][CONTRACT_DEBUG]", contract.generation.debug);
      if (contract.generation.state === "ready") {
        console.log("[STUDIO][AUTO_GEN][FORCE_CHECK]");
      }
    }

    const shouldBlockFromLatch = latch === "succeeded" && artifactContract.hasUsableArtifacts;
    const skipReason =
      contract.generation.auto.shouldStart === true
        ? null
        : "skipReason" in contract.generation.auto
          ? contract.generation.auto.skipReason
          : "unknown";
    const decision = {
      contractGenerationState: effectiveGenerationState,
      contractShouldStart,
      contractSignature: signature,
      latch,
      skipReason,
    };

    if (debugAutoGenerationEnabled) {
      console.log("[STUDIO][AUTO_GEN][DECISION]", decision);
    }

    if (!ready || !contractShouldStart) {
      if (debugAutoGenerationEnabled) {
        console.log("[STUDIO][AUTO_GEN][SKIP]", { ...decision, reason: "contract_not_ready_or_shouldStart_false" });
      }
      return;
    }

    if (suppressAutoGenerationRef.current) {
      if (debugAutoGenerationEnabled) {
        console.log("[STUDIO][AUTO_GEN][SKIP]", { ...decision, reason: "suppressed_by_artifact_hydration" });
      }
      return;
    }

    if (artifactsExist) {
      if (debugAutoGenerationEnabled) {
        console.log("[STUDIO][AUTO_GEN][SKIP]", { ...decision, reason: "artifacts_exist" });
      }
      return;
    }

    if (generatingNow) {
      if (debugAutoGenerationEnabled) {
        console.log("[STUDIO][AUTO_GEN][SKIP]", { ...decision, reason: "already_generating" });
      }
      return;
    }

    if (shouldBlockFromLatch) {
      if (debugAutoGenerationEnabled) {
        console.log("[STUDIO][AUTO_GEN][SKIP]", { ...decision, reason: "latch_succeeded" });
      }
      return;
    }

    generationReadyAutoStartRef.current = signature;
    try {
      if (storage && typeof storage.setItem === "function") {
        // If we're about to legitimately start generation, clear any stale failed latch for the same
        // signature (or the immediately previous signature, if present). This prevents "failed"
        // from surviving a later successful generation.
        if (typeof storage.getItem === "function" && typeof storage.removeItem === "function") {
          const previousSignature = storage.getItem(lastSignatureKey);
          if (previousSignature && previousSignature !== signature) {
            const previousKey = `ttr:studio:auto-generate:${previousSignature}`;
            const previousLatch = storage.getItem(previousKey);
            if (previousLatch === "failed") storage.removeItem(previousKey);
          }
          const currentLatch = storage.getItem(storageKey);
          if (currentLatch === "failed") storage.removeItem(storageKey);
        }
        storage.setItem(lastSignatureKey, signature);
        storage.setItem(storageKey, "started");
      }
    } catch {
      // ignore
    }

    void (async () => {
      try {
        if (shouldLog) console.log("[STUDIO][AUTO_GEN][START_CALLED]");
        const { ok, resumeResult, coverResult } = await startGenerationFromReadyShell("shell_auto");
        const resumeSucceeded = resumeResult?.ok === true && resumeResult.status === "success";
        const coverSucceeded = coverResult?.ok === true && coverResult.status === "success";
        const latchSucceeded = ok || (resumeSucceeded && coverSucceeded);
        try {
          if (storage && typeof storage.setItem === "function") {
            storage.setItem(storageKey, latchSucceeded ? "succeeded" : "failed");
            storage.setItem(lastSignatureKey, signature);
          }
        } catch {
          // ignore
        }
        if (shouldLog) {
          console.log("[STUDIO][AUTO_GEN][RESULT_JSON]", JSON.stringify({
            ok,
            error: null,
            resumeResult,
            coverResult,
            baselineVersionId: effectiveBaselineVersionId ?? null,
            jobId: effectiveJobId ?? null,
            analysisId: effectiveRequestedAnalysisId ?? null,
            contractSignature: signature,
            build: studioBuildMarker,
          }));
        }
        if (debugAutoGenerationEnabled) {
          console.log("[STUDIO][AUTO_GEN][RESULT]", { ...decision, ok, latchSucceeded });
        }
      } catch (error) {
        try {
          if (storage && typeof storage.setItem === "function") storage.setItem(storageKey, "failed");
        } catch {
          // ignore
        }
        if (shouldLog) {
          console.log("[STUDIO][AUTO_GEN][RESULT_JSON]", JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            resumeResult: null,
            coverResult: null,
            baselineVersionId: effectiveBaselineVersionId ?? null,
            jobId: effectiveJobId ?? null,
            analysisId: effectiveRequestedAnalysisId ?? null,
            contractSignature: signature,
            build: studioBuildMarker,
          }));
        }
        if (debugAutoGenerationEnabled) {
          console.log("[STUDIO][AUTO_GEN][RESULT]", { ...decision, ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
  }, [
    autoGenerationInFlight,
    coverGenerating,
    debugAutoGenerationEnabled,
    generationReadyPhase,
    hasUsableCoverLetter,
    hasUsableResume,
    resumeGenerating,
    studioArtifactPairStatus,
    startGenerationFromReadyShell,
    workflowOrchestratorCore.contract?.generation.state,
    workflowOrchestratorCore.contract?.generation.auto.shouldStart,
    workflowOrchestratorCore.contract?.generation.auto.signature,
    effectiveBaselineVersionId,
    effectiveJobId,
    effectiveRequestedAnalysisId,
  ]);

  useEffect(() => {
    if (!hasGenerateIntent) return;
    if (generationIntentHandledRef.current) return;
    if (!generationReadyShellActive) return;
    if (generationReadyPhase !== "ready") return;
    if (!effectiveBaselineVersionId) return;
    generationIntentHandledRef.current = true;

    void (async () => {
      try {
        await startGenerationFromReadyShell("shell");
      } finally {
        // Prevent loops on refresh: strip intent after first handling.
        try {
          if (typeof window === "undefined") return;
          const url = new URL(window.location.href);
          url.searchParams.delete("intent");
          router.replace(`${url.pathname}${url.search}`);
        } catch {
          // ignore
        }
      }
    })();
  }, [
    effectiveBaselineVersionId,
    generationReadyPhase,
    generationReadyShellActive,
    hasGenerateIntent,
    router,
    startGenerationFromReadyShell,
  ]);

  const workflowSurfaceAuthorityStudio = workflowSurfaceAuthorityHero;

  const workflowSurfaceAuthorityStudioTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    const signature = [
      workflowSurfaceAuthorityStudio.canonicalState,
      workflowSurfaceAuthorityStudio.trustTone,
      workflowSurfaceAuthorityStudio.primaryAction.destination,
    ].join("|");
    if (workflowSurfaceAuthorityStudioTrackedRef.current === signature) return;
    workflowSurfaceAuthorityStudioTrackedRef.current = signature;

    trackEvent("workflow_surface_authority_viewed", {
      surface: "studio",
      canonical_state: workflowSurfaceAuthorityStudio.canonicalState,
      trust_tone: workflowSurfaceAuthorityStudio.trustTone,
      primary_action_destination: workflowSurfaceAuthorityStudio.primaryAction.destination,
    });
  }, [
    trackEvent,
    workflowSurfaceAuthorityStudio.canonicalState,
    workflowSurfaceAuthorityStudio.primaryAction.destination,
    workflowSurfaceAuthorityStudio.trustTone,
  ]);

  if (unlockFlowActive) {
    return (
      <PageShell className="space-y-4 pb-4">
        <WorkflowActivityBanner tracker={workflowActivityBannerTracker} />
        <div
          data-workflow-shell="unlock-flow"
          data-workflow-state={workflowOrchestratorCore.authorityState.canonicalState}
          data-workflow-trust-tone={workflowOrchestratorCore.authorityState.trustTone}
        >
        {unlockReanalysisFailure ? (
          <PostUnlockOutcomeShell
            model={
              workflowOrchestratorCore.unlockReanalysisFailureState.model ??
              workflowOrchestratorCore.postUnlockState.model ??
              {
                outcomeState: "reanalysis_failed",
                headline: "Re-evaluation failed.",
                body: "We couldn’t confirm whether your new evidence changed readiness. Retry the re-evaluation to refresh your score and gating state.",
                primaryCta: { label: "Try re-evaluating again", action: "retry_reanalysis" },
                secondaryCta: { label: "Add more evidence", href: "", action: "return_to_evidence" },
              }
            }
            detail={unlockReanalysisFailure.message}
            primaryDisabled={unlockSubmitting || isWorkflowOperationActive("unlock_reanalysis_running")}
            onPrimary={() => {
              setUnlockSubmitting(true);
              setUnlockSubmitError(null);
              void (async () => {
                try {
                  await runAnalysisRefreshAfterUnlock({
                    score: unlockReanalysisFailure.priorScore,
                    readiness: unlockReanalysisFailure.priorReadiness,
                  });
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : "Re-evaluation failed. Please retry.";
                  setUnlockSubmitting(false);
                  setUnlockReanalysisFailure((current) =>
                    current
                      ? {
                          ...current,
                          message,
                        }
                      : null,
                  );
                }
              })();
            }}
            onSecondary={() => {
              setUnlockReanalysisFailure(null);
            }}
            onDismiss={handleUnlockFlowSkip}
          />
        ) : (
          <UnlockPanel
            dimension={unlockContext.dimension ?? "Evidence gap"}
            missingEvidence={unlockContext.missingEvidence}
            submitting={unlockSubmitting || isWorkflowOperationActive("unlock_reanalysis_running")}
            error={unlockSubmitError}
            onSkip={handleUnlockFlowSkip}
            onSubmit={handleUnlockFlowSubmit}
          />
        )}
        </div>
      </PageShell>
    );
  }

  if (postUnlockActive && postUnlockModel) {
    return (
      <PageShell className="space-y-4 pb-4">
        <WorkflowActivityBanner tracker={workflowActivityBannerTracker} />
        <p className="text-sm font-semibold text-slate-100" data-testid="studio-readiness-message">
          {canonicalStudioReadinessMessage}
        </p>
        <div
          data-workflow-shell="post-unlock-outcome"
          data-workflow-state={workflowOrchestratorCore.authorityState.canonicalState}
          data-workflow-trust-tone={workflowOrchestratorCore.authorityState.trustTone}
        >
        <PostUnlockOutcomeShell
          model={postUnlockModel}
          detail={postUnlockRetryError ?? (analysisError && !analysisLoading ? analysisError : null)}
          primaryDisabled={postUnlockRetrying || isWorkflowOperationActive("unlock_reanalysis_running")}
          onPrimary={() => {
            const action = postUnlockModel.primaryCta.action ?? null;
            if (action === "retry_reanalysis") {
              void retryPostUnlockReanalysis();
              return;
            }
            if (action === "return_to_evidence") {
              void router.push(postUnlockModel.primaryCta.href ?? strengthenPrimaryHref);
              dismissPostUnlockOutcome();
              return;
            }
            if (action === "start_generation") {
              const priorScore = postUnlockParams.priorScore;
              const newScore = typeof analysisScore === "number" ? analysisScore : null;
              const scoreDelta =
                typeof priorScore === "number" && typeof newScore === "number" ? newScore - priorScore : null;
              trackEvent("unlock_generation_started", {
                source: "studio",
                prior_score: priorScore,
                new_score: newScore,
                score_delta: scoreDelta,
                prior_readiness: postUnlockParams.priorReadiness,
                new_readiness: postUnlockNewReadiness,
                outcome_state: postUnlockModel.outcomeState,
              });
              void startGenerationFromReadyShell("post_unlock");
              dismissPostUnlockOutcome();
              return;
            }
            dismissPostUnlockOutcome();
          }}
          onSecondary={() => {
            const action = postUnlockModel.secondaryCta?.action ?? null;
            if (action === "retry_reanalysis") {
              void retryPostUnlockReanalysis();
              return;
            }
            dismissPostUnlockOutcome();
          }}
          onDismiss={dismissPostUnlockOutcome}
        />
        </div>
      </PageShell>
    );
  }

  if (generationReadyShellActive) {
    const trust = generationReadyModel.trustSummary;
    return (
      <PageShell className="space-y-4 pb-4">
        <WorkflowActivityBanner tracker={workflowActivityBannerTracker} />
        <p className="text-sm font-semibold text-slate-100" data-testid="studio-readiness-message">
          {canonicalStudioReadinessMessage}
        </p>
        <div
          data-workflow-shell="generation-ready-shell"
          data-workflow-state={workflowOrchestratorCore.authorityState.canonicalState}
          data-workflow-trust-tone={workflowOrchestratorCore.authorityState.trustTone}
        >
        <GenerationReadyShell
          fitScore={typeof trust?.fitScore === "number" ? trust.fitScore : null}
          readinessState={trust?.readinessState ?? "Ready"}
          evidenceStatus={trust?.evidenceStatus ?? "Evidence blocker: Cleared"}
          phase={generationReadyPhase}
          failure={generationReadyFailure}
          disableActions={isWorkflowOperationActive("generation_running")}
          onGenerate={() => void startGenerationFromReadyShell("shell")}
          onRetry={() => void startGenerationFromReadyShell("shell")}
          onOpenWorkspace={() => dismissGenerationReadyShell("open_workspace")}
          onReturnToEvidence={() => {
            void router.push(strengthenPrimaryHref);
            dismissGenerationReadyShell("dismiss");
          }}
        />
        </div>
      </PageShell>
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[WORKFLOW][ARTIFACT_STATE]", {
      resume: resumeState,
      cover: coverState,
    });
  }

  const stableSkeleton = (
    <PageShell>
      <RouteStateShell eyebrow="Loading" title="Studio" body="Loading Studio..." testId="studio-hydration-skeleton" />
    </PageShell>
  );

  const studioContent = (
    <PageShell className="space-y-4 pb-4">
      <WorkflowActivityBanner tracker={workflowActivityBannerTracker} />
      <p className="text-sm font-semibold text-slate-100" data-testid="studio-readiness-message">
        {canonicalStudioReadinessMessage}
      </p>
      {showInstantDraftHeroSafe ? instantDraftHero : null}
      {showReadinessRecoveryExperience && !activeGenerationReadiness.blocked ? unlockEntryPanel : null}
      {unlockGenerationLoadingMessage && showPrimaryGeneratingNotice ? (
        <Alert intent="info" title="Verified evidence in use">
          {unlockGenerationLoadingMessage}
        </Alert>
      ) : null}
      {autoGenerationLoadingMessage && showPrimaryGeneratingNotice ? (
        <Alert intent="info" title="Generating your documents...">
          {autoGenerationLoadingMessage}
        </Alert>
      ) : null}
      {pageTruth.state === "failed" && !workflowAuthority.suppressFailureMessaging ? (
        <Alert intent="warning" title="Document generation needs attention">
          {toConstraintMessage(
            resumeState.error ??
              coverState.error ??
              resumeState.artifactFailure?.explanation ??
              coverState.artifactFailure?.explanation ??
              "Generation failed. Please try again.",
          )}
        </Alert>
      ) : null}
      {pageTruth.state === "ready" &&
      isGuidedActive &&
      guidedStep === "GENERATE" &&
      !studioBlockedByNextAction &&
      !generateNowEligible ? (
        <GuidedOverlay
          headline="Now this role is ready for tailored output."
          body="Generate your resume now, then save the opportunity."
          ctaLabel="Generate Resume"
          onCtaClick={() => {
            void handleResumeDraft();
          }}
        />
      ) : null}
      <section
        className="space-y-5 rounded-[28px] bg-slate-900/45 p-6 md:p-8"
        data-testid="studio-generation-readiness"
        data-runtime-analysis-id={requestedAnalysisId || ""}
        data-runtime-job-id={effectiveJobId || ""}
        data-runtime-baseline-id={effectiveBaselineId || ""}
        data-runtime-baseline-version-id={effectiveBaselineVersionId || ""}
        data-runtime-selected-job-id={selectedJobId || ""}
        data-runtime-selected-baseline-id={selectedBaselineId || ""}
        data-runtime-selected-baseline-version-id={selectedBaselineVersionId || ""}
      >
        {null}
        {confidenceUpgradeMessage ? (
          <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
            {confidenceUpgradeMessage}
          </div>
        ) : null}
        {studioDraftMode || draftAnywayRequested ? (
          <div
            className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50"
            data-testid="studio-results-ready-banner"
          >
            {draftAnywayRequested
              ? "This draft is based only on your current verified experience. It may need stronger evidence before it is competitive."
              : workflowAuthority.workflowState === "READY"
                ? "Generated from verified evidence."
                : "Generated from partially verified evidence. Add verified examples to strengthen it."}
          </div>
        ) : null}
        {showReadinessRecoveryExperience && !studioDraftMode ? (
          <>
            <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4" data-testid="studio-blocked-primary-action">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Strengthen your experience to unlock stronger documents
              </p>
              <p className="text-sm text-slate-300">
                Use the highest-impact evidence gaps from this analysis.
              </p>
              <div className="space-y-2">
                {highestImpactEvidenceActions.map((action) => (
                  <Link
                    key={`studio-strengthen-action-${action}`}
                    href={buildClaimVerificationHref(action)}
                    className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
                  >
                    {action}
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href={strengthenPrimaryHref}
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Strengthen my experience
                </Link>
                <Link
                  href={fitReviewHref}
                  className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
                >
                  View fit review
                </Link>
              </div>
            </section>

            <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50" data-testid="studio-blocked-message">
              We can’t generate strong documents yet because key experience isn’t clearly supported.{readinessMessageScopeSuffix}
            </div>

            {draftAnywayEligible ? (
            <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4" data-testid="studio-draft-anyway">
              <p className="text-sm font-semibold text-slate-100">Draft mode</p>
              <p className="text-sm text-slate-300">
                Generate a draft using only verified baseline inputs. No inferred experience is added.
              </p>
              <div className="flex flex-wrap gap-3">
                <FormButton
                  onClick={() => void handleGenerateDraftAnyway()}
                  disabled={pageTruth.isGenerating || resumeGenerating || coverGenerating}
                >
                  Generate draft anyway
                </FormButton>
              </div>
            </section>
            ) : null}

            {prioritizedStrengtheningSuggestions.length ? (
              <section
                className="rounded-2xl border border-sky-300/25 bg-slate-950/35 p-4"
                data-testid="studio-strengthening-guidance"
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
                    Fastest ways to strengthen this
                  </p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {prioritizedStrengtheningSuggestions.slice(0, 2).map((suggestion) => (
                    <li key={`studio-strengthen-${suggestion.requirement}`}>
                      <Link
                        href={buildClaimVerificationHref(suggestion.requirement)}
                        className="inline-flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-semibold text-slate-100 transition hover:bg-white/[0.06]"
                      >
                        <span>{suggestion.action}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <>
            {!generateNowEligible && !isReadySuccessState ? (

              <div className="space-y-2" data-testid="studio-ready-secondary-summary">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {workflowAuthority.workflowState === "BLOCKED"
                  ? "Blocked"
                  : workflowAuthority.workflowState === "REVIEW_REQUIRED"
                    ? "Draft"
                    : "Ready"}
              </p>
              <p className="text-sm text-slate-300">
                {typeof analysisScore === "number"
                  ? `Fit score ${Math.round(analysisScore)} - `
                  : "Fit score unavailable - "}
                {(selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? "Unknown company")} -{" "}
                {(selectedJob?.title ?? analysis?.jobTitle ?? analysis?.title ?? "Unknown role")}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-50 md:text-[34px]">
                {workflowAuthority.headline}
              </h1>
              <p className="text-base leading-7 text-slate-200">{workflowAuthority.body}</p>
              <p className="text-sm font-medium text-slate-200">
                {workflowAuthority.primaryAction === "GENERATE"
                  ? generateNowEligible
                    ? workflowSurfaceAuthorityHero.canonicalState === "generation_in_progress"
                      ? "Generating documents..."
                      : "Generate documents"
                    : "Generate documents"
                  : workflowAuthority.primaryAction === "RETRY"
                    ? "Retry generation"
                  : workflowAuthority.primaryAction === "REVIEW"
                      ? "Review fit gaps"
                      : "Resolve blockers"}
              </p>
              <p className="text-sm text-slate-400">
                {workflowAuthority.workflowState === "READY"
                  ? "Generated from verified evidence."
                  : workflowAuthority.workflowState === "REVIEW_REQUIRED"
                    ? "Generated from partially verified evidence. Verify key claims to strengthen it."
                    : "Based on your analyzed role context and verified baseline evidence."}
              </p>

              </div>

              ) : null}
            {!isReadySuccessState ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4" data-testid="studio-decision-panel"> 
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Decision + Action</p> 
              {generateNowEligible ? (
                <p className="mt-1 text-xs font-medium text-slate-400" data-testid="studio-confidence-label">
                  Confidence: {artifactQuality.confidence === "HIGH" ? "high" : "medium"} (non-blocking)
                </p>
              ) : null}
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">  
                {workflowSurfaceAuthorityHero.canonicalState === "generation_in_progress"
                  ? "Generating your documents..."
                  : hasCompletedGeneration  
                  ? showLowQualityRecoveryLane  
                    ? "This draft needs another pass."  
                    : generateNowEligible && isLowQualityDraft
                      ? "Draft output: ready to refine in Studio."
                  : isMediumQualityDraft  
                      ? "Draft output: usable now, stronger with refinement."  
                      : "Strong output: ready to refine in Studio."  
                  : workflowOrchestratorCore.contract.generation.state === "ready"
                    ? "Draft output: ready to generate."
                    : "Limited output: not ready yet."}
              </h2>
              <p className="mt-2 text-sm text-slate-200">  
                {workflowSurfaceAuthorityHero.canonicalState === "generation_in_progress"
                  ? "We're building your tailored resume and cover letter now."
                  : hasCompletedGeneration  
                  ? showLowQualityRecoveryLane  
                    ? "The current output is usable only as a rough starting point. Review the issues below, then regenerate or refine from verified evidence."  
                    : generateNowEligible && isLowQualityDraft
                      ? "Generated with conservative truth bounds from your baseline evidence. Review and refine as needed before applying."
                    : isMediumQualityDraft  
                      ? "Usable now, but tightening evidence and refinement will materially improve the result."  
                      : "Built from your verified experience and aligned to the role. Review and refine as needed before applying." 
                  : workflowOrchestratorCore.contract.generation.state === "ready"
                    ? "Built from your baseline evidence and ready for generation."
                    : "Built from your baseline evidence, but a few signals still need strengthening."}
              </p>
              {hasCompletedGeneration && (showLowQualityRecoveryLane || isMediumQualityDraft) ? ( 
                <div className="mt-4 space-y-2"> 
                  <p className="text-sm font-semibold text-slate-100"> 
                    {isMediumQualityDraft ? "What to improve next" : "What's holding this back"} 
                  </p> 
                  <ul className="space-y-1 text-sm text-slate-300">
                    {(
                      artifactQuality.improvableClaims.length
                        ? artifactQuality.improvableClaims.slice(0, 4).map((claim) => claim.text)
                        : canonicalUnverifiedRequirements.length
                          ? canonicalUnverifiedRequirements.slice(0, 4)
                          : evidenceLedger.remainingWeakAreas.slice(0, 4)
                    ).map((item) => (
                      <li
                        key={`studio-decision-gap-${item}`}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                  {showLowQualityRecoveryLane ? ( 
                    <div className="mt-3 flex flex-wrap gap-2"> 
                      <FormButton 
                        onClick={() => void handleRegenerateDraft()} 
                        disabled={pageTruth.isGenerating || resumeGenerating || coverGenerating} 
                        data-testid="studio-low-quality-regenerate" 
                      >
                        Regenerate draft
                      </FormButton>
                      <Link
                        href={
                          artifactQuality.improvableClaims[0]?.text
                            ? buildClaimVerificationHref(artifactQuality.improvableClaims[0].text)
                            : fitReviewHref
                        }
                        className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
                        data-testid="studio-low-quality-verify-evidence"
                      >
                        Verify evidence
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div> 
            ) : null}
            {!generateNowEligible ? (
              <StudioArtifactQualityPanel
                model={artifactQuality}
                confidence={artifactQuality.confidence}
                onVerifyClaim={verifyClaim}
                onEditClaim={openClaimEditModal}
                onDismissClaim={dismissClaim}
              />
            ) : null}
          </> 
        )} 
        {hasCompletedGeneration ? (
          isReadySuccessState ? (
            artifactQuality.confidence === "LOW" ? (
            <details
              className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"
              data-testid="studio-refinement-details"
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                Improve this draft (optional)
              </summary>
              <div className="mt-4 space-y-4">
                {documentCritique ? (
                  <StudioCritiquePanel
                    critique={documentCritique}
                    isApplying={refinementApplying}
                    onApplyRecommendation={applyCritiqueRecommendation}
                  />
                ) : null}
                <StudioRefinementPanel
                  plan={documentStrategyPlan}
                  refinementCount={refinementInstructions.length}
                  statusMessage={refinementStatusMessage}
                  isApplying={refinementApplying}
                  onApplyRefinement={queueRefinement}
                  onUndo={undoLastRefinement}
                  onReset={revertToOriginalRefinement}
                />
                {hasGeneratedDocumentPair ? (
                  <StudioRoleMatchPanel
                    finalPass={roleMatchFinalPass}
                    isApplying={refinementApplying}
                    stylePolishNote={
                      languageStylePass.transformationsApplied.length > 0
                        ? "Language polished for clarity and readability."
                        : null
                    }
                    onApplyAdjustment={applyFinalRoleAdjustment}
                  />
                ) : null}
              </div>
            </details>
            ) : null
          ) : (
            <>
              {documentCritique ? (
                <StudioCritiquePanel
                  critique={documentCritique}
                  isApplying={refinementApplying}
                  onApplyRecommendation={applyCritiqueRecommendation}
                />
              ) : null}
              <StudioRefinementPanel
                plan={documentStrategyPlan}
                refinementCount={refinementInstructions.length}
                statusMessage={refinementStatusMessage}
                isApplying={refinementApplying}
                onApplyRefinement={queueRefinement}
                onUndo={undoLastRefinement}
                onReset={revertToOriginalRefinement}
              />
              {hasGeneratedDocumentPair ? (
                <StudioRoleMatchPanel
                  finalPass={roleMatchFinalPass}
                  isApplying={refinementApplying}
                  stylePolishNote={
                    languageStylePass.transformationsApplied.length > 0
                      ? "Language polished for clarity and readability."
                      : null
                  }
                  onApplyAdjustment={applyFinalRoleAdjustment}
                />
              ) : null}
            </>
          )
        ) : null}
        {!isReadySuccessState ? (
          <div className="flex flex-wrap items-center gap-3">
            {generateNowEligible && workflowAuthority.primaryAction === "GENERATE" ? (
              (autoGenerationInFlight ||
                resumeGenerating ||
                coverGenerating ||
                studioArtifactPairStatus === "in_progress" ||
                needsAutoGeneration) &&
              workflowSurfaceAuthorityHero.canonicalState === "generation_in_progress" ? (
                <p className="text-sm font-medium text-slate-200" data-testid="studio-auto-generation-status">
                  {lifecycleArtifactFailure && !hasCompletedGeneration
                    ? "Generation needs a retry."
                    : "Generating your resume and cover letter..."}
                </p>
              ) : null
            ) : workflowAuthority.primaryAction === "BLOCKED" ? (
              <Link
                href={remediationHref}
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Resolve blockers
              </Link>
            ) : workflowAuthority.primaryAction === "RETRY" ? (
              <FormButton
                onClick={() => {
                  const resumeFailed = Boolean(resumeState.error || resumeState.artifactFailure);
                  const coverFailed = Boolean(coverState.error || coverState.artifactFailure);
                  if (resumeFailed) {
                    void handleResumeDraft();
                  }
                  if (coverFailed) {
                    void handleCoverDraft();
                  }
                  if (!resumeFailed && !coverFailed) {
                    void handleResumeDraft();
                  }
                }}
                disabled={resumeGenerating || coverGenerating}
                className="bg-indigo-600 text-white hover:bg-indigo-500"
              >
                Retry generation
              </FormButton>
            ) : generateNowEligible ? null : !canGenerateDocuments ? (
              <Link
                href={fitReviewHref}
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Review fit gaps
              </Link>
            ) : (
              <>
                {workflowAuthority.primaryAction === "REVIEW" ? (
                  <Link
                    href={fitReviewHref}
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Review fit gaps
                  </Link>
                ) : null}
                <FormButton
                  onClick={() => {
                    scrollToStudioTop("smooth");
                    void handleResumeDraft();
                  }}
                  disabled={resumeGenerating}
                  className="bg-indigo-600 text-white hover:bg-indigo-500"
                >
                  {resumeGenerating ? "Generating..." : "Generate Resume Draft"}
                </FormButton>
                <FormButton
                  variant="secondary"
                  onClick={() => {
                    scrollToStudioTop("smooth");
                    void handleCoverDraft();
                  }}
                  disabled={coverGenerating}
                >
                  {coverGenerating ? "Generating..." : "Generate Cover Letter Draft"}
                </FormButton>
              </>
            )}
          </div>
        ) : null}
      </section>
      {!isReadySuccessState && (workflowAuthority.workflowState === "READY" || canGenerateDocuments) ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="studio-evidence-allowed-panel">
          <h2 className="text-base font-semibold text-slate-100">
            {workflowAuthority.workflowState === "READY" ? "Why this output is grounded" : "Why this output is limited"}
          </h2>
          <p className="mt-1 text-sm text-slate-200">
            {workflowAuthority.workflowState === "READY"
              ? "This output is grounded in your verified experience."
              : "This output is grounded in verified experience, but some areas still need stronger support."}
          </p>
          {evidenceLedger.entries.length ? (
            <ul className="mt-3 space-y-2">
              {evidenceLedger.entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-white/10 bg-slate-950/35 p-2">
                  <p className="text-sm text-slate-100">
                    {String(entry.text ?? "")
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 240)}
                    {String(entry.text ?? "").replace(/\s+/g, " ").trim().length > 240 ? "..." : ""}
                  </p>
                  {entry.sourceLabel ? <p className="mt-1 text-xs text-slate-400">{entry.sourceLabel}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-300">
              We found likely baseline signals here. Confirm or refine them to strengthen the draft.
            </p>
          )}
          {evidenceLedger.remainingWeakAreas.length ? (
            <p className="mt-2 text-xs text-slate-300">
              Some areas are still lighter than others, so the output will stay measured until the baseline is strengthened.
            </p>
          ) : null}
        </section>
      ) : hasLoadedAnalysis &&
        !showReadinessRecoveryExperience &&
        workflowAuthority.workflowState === "BLOCKED" &&
        !studioDraftMode ? (
        <RouteStateShell
          testId="studio-evidence-blocked-panel"
          tone="warning"
          eyebrow="Blocked"
          title="Why generation is blocked"
          body={
            <p className="text-sm text-slate-100">
              This role still needs stronger proof in a few areas before tailored output will be useful. Return to Fit Review to strengthen the verified baseline and try again.
            </p>
          }
        />
      ) : null}
      {!showReadinessRecoveryExperience && 
      prioritizedStrengtheningSuggestions.length > 0 && 
      !generateNowEligible &&
      (workflowAuthority.workflowState !== "READY" || 
        recentIntent === "refine_intent" || 
        recentIntent === "used_not_committed") ? ( 
        <section 
          className="rounded-2xl border border-sky-300/25 bg-slate-950/35 p-4" 
          data-testid="studio-strengthening-guidance"
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
              Fastest ways to strengthen this
            </p>
            <p className="text-sm text-slate-300">
              These are the highest-impact evidence gaps from your current analysis.
            </p>
          </div>
          <ul className="mt-3 space-y-3">
            {prioritizedStrengtheningSuggestions
              .slice(0, recentIntent === "used_not_committed" ? 2 : 4)
              .map((suggestion) => (
                <li
                  key={`studio-strengthen-${suggestion.requirement}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <p className="text-sm font-semibold text-slate-100">{suggestion.action}</p>
                  <p className="mt-1 text-sm text-slate-300">{suggestion.rationale}</p>
                  <p className="mt-1 text-xs text-slate-400">{suggestion.nextStep}</p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      {opportunityContext ? (
        <p className="text-xs text-slate-400">
          Opportunity status: {opportunityContext.status} ? Updated{" "}
          {new Date(opportunityContext.updatedAt).toLocaleDateString()}
        </p>
      ) : null}
      {targetingAdjustmentFeedback ? (
        <div
          className={`rounded-xl border px-4 py-2 text-sm ${
            targetingAdjustmentStatus === "success"
              ? "border-emerald-300/35 bg-emerald-500/10 text-emerald-100"
              : "border-amber-300/35 bg-amber-500/10 text-amber-100"
          }`}
          data-testid="studio-targeting-adjustment-feedback"
        >
          {targetingAdjustmentFeedback}
        </div>
      ) : null}
      {adjustedReadinessResult.removedClaims.length ? (
        <div className="rounded-xl border border-slate-300/25 bg-slate-500/10 px-4 py-2 text-sm text-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
            Removed from targeting
          </p>
          <p className="mt-1" data-testid="studio-removed-targeting-list">
            {Array.from(new Set(adjustedReadinessResult.removedClaims)).join(", ") ||
              lastRemovedTargetingLabels.join(", ")}
          </p>
        </div>
      ) : null}
      {requestedAnalysisId && 
      (activeGenerationReadiness.status === "blocked" || activeGenerationReadiness.status === "limited") && 
      canonicalUnverifiedRequirements.length ? ( 
        <div 
          id="studio-auto-adjust-panel" 
          className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3" 
          data-testid="studio-auto-adjust-panel" 
        > 
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
            Fix this in one step
          </p>
          <p className="mt-1 text-sm text-slate-100">
            These requirements are not verified from your baseline and are limiting generation.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-100" data-testid="studio-one-step-unverified-list">
            {canonicalUnverifiedRequirements.map((requirement) => (
              <li key={`one-step-unverified-${requirement}`}>- {requirement}</li>
            ))}
          </ul>
          <div className="mt-3">
            <FormButton
              onClick={handleAutoAdjustTargeting}
              disabled={!canonicalUnverifiedRequirements.length}
            >
              Remove unsupported requirements and continue
            </FormButton>
          </div>
        </div> 
      ) : null} 
      {showEvidenceExpansion ? (  
        <section className="rounded-2xl border border-white/15 bg-slate-950/35 p-4" data-testid="studio-evidence-expansion">  
          <h2 className="text-base font-semibold text-slate-100">Prove this experience instead</h2>  
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
                  key={`studio-expansion-${requirement}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <p className="text-sm text-slate-100">{requirement} is not verified</p>
                  {suggestion && !isDismissed ? (
                    <div className="mt-2 rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-3 text-xs text-slate-100">
                      <p className="font-semibold text-emerald-100">Suggested evidence:</p>
                      <p className="mt-1">{suggestion.intro}</p>
                      <p className="mt-1"><span className="font-semibold">Context:</span> {suggestion.context}</p>
                      <p className="mt-1"><span className="font-semibold">Description:</span> {suggestion.description}</p>
                      <p className="mt-1"><span className="font-semibold">Scope:</span> {suggestion.scope}</p>
                      <div className="mt-2 flex gap-2">
                        <FormButton
                          onClick={() => {
                            setExpansionContext(suggestion.context);
                            setExpansionDescription(suggestion.description);
                            setExpansionImpact(suggestion.scope);
                            setExpansionConfirmedAccurate(true);
                            void handleEvidenceExpansionSubmit(requirement);
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
                    <p className="mt-2 text-sm text-emerald-200">{expansionSuccessByRequirement[requirement]}</p>
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
                      {expansionError ? <p className="text-xs text-rose-200">{expansionError}</p> : null}
                      <div className="flex gap-2">
                        <FormButton onClick={() => void handleEvidenceExpansionSubmit()} disabled={expansionSubmitting}>
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

      {!hydratedFromResultsContext && contextHydrationMessage ? (
        <Alert intent="warning" title="Role context unavailable">
          {contextHydrationMessage}
        </Alert>
      ) : null}

      {jobsError ? (
        <Alert intent="warning" title="Role list unavailable">
          {jobsError}
        </Alert>
      ) : null}
      {baselinesError ? (
        <Alert intent="warning" title="Baseline source unavailable">
          {baselinesError}
        </Alert>
      ) : null}
      {!requestedAnalysisId ? (
        <Alert intent="info" title="Role analysis required">
          Select a role from Results to generate documents.
        </Alert>
      ) : null}
      {requestedAnalysisId && analysisError ? (
        <Alert intent="warning" title="Role analysis unavailable">
          {analysisError}
        </Alert>
      ) : null}
      {versionsError ? (
        <Alert intent="warning" title="Resume snapshot unavailable">
          {versionsError}
        </Alert>
      ) : null} 
 
      {!generateNowEligible && !isReadySuccessState ? <StudioNextMove move={studioNextMove} /> : null} 
      {!generateNowEligible && !isReadySuccessState ? (
        <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="studio-document-strategy-details">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Document strategy
          </summary>
          <div className="mt-3">
            <DocumentStrategyPlanSummary plan={documentStrategyPlan} />
          </div>
        </details>
      ) : null} 
 
      {showArtifactMaterials ? ( 
      <> 
      <section className="space-y-1 px-1"> 
        <h2 className="text-xl font-semibold text-slate-100">Your application materials</h2>
        <p className="text-sm text-slate-300">
          Generate, preview, and export your resume and cover letter.
        </p>
      </section>
      <section
        ref={(node) => {
          generationSectionRef.current = node;
        }}
        {...(process.env.NODE_ENV !== "production"
          ? { "data-debug-card-generating": String(resumeGenerating || resumeAutoGenerating || resumeGenerateNowPending) }
          : {})}
        className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Resume</h2>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {resumeNeedsRefinement || resumeRequiresCorrectionCopy
                ? studioEffectiveGenerationState === "generated_unusable"
                  ? studioRetryInProgress
                    ? "Resume failed quality checks. Regenerating..."
                    : "Generation failed quality checks. Please edit or regenerate manually."
                  : "Resume needs refinement before export."
                : renderCardStatus(resumeCardStatus, "Resume")}
            </p>
            {(() => {
              const { generationMode, templateVersion } = readGenerationDebug(artifactContract.normalized.resumeResponse);
              const score = typeof analysisScore === "number" ? analysisScore : null;
              const artifactCurrent = score !== null && score >= 80 && generationMode === "structured_baseline_template";
              const hasMissingStructuredBaseline = readMissingStructuredBaselineSignal(artifactContract.normalized.resumeResponse);
              const reason = score !== null && score < 80
                ? "below_80"
                : score !== null && score >= 80 && hasMissingStructuredBaseline
                  ? "missing_structured_baseline"
                  : score !== null && score >= 80 && generationMode !== "structured_baseline_template"
                    ? "stale_legacy"
                    : "current";
              return (
                <div className="mt-1 text-[10px] leading-4 text-slate-500" data-testid="studio-resume-generation-source">
                  <div>generationMode: {generationMode}</div>
                  <div>templateVersion: {templateVersion}</div>
                  <div>score: {score ?? "unknown"}</div>
                  <div>artifact current: {String(artifactCurrent)}</div>
                  <div>reason: {reason}</div>
                  <div>structuredBaselineExperienceCount: {String((artifactContract as any)?.structuredBaselineExperienceCount ?? "unknown")}</div>
                  <div>structuredBaselineMissingEvidenceReasons: {JSON.stringify((artifactContract as any)?.structuredBaselineMissingEvidenceReasons ?? [])}</div>
                  <div>structuredBaselineExtractedExperiencePreview: {JSON.stringify((artifactContract as any)?.structuredBaselineExtractedExperiencePreview ?? [])}</div>
                </div>
              );
            })()}
          </div>
          {shouldShowResumeRegenerate ? (
            <FormButton
              variant="secondary"
              onClick={() => {
                console.log("[studio][resume_regenerate_button_clicked]");
                void handleManualRegenerate("resume");
              }}
              disabled={pageTruth.isGenerating || resumeGenerating || coverGenerating}
              data-testid="studio-resume-regenerate"
            >
              Regenerate
            </FormButton>
          ) : null}
        </div>
        {showResumeDownloadActions && !resumeNeedsRefinement ? (
          <div className="flex flex-wrap gap-2">
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("docx")}
              disabled={isResumeDownloadLocked || !canExportResume || resumeExportFormat === "docx"}
            >
              {resumeExportFormat === "docx" ? "Downloading..." : "Download DOCX"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("pdf")}
              disabled={isResumeDownloadLocked || !canExportResume || resumeExportFormat === "pdf"}
            >
              {resumeExportFormat === "pdf" ? "Downloading..." : "Download PDF"}
            </FormButton>
          </div>
        ) : null}
        {/* Resume download actions are rendered as buttons; no extra status line needed here. */}

        {resumeNeedsRefinement ? (
          <div
            className="space-y-2 rounded-2xl border border-amber-300/25 bg-amber-500/5 p-4"
            data-testid="studio-resume-quality-warning"
          >
            <p className="text-sm font-semibold text-amber-100">Resume needs correction before export.</p>
            {resumeQualityIssueSummary.visible.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                {resumeQualityIssueSummary.visible.map((issue, index) => (
                  <li key={`resume-quality-issue-${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
            {resumeQualityIssueSummary.remaining ? (
              <p className="text-xs text-slate-300">and {resumeQualityIssueSummary.remaining} more</p>
            ) : null}
          </div>
        ) : null}

        {resumeState.tierGateError ? (
          <Alert intent="warning">
            {resumeState.tierGateError.message ?? "Resume export is limited by your subscription tier."}
          </Alert>
        ) : null}
        {resumeWarningFlags.length ? null : null}
        {resumeNeedsBaselineDetail && !generateNowEligible ? (
          <div className="space-y-3 rounded-2xl border border-sky-300/35 bg-sky-500/10 p-4">
            <p className="text-sm font-semibold text-slate-100">
              More detail needed to generate a strong resume
            </p>
            <p className="text-sm text-slate-200">
              We couldn&apos;t find enough verified experience tied to this role to generate strong bullets.
            </p>
            <p className="text-sm font-medium text-slate-100">
              You&apos;re close - a few more details will unlock a strong resume.
            </p>
            <p className="text-sm text-slate-300">
              We only generate content backed by your real experience.
            </p>
            {typeof analysisScore === "number" ? (
              <p className="text-sm text-slate-200">
                You&apos;re a strong match ({Math.round(analysisScore)}), but we need more detail to reflect that in your resume.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <FormButton onClick={() => void router.push(improveBaselineHref)}>
                Add detail to generate resume
              </FormButton>
              <FormButton
                variant="secondary"
                className="text-xs"
                onClick={() => void handleResumeBasicDraft()}
                disabled={resumeGenerating}
              >
                {resumeGenerating ? "Generating..." : "Generate a basic draft anyway"}
              </FormButton>
            </div>
            <details className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.2em] text-slate-400">
                Technical detail
              </summary>
              <p className="mt-2 text-xs text-slate-300">{toConstraintMessage(resumeState.error)}</p>
            </details>
          </div>
        ) : resumeState.error ? (
          <Alert intent="warning" title="Additional evidence is needed to strengthen this output">
            {toConstraintMessage(resumeState.error)}
          </Alert>
        ) : null}
        {resumeEditError ? (
          <Alert intent="warning" title="Resume edits are currently unavailable">
            {resumeEditError}
          </Alert>
        ) : null}

        {resumeState.artifactFailure ? (
          hasCompletedGeneration ? (
            <div
              className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
              data-testid="resume-partial-retry-panel"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">Resume generation needs a retry</p>
                <p className="text-sm text-slate-300">
                  We produced usable output for this role, but the resume draft needs one more generation pass to
                  complete.
                </p>
                <p className="text-xs text-slate-400">{resumeState.artifactFailure.explanation}</p>
              </div>
              <div className="flex justify-end">
                <FormButton
                  variant="secondary"
                  onClick={() => {
                    scrollToStudioTop("smooth");
                    void handleResumeDraft();
                  }}
                >
                  Retry resume generation
                </FormButton>
              </div>
            </div>
          ) : (
            <ArtifactFailureState
              failure={resumeState.artifactFailure}
              onRetry={() => {
                scrollToStudioTop("smooth");
                void handleResumeDraft();
              }}
              retryLabel="Retry resume generation"
            />
          )
        ) : null}

        {isResumeDownloadLocked ? (
          <Alert intent="warning">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p>Upgrade to Pro to download documents.</p>
                <p>Resume preview is available below.</p>
              </div>
              <Link
                href="/pricing"
                className="text-sm font-semibold text-slate-100 underline decoration-slate-300/70 underline-offset-4 transition hover:text-white"
              >
                Upgrade to Pro
              </Link>
            </div>
          </Alert>
        ) : canExportResume ? (
          null
        ) : null}

        {resumePresenter.status === "blocked" ? (
          <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-100">
              {resumePresenter.display?.title ?? "Resume blocked by compliance"}
            </p>
            <p className="text-sm text-slate-200">
              {resumePresenter.display?.description ??
                "Some generated statements could not be verified against your baseline."}
            </p>
            {resumePresenter.display?.reasons?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                {resumePresenter.display.reasons.map((reason, index) => (
                  <li key={`resume-block-reason-${index}`}>{reason}</li>
                ))}
              </ul>
            ) : null}
            {resumePresenter.display?.cta ? (
              <Link
                href={resumePresenter.display.cta.href}
                className="text-sm font-semibold text-slate-100 underline decoration-slate-300/70 underline-offset-4 transition hover:text-white"
              >
                {resumePresenter.display.cta.label}
              </Link>
            ) : null}
          </div>
        ) : Boolean(effectiveResumeModel) && resumeState.response && !normalizedArtifacts.shouldSuppressStalePreview ? (
          <div
            className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
            data-testid={resumeQualityPass ? "studio-resume-ready-panel" : "studio-resume-correction-panel"}
          >
            {resumeQualityPass ? (
              <p className="text-sm text-slate-200">
                {normalizedArtifacts.artifactDisplayState === "resume_only_ready" ||
                normalizedArtifacts.artifactDisplayState === "partial_failure_retryable" ||
                normalizedArtifacts.artifactDisplayState === "partial_failure_non_retryable"
                  ? "Your resume is ready. Your cover letter still needs attention."
                  : "Your resume is ready. Download or refine below."}
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-100">Resume needs correction before export.</p>
                <p className="text-sm text-slate-200">
                  Review the flagged issue, edit the resume, or regenerate.
                </p>
              </div>
            )}
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/30 p-3">
              {showLowQualityRecoveryLane && !showFullLowQualityResume && !studioIsGeneratedUnusable ? ( 
                <div className="space-y-3" data-testid="studio-low-quality-resume-preview-main"> 
                  <div className="rounded-xl border border-amber-300/25 bg-amber-500/5 p-3">
                    <p className="text-sm font-semibold text-amber-100">This draft needs another pass.</p>
                    <p className="mt-1 text-sm text-slate-200">
                      The current output is usable only as a rough starting point. Review the issues above, verify evidence, then regenerate.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <FormButton
                        onClick={() => void handleRegenerateDraft()}
                        disabled={pageTruth.isGenerating || resumeGenerating || coverGenerating}
                        data-testid="studio-low-quality-regenerate-main"
                      >
                        Regenerate draft
                      </FormButton>
                      <Link
                        href={fitReviewHref}
                        className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
                        data-testid="studio-low-quality-verify-evidence-main"
                      >
                        Verify evidence
                      </Link>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Excerpt</p>
                    <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">
{resumePreviewText.slice(0, 1200)}
{resumePreviewText.length > 1200 ? "\n\n…(excerpt truncated)" : ""}
                    </pre>
                  </div>
                  <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <summary
                      className="cursor-pointer text-sm font-semibold text-slate-100"
                      data-testid="studio-low-quality-resume-view-full-main"
                      onClick={() => setShowFullLowQualityResume(true)}
                    >
                      View full draft anyway
                    </summary>
                  </details>
                </div>
              ) : canonicalResumePreviewPayload ? (
                <ResumePreview payload={canonicalResumePreviewPayload} />
              ) : (
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                  <p className="text-sm font-semibold text-slate-100">Resume needs correction before export.</p>
                  <p className="mt-1 text-sm text-slate-200">
                    Review the flagged issue, edit the resume, or regenerate.
                  </p>
                </div>
              )}
            </div>
            {!isApplicationApplied ? (
              <section
                className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/20 p-4"
                data-testid="studio-opportunities-handoff"
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Keep momentum
                  </p>
                  <h2 className="text-base font-semibold text-slate-50">
                    {trackerEntryId ? "Continue this role in Opportunities" : "Save this role to Opportunities"}
                  </h2>
                  <p className="text-sm text-slate-200">
                    {trackerEntryId
                      ? "Update status and keep the application loop moving after export."
                      : "Save the role so you can track progress after using the artifact."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trackerEntryId ? (
                    <FormButton onClick={handleOpenTracker}>Continue in Opportunities</FormButton>
                  ) : (
                    <Link
                      href="/job-tracker"
                      onClick={() => {
                        recordOpportunityCommitIntent();
                        setRecentIntent(readRecentIntentState());
                        trackEvent("opportunity_commit_intent", {
                          source: "studio",
                          analysisId: requestedAnalysisId || undefined,
                          hasTrackerEntry: false,
                          action: "save",
                        });
                      }}
                      className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                      Save to Opportunities
                    </Link>
                  )}
                </div>
              </section>
            ) : null}

          </div>
        ) : resumeState.artifactFailure ? null : resumeAutoGenerating || resumeGenerateNowPending ? (
          <EmptyState
            testId="studio-resume-generating"
            title="Generating your resume..."
            body="This usually finishes in a moment."
          />
        ) : (
          <EmptyState
            testId="studio-resume-missing"
            title="Resume not generated yet"
            body="Generate your resume to preview and refine your application."
          />
        )}
      </section>

      <section
        className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow"
        {...(process.env.NODE_ENV !== "production"
          ? { "data-debug-card-generating": String(coverGenerating || coverAutoGenerating || coverGenerateNowPending) }
          : {})}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Cover letter</h2>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {coverNeedsRefinement || coverRequiresCorrectionCopy
                ? studioEffectiveGenerationState === "generated_unusable"
                  ? studioRetryInProgress
                    ? "Cover letter failed quality checks. Regenerating..."
                    : "Generation failed quality checks. Please edit or regenerate manually."
                  : "Cover letter needs refinement before export."
                : renderCardStatus(coverCardStatus, "Cover letter")}
            </p>
            {(() => {
              const { generationMode, templateVersion } = readGenerationDebug(artifactContract.normalized.coverLetterResponse);
              const score = typeof analysisScore === "number" ? analysisScore : null;
              const artifactCurrent = score !== null && score >= 80 && generationMode === "structured_baseline_template";
              const hasMissingStructuredBaseline = readMissingStructuredBaselineSignal(artifactContract.normalized.coverLetterResponse);
              const reason = score !== null && score < 80
                ? "below_80"
                : score !== null && score >= 80 && hasMissingStructuredBaseline
                  ? "missing_structured_baseline"
                  : score !== null && score >= 80 && generationMode !== "structured_baseline_template"
                    ? "stale_legacy"
                    : "current";
              return (
                <div className="mt-1 text-[10px] leading-4 text-slate-500" data-testid="studio-cover-generation-source">
                  <div>generationMode: {generationMode}</div>
                  <div>templateVersion: {templateVersion}</div>
                  <div>score: {score ?? "unknown"}</div>
                  <div>artifact current: {String(artifactCurrent)}</div>
                  <div>reason: {reason}</div>
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap gap-2">
            {!generateNowEligible ? (
              <FormButton
                variant="secondary"
                onClick={() => {
                  scrollToStudioTop("smooth");
                  void handleCoverDraft();
                }}
                disabled={coverGenerating}
                data-testid="studio-cover-generate-button"
              >
                {coverGenerating ? "Generating..." : "Generate Cover Letter"}
              </FormButton>
            ) : null}
            {shouldShowCoverRegenerate ? (
              <FormButton
                variant="secondary"
                onClick={() => {
                  console.log("[studio][cover_regenerate_button_clicked]");
                  void handleManualRegenerate("cover");
                }}
                disabled={pageTruth.isGenerating || resumeGenerating || coverGenerating}
                data-testid="studio-cover-regenerate"
              >
                Regenerate
              </FormButton>
            ) : null}
            {showCoverDownloadActions && !coverNeedsRefinement ? (
              <>
                <FormButton
                  variant="secondary"
                  onClick={() => void exportCoverLetter("docx")}
                  disabled={!canExportCover || coverExportFormat === "docx"}
                >
                  {coverExportFormat === "docx" ? "Downloading..." : "Download DOCX"}
                </FormButton>
                <FormButton
                  variant="secondary"
                  onClick={() => void exportCoverLetter("pdf")}
                  disabled={!canExportCover || coverExportFormat === "pdf"}
                >
                  {coverExportFormat === "pdf" ? "Downloading..." : "Download PDF"}
                </FormButton>
              </>
            ) : null}
          </div>
        </div>
        {showCoverDownloadActions && !coverNeedsRefinement ? (
          <p className="text-xs text-slate-400">Download: DOCX | PDF</p>
        ) : null}

        {coverNeedsRefinement ? (
          <div
            className="space-y-2 rounded-2xl border border-amber-300/25 bg-amber-500/5 p-4"
            data-testid="studio-cover-quality-warning"
          >
            <p className="text-sm font-semibold text-amber-100">Cover letter needs correction before export.</p>
            {coverQualityIssueSummary.visible.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                {coverQualityIssueSummary.visible.map((issue, index) => (
                  <li key={`cover-quality-issue-${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
            {coverQualityIssueSummary.remaining ? (
              <p className="text-xs text-slate-300">and {coverQualityIssueSummary.remaining} more</p>
            ) : null}
          </div>
        ) : null}

        {coverLetterComplianceBlocked ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-200 shadow-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <LockIcon className="h-5 w-5 text-amber-300" aria-hidden />
                <p className="text-xs font-semibold tracking-[0.3em] text-slate-300">
                  {coverLetterComplianceBlocked.title}
                </p>
              </div>
              <p className="text-sm text-slate-100">{coverLetterComplianceBlocked.body}</p>
              <p className="text-sm text-slate-400">
                Regenerate safely to keep every claim anchored to verified content.
              </p>
            </div>
            {coverLetterComplianceBlocked.reasons.length ? (
              <ul className="space-y-2 pl-4 text-slate-100">
                {coverLetterComplianceBlocked.reasons.map((reason, index) => (
                  <li key={`blocked-flag-${index}`}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <FormButton onClick={() => void handleCoverDraft()} disabled={coverGenerating}>
                Regenerate safely
              </FormButton>
              {coverLetterComplianceBlocked.cta ? (
                <Link
                  href={coverLetterComplianceBlocked.cta.href}
                  className="text-sm font-medium text-slate-300 underline-offset-4 transition hover:text-white"
                >
                  {coverLetterComplianceBlocked.cta.label}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {coverGating.primaryBlocker === "tier_gate" && coverState.tierGateError ? (
          <section
            className="space-y-3 rounded-2xl border border-amber-300/35 bg-amber-500/10 p-4 text-amber-50 shadow-sm"
            data-testid="studio-cover-tier-gate"
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
                Plan required
              </p>
              <h3 className="text-base font-semibold text-slate-50">Cover letter generation requires Pro</h3>
              <p className="text-sm text-amber-50">This feature is available on the Pro plan.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-200"
              >
                Upgrade to Pro
              </Link>
              <Link
                href={fitReviewHref}
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
              >
                View fit review
              </Link>
            </div>
          </section>
        ) : null}
        {/* Opportunities handoff is rendered below the resume preview for post-review flow. */}

        {coverState.artifactFailure ? (
          hasCompletedGeneration ? (
            isCoverFailureRetryEligible ? (
              <div
                className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                data-testid="cover-partial-retry-panel"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-100">Cover letter generation needs a retry</p>
                  <p className="text-sm text-slate-300">
                    We produced usable output for this role, but the cover letter draft needs one more generation pass
                    to complete.
                  </p>
                  <p className="text-xs text-slate-400">{coverState.artifactFailure.explanation}</p>
                </div>
                <div className="flex justify-end">
                  <FormButton variant="secondary" onClick={() => void handleCoverDraft()}>
                    Retry cover letter generation
                  </FormButton>
                </div>
              </div>
            ) : isCoverFailureNonRetryable ? (
              <div
                className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4"
                data-testid="cover-generation-blocked-panel"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-100">Cover letter generation is blocked</p>
                  <p className="text-sm text-slate-200">
                    Add more verified experience to generate a complete cover letter.
                  </p>
                </div>
                <div className="flex justify-end">
                  <FormButton
                    variant="secondary"
                    onClick={() => focusResumeTarget({ type: "role", index: 0 })}
                    data-testid="studio-cover-blocked-improve-resume"
                  >
                    Improve your resume
                  </FormButton>
                </div>
              </div>
            ) : (
              <ArtifactFailureState
                failure={coverState.artifactFailure}
                onRetry={() => {
                  scrollToStudioTop("smooth");
                  void handleCoverDraft();
                }}
                retryLabel="Retry cover letter generation"
              />
            )
          ) : (
            isCoverFailureRetryEligible ? (
              <ArtifactFailureState
                failure={coverState.artifactFailure}
                onRetry={() => {
                  scrollToStudioTop("smooth");
                  void handleCoverDraft();
                }}
                retryLabel="Retry cover letter generation"
              />
            ) : (
              <div
                className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4"
                data-testid="cover-generation-blocked-panel"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-100">Cover letter generation is blocked</p>
                  <p className="text-sm text-slate-200">
                    Add more verified experience to generate a complete cover letter.
                  </p>
                </div>
                <div className="flex justify-end">
                  <FormButton
                    variant="secondary"
                    onClick={() => focusResumeTarget({ type: "role", index: 0 })}
                    data-testid="studio-cover-blocked-improve-resume"
                  >
                    Improve your resume
                  </FormButton>
                </div>
              </div>
            )
          )
        ) : coverPresenter.display &&
        coverQualityPass &&
        !coverLetterComplianceBlocked &&
        coverPresenter.status !== "blocked" ? (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-sm font-semibold text-slate-100">{coverPresenter.display.title}</p>
            <p className="text-sm text-slate-300">{coverPresenter.display.description}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next step</p>
            <p className="text-sm text-slate-200">{workflowAuthority.nextStepHint}</p>
          </div>
        ) : null}

        {!coverLetterComplianceBlocked && coverPresenter.status === "blocked" ? (
          <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-100">
              {coverPresenter.display?.title ?? "Cover letter blocked by compliance"}
            </p>
            <p className="text-sm text-slate-200">
              {coverPresenter.display?.description ??
                "Some generated statements could not be verified against your baseline."}
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Next step</p>
            <p className="text-sm text-slate-200">{workflowAuthority.nextStepHint}</p>
          </div>
        ) : null}

        {!isPro ? (
          <p className="text-sm text-slate-300">Upgrade to Pro to download documents.</p>
        ) : canExportCover ? (
          null
        ) : null}

        {!coverLetterComplianceBlocked ? (
          coverLetterParagraphs.length > 0 && !normalizedArtifacts.shouldSuppressStalePreview ? (
            <div
              className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
              data-testid={coverQualityPass ? "studio-cover-ready-panel" : "studio-cover-correction-panel"}
            >
              {unlockGenerationConfirmation ? (
                <p
                  className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-200"
                  data-testid="studio-unlock-generation-confirmation"
                >
                  {unlockGenerationConfirmation}
                </p>
              ) : null}
              {!coverQualityPass ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-100">Cover letter needs correction before export.</p>
                  <p className="text-sm text-slate-200">
                    Regenerate or edit the draft to remove blocked language.
                  </p>
                </div>
              ) : null}
              <div className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3"> 
                {showLowQualityRecoveryLane && !showFullLowQualityCover ? ( 
                  <div className="space-y-3" data-testid="studio-low-quality-cover-preview-main"> 
                    <div className="rounded-xl border border-amber-300/25 bg-amber-500/5 p-3">
                      <p className="text-sm font-semibold text-amber-100">This draft needs another pass.</p>
                      <p className="mt-1 text-sm text-slate-200">
                        Usable only as a rough starting point. Verify evidence, then regenerate.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <FormButton
                          onClick={() => void handleRegenerateDraft()}
                          disabled={pageTruth.isGenerating || resumeGenerating || coverGenerating}
                          data-testid="studio-low-quality-regenerate-cover-main"
                        >
                          Regenerate draft
                        </FormButton>
                        <Link
                          href={fitReviewHref}
                          className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
                        >
                          Verify evidence
                        </Link>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Excerpt</p>
                      <div className="mt-2 space-y-3">
                        {coverLetterParagraphs.slice(0, 2).map((paragraph, index) => (
                          <p key={`cover-letter-excerpt-${index}`} className="text-sm leading-[1.7] text-slate-200">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                    <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <summary
                        className="cursor-pointer text-sm font-semibold text-slate-100"
                        data-testid="studio-low-quality-cover-view-full-main"
                        onClick={() => setShowFullLowQualityCover(true)}
                      >
                        View full draft anyway
                      </summary>
                    </details>
                  </div>
                ) : coverLetterParagraphs.length ? (
                  <div
                    className="mx-auto flex w-full max-w-[760px] flex-col space-y-4 rounded-2xl border border-white/10 bg-slate-950/80 p-6 shadow-inner"
                    data-testid="studio-cover-letter-preview-body"
                  >
                    {coverLetterParagraphs.map((paragraph, index) => {
                      const lines = paragraph.split(/\r?\n/);
                      const isGreeting = index === 0 && /^dear\b/i.test(lines[0] ?? "");
                      const matchesClaim = visibleImprovableClaims.some((claim) =>
                        paragraph.toLowerCase().includes(claim.text.toLowerCase()),
                      );
                      return (
                        <p
                          key={`cover-letter-paragraph-${index}`}
                          className={`m-0 text-sm leading-[1.7] tracking-normal text-slate-100 ${
                            isGreeting ? "font-semibold text-slate-50" : "text-slate-200"
                          } ${
                            matchesClaim ? "border-b border-dotted border-amber-300/70 pb-0.5" : ""
                          }`}
                          title={matchesClaim ? "Not yet verified" : undefined}
                        >
                          {lines.map((line, lineIndex) => (
                            <Fragment key={`line-${index}-${lineIndex}`}>
                              {line}
                              {lineIndex < lines.length - 1 ? <br /> : null}
                            </Fragment>
                          ))}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Preview unavailable.</p>
                )}
              </div>
            </div>
          ) : (
            coverState.error ? (
              coverGating.primaryBlocker === "readiness_block" ? (
                <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
                  <p className="text-sm font-semibold text-amber-100">Cover letter generation is blocked</p>
                  <p className="text-sm text-slate-200">
                    Add more verified experience to generate a complete cover letter.
                  </p>
                  <div className="flex justify-end">
                    <FormButton
                      variant="secondary"
                      onClick={() => focusResumeTarget({ type: "role", index: 0 })}
                      data-testid="studio-cover-blocked-improve-resume"
                    >
                      Improve your resume
                    </FormButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-rose-400/30 bg-rose-500/5 p-4">
                  <p className="text-sm font-semibold text-slate-100">
                    Cover letter generation is currently limited for this role
                  </p>
                  <p className="text-sm text-slate-200">{toConstraintMessage(coverState.error)}</p>
                  <div className="flex justify-end">
                    {canRetryGeneration ? (
                      <FormButton onClick={() => void handleCoverDraft()} disabled={coverGenerating}>
                        Retry generation
                      </FormButton>
                    ) : (
                      <Link
                        href={fitReviewHref}
                        className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
                      >
                        Strengthen my experience
                      </Link>
                    )}
                  </div>
                </div>
              )
            ) : coverState.artifactFailure ? null : (
              <EmptyState
                testId={
                  coverAutoGenerating || coverGenerateNowPending ? "studio-cover-generating" : "studio-cover-missing"
                }
                title={
                  coverAutoGenerating || coverGenerateNowPending
                    ? "Generating your cover letter..."
                    : "Cover letter not generated yet"
                }
                body={
                  coverAutoGenerating || coverGenerateNowPending
                    ? "This usually finishes in a moment."
                    : "Generate your cover letter to create a tailored introduction."
                }
              />
            )
          )
        ) : null}
      </section> 
      {isReadySuccessState && artifactQuality.confidence === "LOW" ? (
        <section
          className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4"
          data-testid="studio-low-confidence-improvement-tools"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
            Low-confidence improvements
          </p>
          <p className="mt-1 text-sm text-slate-200">
            Your materials are usable, but they will be stronger after another generation pass backed by verified
            evidence.
          </p>
          {canRetryGeneration ? (
            <div className="mt-3 flex justify-end">
              <FormButton
                variant="secondary"
                onClick={() => {
                  const sessionKey = `${effectiveBaselineId ?? "base"}:${effectiveJobId ?? "job"}:retry_both:${Date.now()}`;
                  void handleResumeDraft({ sessionKey });
                  void handleCoverDraft({ sessionKey });
                }}
                disabled={autoGenerationInFlight || resumeGenerating || coverGenerating}
              >
                Retry generation
              </FormButton>
            </div>
          ) : null}
        </section>
      ) : null}
      </> 
      ) : null} 

      {generateNowEligible ? (
        <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="studio-document-strategy-details">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Document strategy
          </summary>
          <div className="mt-3">
            <DocumentStrategyPlanSummary plan={documentStrategyPlan} />
          </div>
        </details>
      ) : null}

      {showOptionalEvidenceStrengthening ? (
        <section
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          data-testid="studio-optional-evidence-details"
        >
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-200"
            onClick={() => setShowOptionalEvidenceDetails((current) => !current)}
            data-testid="studio-optional-evidence-toggle"
          >
            <span>Optional: strengthen evidence</span>
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              {showOptionalEvidenceDetails ? "Hide" : "Show"}
            </span>
          </button>
          {showOptionalEvidenceDetails ? (
            <div className="mt-3 space-y-4" data-testid="studio-optional-evidence-content">
            <p className="text-sm text-slate-300">
              Evidence can improve tailoring, but it is not required to generate or refine documents at this score.
            </p>

            {isLowQualityDraft ? (
              <p className="text-sm text-slate-300">
                Confidence is non-blocking. Strengthen key signals and regenerate if you want tighter tailoring.
              </p>
            ) : null}

            {canonicalUnverifiedRequirements.length ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Unverified role signals
                </p>
                <ul className="mt-2 space-y-1 text-sm text-slate-200">
                  {canonicalUnverifiedRequirements.slice(0, 8).map((requirement) => (
                    <li key={`studio-optional-evidence-${requirement}`}>- {requirement}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {prioritizedStrengtheningSuggestions.length ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Highest-impact improvements
                </p>
                <ul className="mt-2 space-y-2 text-sm text-slate-200">
                  {prioritizedStrengtheningSuggestions.slice(0, 4).map((suggestion) => (
                    <li key={`studio-optional-strengthen-${suggestion.requirement}`}>
                      {suggestion.action}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Link
                href={fitReviewHref}
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Strengthen evidence (optional)
              </Link>
            </div>

            {(canonicalUnverifiedRequirements.length || artifactQuality.improvableClaims.length) ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3" data-testid="studio-optional-evidence-cards">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Evidence cards
                </p>
                <div className="mt-3 space-y-3">
                  {canonicalUnverifiedRequirements.slice(0, 8).map((requirement) => (
                    <div
                      key={`studio-evidence-card-${requirement}`}
                      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-slate-100">{requirement}</p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={buildClaimVerificationHref(requirement)}
                          className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                        >
                          Verify this
                        </Link>
                      </div>
                    </div>
                  ))}
                  {artifactQuality.improvableClaims.slice(0, 6).map((claim) => (
                    <div
                      key={`studio-improvable-card-${claim.text}`}
                      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-slate-100">{claim.text}</p>
                      <div className="flex flex-wrap gap-2">
                         <button
                           type="button"
                           onClick={() => openClaimEditModal(claim)}
                           className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
                         >
                           Edit before verifying
                         </button>
                        <Link
                          href={buildClaimVerificationHref(claim.text)}
                          className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                        >
                          Verify this
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {claimEditDraft ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
                data-testid="studio-claim-edit-modal"
              >
                <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Edit before verifying
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
                      Refine this claim so it stays anchored to real experience
                    </h2>
                    <p className="text-sm text-slate-300">Confirm the wording before sending it to the evidence flow.</p>
                  </div>
                  <label className="mt-5 block space-y-2 text-sm text-slate-300">
                    Claim text
                    <textarea
                      value={claimEditText}
                      onChange={(event) => setClaimEditText(event.target.value)}
                      className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition focus:border-sky-300/40"
                    />
                  </label>
                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelClaimEdit}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEditedClaim}
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                      Verify edited claim
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div> 
          ) : null} 
        </section>
      ) : null}
 
      <details className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"> 
        <summary className="cursor-pointer text-sm font-semibold text-slate-200"> 
          Role and evidence 
        </summary> 
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-slate-100">
              {(selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? "Unknown company")} ? {(selectedJob?.title ?? analysis?.jobTitle ?? analysis?.title ?? "Unknown role")}
            </span>
          </p>
          <p className="text-sm text-slate-300">
            Using resume <span className="font-semibold text-slate-100">{sourceResumeLabel}</span>
          </p>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Fit Score</p>
            <p className="text-3xl font-semibold text-slate-100">
              {analysisLoading ? "Loading..." : analysisScore !== null ? analysisScore.toFixed(1) : "n/a"}
            </p>
          </div>
          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/40 p-3">
            <p className="text-sm font-semibold text-slate-100">Evidence used for this resume</p>
            {evidenceSummaryBullets.length ? (
              <ul className="space-y-1 text-sm text-slate-200">
                {evidenceSummaryBullets.map((bullet) => (
                  <li key={`evidence-summary-${bullet}`}>? {bullet}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-300">
                Role analysis evidence will appear here after loading context from Results.
              </p>
            )}
            <details className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-300">
                View full baseline evidence
              </summary>
              <p className="mt-3 text-sm text-slate-300">{fullBaselineEvidence}</p>
            </details>
          </div>
        </div>
      </details>

      <details className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">
          Adjust positioning (optional)
        </summary>
        <div className="mt-3 space-y-3">
          <label className="flex flex-col gap-2 text-sm text-slate-400">
            Resume Focus
            <span className="text-sm text-slate-200">Recommended: Leadership emphasis</span>
            <select
              className="rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
              value={resumeFocus}
              onChange={(event) => setResumeFocus(event.target.value as ResumeFocusOption)}
            >
              {resumeFocusDefinitions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/40 p-3 text-sm text-slate-300">
            {resumeFocusDefinitions.map((option) => (
              <p key={`focus-def-${option.value}`}>
                <span className="font-semibold text-slate-100">{option.label}:</span> {option.definition}{" "}
                {option.value === recommendedResumeFocus ? (
                  <span className="font-semibold text-amber-200">Recommended for this role.</span>
                ) : option.value === "Technical Depth" ? (
                  <span className="font-semibold text-slate-400">Optional.</span>
                ) : null}
              </p>
            ))}
          </div>
        </div>
      </details>

      {selectedBaselineId && selectedBaselineVersionId ? (
        <details className="space-y-4">
          <summary className="cursor-pointer list-none rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold text-slate-200 shadow-sm">
            Customize content (advanced)
          </summary>
          <BaselineBlockPolicyPanel
            baselineId={selectedBaselineId}
            baselineVersionId={selectedBaselineVersionId}
            baselineVersionHash={selectedVersion?.fileHash ?? null}
            refreshSignal={versionRefreshSignal}
            onVersionAdvance={handleBlockPolicyVersionAdvance}
          onPoliciesSaved={refreshBlockPolicyList}
        />
      </details>
      ) : null}

    </PageShell>
  );

  return (
    <div data-testid="studio-root" suppressHydrationWarning>
      {mounted ? studioContent : stableSkeleton}
    </div>
  );
} 
