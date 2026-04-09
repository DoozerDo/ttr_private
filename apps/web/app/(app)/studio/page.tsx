"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

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
import { buildExportPayload } from "../lib/exportPayload";
import { formatErrorMessage, readResponsePayload } from "@/lib/compliance/parseComplianceError";
import {
  applyTargetingExclusionsToReadiness,
  aggregateVerificationIssues,
  buildVerificationIssuesFromCanonicalClaims,
  combineGenerationReadinessFromServer,
  filterClaimVerificationsByExcludedLabels,
  reconcileReadinessWithClaimVerifications,
  type GenerationReadiness,
  deriveVerificationCoverage,
  normalizeUserFacingRequirementLabel,
} from "@/lib/generationReadiness";
import { getGenerationAuthorityState, type GenerationAuthorityState } from "@/lib/generationAuthority";
import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";
import {
  buildArtifactQualityModel,
  deriveArtifactConfidenceTransition,
  type ArtifactClaimRef,
  type ArtifactQualityModel,
} from "@/lib/artifactConfidence";
import { normalizeClaimVerifications } from "@/lib/claimVerification";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
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
import { getCanonicalNextAction, getGenerationCompletionStorageKey } from "@/lib/nextAction";
import { deriveEvidenceLedger } from "@/lib/evidenceLedger";
import { useGuidedMode } from "@/hooks/useGuidedMode";
import { type JobDto } from "@/lib/jobs";
import {
  buildCoverLetterParagraphs,
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
import { BaselineBlockPolicyPanel } from "./BaselineBlockPolicyPanel";
import { readResumeModel, ResumePreview, type ResumeModel } from "./ResumePreview";
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
  const normalized = typeof code === "string" ? code.trim().toLowerCase() : "";
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
  const code = typeof record.code === "string" ? record.code.trim() : undefined;
  const message = typeof record.message === "string" ? record.message.trim() : undefined;
  const severity =
    typeof record.severity === "string" ? record.severity.trim().toLowerCase() : undefined;
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
  const normalized = payload.trim().toLowerCase();
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

function buildAssessmentAnalysisUrl(analysisId: string) {
  const normalizedAnalysisId = analysisId.trim();
  if (!normalizedAnalysisId) return "";
  return `/api/analysis/fit-assessments/${encodeURIComponent(normalizedAnalysisId)}`;
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeClaimText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractJobDescription(job: JobDto | null): string | null {
  if (!job) return null;

  if (typeof job.rawDescription === "string" && job.rawDescription.trim()) {
    return job.rawDescription.trim();
  }

  if (typeof job.description === "string" && job.description.trim()) {
    return job.description.trim();
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
        candidates.push(signal.trim());
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
        candidates.push(entry.trim());
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
    const claim = issue.claim?.trim() ?? "";
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
  const isNonProduction = process.env.NODE_ENV !== "production";
  const { isGuidedActive, currentStep: guidedStep, advanceStep, completeGuidedMode } = useGuidedMode();
  const searchParams = useSearchParams();
  const searchParamValue = searchParams.toString();
  const trackedStudioOpenRef = useRef(false);
  const lastReadinessKeyRef = useRef<string | null>(null);
  const failedReadinessKeysRef = useRef<Set<string>>(new Set());
  const generationSectionRef = useRef<HTMLElement | null>(null);
  const requestedJobId = useMemo(
    () => searchParams.get("jobId")?.trim() ?? "",
    [searchParamValue],
  );
  const requestedBaselineId = useMemo(
    () => searchParams.get("baselineId")?.trim() ?? "",
    [searchParamValue],
  );
  const requestedBaselineVersionId = useMemo(
    () => searchParams.get("baselineVersionId")?.trim() ?? "",
    [searchParamValue],
  );
  const requestedAnalysisId = useMemo(
    () =>
      searchParams.get("analysisId")?.trim() ??
      searchParams.get("assessmentId")?.trim() ??
      "",
    [searchParamValue],
  );
  const isFromUnlock = useMemo(() => searchParams.get("fromUnlock") === "true", [searchParamValue]);
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
            .map((claim) => claim.trim())
            .filter((claim) => claim.length > 0),
        ),
      );
    },
    [searchParamValue],
  );
  useEffect(() => {
    if (trackedStudioOpenRef.current) {
      return;
    }
    trackedStudioOpenRef.current = true;

    const explicitEntry = (searchParams.get("entrySource") ?? "").trim().toLowerCase();
    const allowed = new Set(["results", "nav", "direct", "unknown"]);
    const baselineIdFromQuery = searchParams.get("baselineId")?.trim() || undefined;

    let entrySource: "results" | "nav" | "direct" | "unknown" = "unknown";
    if (allowed.has(explicitEntry)) {
      entrySource = explicitEntry as "results" | "nav" | "direct" | "unknown";
    } else if (!document.referrer) {
      entrySource = "direct";
    } else {
      try {
        const referrerUrl = new URL(document.referrer);
        if (referrerUrl.origin === window.location.origin && referrerUrl.pathname === "/results") {
          entrySource = "results";
        }
      } catch {
        entrySource = "unknown";
      }
    }

    trackEvent("resume_studio_opened", {
      entrySource,
      baselineId: baselineIdFromQuery,
    });
  }, [searchParams]);

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
  const [coverWarningFlags, setCoverWarningFlags] = useState<ComplianceFlag[]>([]);
  const [, setCoverAuditId] = useState<string | undefined>();
  const [coverLetterComplianceBlocked, setCoverLetterComplianceBlocked] =
    useState<CoverLetterComplianceBlocked | null>(null);
  const [refinementInstructions, setRefinementInstructions] = useState<RefinementPreset[]>([]);
  const [refinementApplying, setRefinementApplying] = useState(false);
  const [refinementStatusMessage, setRefinementStatusMessage] = useState<string | null>(null);
  const [pendingRefinementAction, setPendingRefinementAction] = useState<{
    action: "apply" | "undo" | "reset";
    instruction?: RefinementPreset | null;
    targets: RefinementTarget[];
    summary: string;
  } | null>(null);
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
  const finalRoleCheckTrackedRef = useRef<string | null>(null);
  const finalRoleAdjustmentClickedRef = useRef<string | null>(null);
  const autoGenerationSignatureRef = useRef<string | null>(null);
  const [applicationInsights, setApplicationInsights] = useState<ApplicationInsight[]>([]);
  const [opportunityContext, setOpportunityContext] = useState<{
    status: string;
    updatedAt: string;
  } | null>(null);

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
    setCoverState(createDocumentState());
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
    const activeBaselineId = selectedBaselineId || trimString(analysis?.baselineId);
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
            setOpportunityContext({ status: first.status, updatedAt: first.updatedAt });
          }
        }
      } catch {
        // non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedAnalysisId]);

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
    const value = analysis?.scoring_v2?.score;
    if (typeof value === "number") return value;
    return null;
  }, [analysis]);

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
  const effectiveJobId = selectedJobId || trimString(analysis?.jobId);
  const effectiveBaselineId = selectedBaselineId || trimString(analysis?.baselineId);
  const effectiveBaselineVersionId =
    selectedBaselineVersionId || trimString(analysis?.baselineVersionId);
  const hasLoadedAnalysis = Boolean(
    requestedAnalysisId && !analysisLoading && !analysisError && analysisScore !== null,
  );
  const lowFitRedirectedRef = useRef(false);
  useEffect(() => {
    if (analysisScore === null) return;
    if (analysisScore >= 70) {
      lowFitRedirectedRef.current = false;
      return;
    }
    if (lowFitRedirectedRef.current) return;
    lowFitRedirectedRef.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.set("locked", "1");
    void router.replace(`/results?${params.toString()}`);
  }, [analysisScore, router, searchParams]);
  useEffect(() => {
    if (!requestedAnalysisId || !effectiveJobId || !effectiveBaselineId || !effectiveBaselineVersionId) {
      setGenerationReadiness(READINESS_LOADING_STATE);
      return;
    }
    const readinessKey = [
      requestedAnalysisId,
      effectiveJobId,
      effectiveBaselineId,
      effectiveBaselineVersionId,
    ].join(":");
    if (lastReadinessKeyRef.current === readinessKey) {
      return;
    }
    lastReadinessKeyRef.current = readinessKey;
    if (failedReadinessKeysRef.current.has(readinessKey)) {
      return;
    }

    const body = {
      analysisId: requestedAnalysisId,
      jobId: effectiveJobId,
      baselineId: effectiveBaselineId,
      baselineVersionId: effectiveBaselineVersionId,
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
      typeof analysisScore === "number" &&
      analysisScore >= 70 &&
      canonicalUnverifiedRequirements.length > 0,
    [analysisScore, canonicalUnverifiedRequirements.length],
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
  const studioGenerationState: GenerationAuthorityState = useMemo(
    () =>
      typeof analysisScore === "number" && analysisScore >= 80
        ? "READY"
        : getGenerationAuthorityState(activeGenerationReadiness),
    [activeGenerationReadiness, analysisScore],
  );
  const generationBlockerCodes = useMemo(
    () => activeGenerationReadiness.verificationIssues.map((issue) => issue.code),
    [activeGenerationReadiness.verificationIssues],
  );
  const generationBlockerCount = generationBlockerCodes.length;

  const productReadiness = useMemo(
    () =>
      buildGenerationProductReadiness({
        score: analysisScore,
        authorityState: studioGenerationState,
        hasCanonicalAssessment: Boolean(requestedAnalysisId) && !analysisError,
        hasRequiredContext:
          Boolean(effectiveJobId && effectiveBaselineId) &&
          (Boolean(effectiveBaselineVersionId) || isNonProduction),
        isPro,
        hasCompletedGeneration: false,
      }),
    [
      analysisError,
      analysisScore,
      effectiveBaselineId,
      effectiveBaselineVersionId,
      effectiveJobId,
      isNonProduction,
      isPro,
      requestedAnalysisId,
      studioGenerationState,
    ],
  );
  const canGenerateDocuments = productReadiness.state === "ALLOWED" && trustGateDecision.allowed;
  const studioDraftMode = productReadiness.generationMode === "draft" && isFromUnlock && !hasGeneratedOnce;
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!analysis || !requestedAnalysisId) return;

    const backendCoverage = analysis.verification_coverage as
      | {
          totalClaims?: number | null;
          verifiedClaims?: number | null;
          inferredClaims?: number | null;
          unverifiedClaims?: number | null;
          supportedClaims?: number | null;
        }
      | null;
    const requirementTotal =
      Number(backendCoverage?.totalClaims ?? NaN) ||
      activeClaimVerifications.length ||
      activeGenerationReadiness.verificationIssues.length;
    const matchedPreFilter =
      Number(backendCoverage?.verifiedClaims ?? NaN) + Number(backendCoverage?.inferredClaims ?? NaN) ||
      claimVerifications.filter((claim) => claim.status !== "UNVERIFIED").length;
    const matchedPostFilter = activeClaimVerifications.filter((claim) => claim.status !== "UNVERIFIED").length;
    const unmatched =
      Number(backendCoverage?.unverifiedClaims ?? NaN) ||
      Math.max(requirementTotal - matchedPostFilter, 0);
    const studioGenerationGateDebug = {
      analysisId: requestedAnalysisId,
      jobId: effectiveJobId || null,
      baselineId: effectiveBaselineId || null,
      score: analysisScore,
      scoreBreakdown: (analysis as { score_breakdown?: unknown }).score_breakdown ?? null,
      requirements: {
        total: Number.isFinite(requirementTotal) ? requirementTotal : null,
        matchedPreFilter: Number.isFinite(matchedPreFilter) ? matchedPreFilter : null,
        matchedPostFilter: Number.isFinite(matchedPostFilter) ? matchedPostFilter : null,
        unmatched: Number.isFinite(unmatched) ? unmatched : null,
      },
      coverage: {
        verificationPassed: canGenerateDocuments,
        coveragePercent: backendCoverage
          ? {
              verifiedClaims: backendCoverage.verifiedClaims ?? null,
              inferredClaims: backendCoverage.inferredClaims ?? null,
              unverifiedClaims: backendCoverage.unverifiedClaims ?? null,
              supportedClaims: backendCoverage.supportedClaims ?? null,
              totalClaims: backendCoverage.totalClaims ?? null,
            }
          : null,
        threshold: 70,
        failureReasons: activeGenerationReadiness.reasons.map((reason) => reason.code),
      },
      filters: {
        complianceFlags: activeGenerationReadiness.verificationIssues.map((issue) => issue.code),
        evidenceDrops: excludedTargetingLabels.size ? Array.from(excludedTargetingLabels) : [],
        fragmentDrops: canonicalCoverageIssues.map((issue) => issue.claim ?? issue.explanation),
        otherExclusions: lastRemovedTargetingLabels,
      },
      studioGate: {
        allowed: canGenerateDocuments,
        mode: studioGenerationState.toLowerCase(),
        reason:
          !canGenerateDocuments
              ? productReadiness.generation_readiness.reasonsBlocked.join(", ")
              : null,
      },
      routing: {
        targetDecision: document.referrer?.includes("/results") ? "sent_to_studio" : "direct_or_unknown",
        expectedDecisionByProductRule: analysisScore !== null && analysisScore >= 80 ? "studio" : "fit_review",
      },
    };
    (window as typeof window & { studioGenerationGateDebug?: unknown }).studioGenerationGateDebug =
      studioGenerationGateDebug;
    console.info("studioGenerationGateDebug", studioGenerationGateDebug);
  }, [
    activeClaimVerifications.length,
    activeGenerationReadiness.reasons,
    activeGenerationReadiness.verificationIssues,
    analysis,
    analysisScore,
    canGenerateDocuments,
    canonicalCoverageIssues,
    excludedTargetingLabels,
    effectiveBaselineId,
    effectiveJobId,
    lastRemovedTargetingLabels,
    requestedAnalysisId,
    studioGenerationState,
  ]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!effectiveBaselineId || !requestedAnalysisId) return;
    console.info("[studio] assessment_truth_snapshot", {
      baselineId: effectiveBaselineId,
      assessmentId: requestedAnalysisId,
      readiness: {
        status: activeGenerationReadiness.status,
        authority: studioGenerationState,
        generation_readiness: productReadiness.generation_readiness,
      },
    });
  }, [
    activeGenerationReadiness.status,
    effectiveBaselineId,
    productReadiness.generation_readiness,
    requestedAnalysisId,
    studioGenerationState,
  ]);
  const improveBaselineHref = useMemo(() => {
    const params = new URLSearchParams();
    if (requestedAnalysisId) params.set("analysisId", requestedAnalysisId);
    if (effectiveJobId) params.set("jobId", effectiveJobId);
    if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
    if (effectiveBaselineVersionId) params.set("baselineVersionId", effectiveBaselineVersionId);
    const query = params.toString();
    return query ? `/baseline?${query}` : "/baseline";
  }, [requestedAnalysisId, effectiveJobId, effectiveBaselineId, effectiveBaselineVersionId]);
  const resumePresenter = useMemo(
    () => presentResumeGeneration(resumeState.response),
    [resumeState.response],
  );
  const generatedResumeModel = useMemo(
    () => readResumeModel(resumeState.response),
    [resumeState.response],
  );
  const effectiveResumeModel = isResumeEditMode
    ? draftResumeModel
    : savedEditedResumeModel ?? generatedResumeModel;
  const hasSavedResumeEdits = Boolean(savedEditedResumeModel);
  const hasUnsavedResumeEdits =
    isResumeEditMode &&
    JSON.stringify(draftResumeModel ?? null) !==
      JSON.stringify((savedEditedResumeModel ?? generatedResumeModel) ?? null);
  const hasResumeArtifact = resumePresenter.hasExportableContent;
  const canExportDocuments = productReadiness.generation_readiness.canExport;
  const canExportResume =
    canExportDocuments &&
    resumePresenter.status === "success" &&
    hasResumeArtifact;
  const showResumeDownloadActions =
    resumePresenter.status === "blocked" ||
    (resumePresenter.status === "success" && hasResumeArtifact);
  const isResumeDownloadLocked = !isPro;
  const resumePreviewText = useMemo(() => formatPreview(resumeState.response), [resumeState.response]);
  const coverLetterParagraphs = useMemo(
    () => buildCoverLetterParagraphs(coverState.response),
    [coverState.response],
  );
  const coverPresenter = useMemo(
    () => presentCoverLetterGeneration(coverState.response),
    [coverState.response],
  );
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
  const hasCoverLetterArtifact = coverPresenter.hasExportableContent;
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
  const hasCompletedGeneration = hasResumeArtifact || hasCoverLetterArtifact;
  const hasGeneratedDocumentPair =
    resumePresenter.status === "success" &&
    coverPresenter.status === "success" &&
    Boolean(resumeState.response && coverState.response);
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
    const isGenerating = resumeGenerating || coverGenerating || autoGenerationInFlight;
    const artifactType =
      coverGenerating || (coverPresenter.status === "success" && Boolean(coverState.response))
        ? "cover_letter"
        : resumeGenerating || (resumePresenter.status === "success" && Boolean(resumeState.response))
          ? "resume"
          : null;
    const shouldShowTrustSummary =
      canGenerateDocuments &&
      ((resumePresenter.status === "success" && Boolean(resumeState.response)) ||
        (coverPresenter.status === "success" && Boolean(coverState.response)));
    return {
      isBlocked: !canGenerateDocuments,
      isReady: canGenerateDocuments,
      isFromUnlock,
      isFirstGenerationAfterUnlock,
      isGenerating,
      hasGenerated: hasCompletedGeneration,
      artifactType,
      shouldShowTrustSummary,
      shouldShowUnlockEntry: isFromUnlock,
      shouldShowEnhancedLoadingCopy: isFromUnlock && isGenerating && !hasGeneratedOnce,
    };
  }, [
    canGenerateDocuments,
    coverGenerating,
    autoGenerationInFlight,
    coverPresenter.status,
    coverState.response,
    hasCompletedGeneration,
    hasGeneratedOnce,
    isFirstGenerationAfterUnlock,
    isFromUnlock,
    resumeGenerating,
    resumePresenter.status,
    resumeState.response,
  ]);
  const resumeTrustSummaryVisible =
    studioGenerationRenderState.shouldShowTrustSummary &&
    resumePresenter.status === "success" &&
    Boolean(resumeState.response);
  const coverTrustSummaryVisible =
    studioGenerationRenderState.shouldShowTrustSummary &&
    coverPresenter.status === "success" &&
    Boolean(coverState.response);
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
  const resolveGapsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (effectiveJobId) params.set("jobId", effectiveJobId);
    if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
    const query = params.toString();
    return query ? `/resolve-gaps?${query}` : "/resolve-gaps";
  }, [effectiveBaselineId, effectiveJobId]);
  const resultsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (effectiveJobId) params.set("jobId", effectiveJobId);
    if (requestedAnalysisId) params.set("analysisId", requestedAnalysisId);
    if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
    const query = params.toString();
    return query ? `/results?${query}` : "/results";
  }, [effectiveBaselineId, effectiveJobId, requestedAnalysisId]);
  const remediationHref = `${resultsHref}#advanced-insights`;
  const primaryNextAction = useMemo(
    () =>
      getCanonicalNextAction({
        fitScore: analysisScore,
        generationReady: canGenerateDocuments,
        trustGateAllowed: canGenerateDocuments,
      }),
    [
      analysisScore,
      canGenerateDocuments,
      studioGenerationState,
    ],
  );
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!analysis || !requestedAnalysisId) return;
    const canonicalGenerationRouteDebug = {
      analysisId: requestedAnalysisId,
      jobId: effectiveJobId || null,
      baselineId: effectiveBaselineId || null,
      score: analysisScore,
      artifactType: studioGenerationRenderState.artifactType,
      isGenerating: studioGenerationRenderState.isGenerating,
      isFirstGenerationAfterUnlock: studioGenerationRenderState.isFirstGenerationAfterUnlock,
      readinessStatus: canGenerateDocuments ? "ready" : activeGenerationReadiness.status,
      trustGateAllowed: canGenerateDocuments,
      finalAction: primaryNextAction.type,
      reason: primaryNextAction.reason,
    };
    (window as typeof window & { canonicalGenerationRouteDebug?: unknown }).canonicalGenerationRouteDebug =
      canonicalGenerationRouteDebug;
    console.info("canonicalGenerationRouteDebug", canonicalGenerationRouteDebug);
  }, [
    activeGenerationReadiness.status,
    analysis,
    analysisScore,
    effectiveBaselineId,
    effectiveJobId,
    primaryNextAction.reason,
    primaryNextAction.type,
    studioGenerationRenderState.artifactType,
    studioGenerationRenderState.isFirstGenerationAfterUnlock,
    studioGenerationRenderState.isGenerating,
    requestedAnalysisId,
    canGenerateDocuments,
  ]);
  const studioBlockedByNextAction = primaryNextAction.type === "fit_review";
  const studioUiState = canGenerateDocuments ? "READY" : "BLOCKED";
  useEffect(() => {
    if (studioBlockedByNextAction && requestedAnalysisId) {
      void router.replace(remediationHref);
    }
  }, [requestedAnalysisId, remediationHref, router, studioBlockedByNextAction]);
  const evidenceLedger = useMemo(
    () =>
      deriveEvidenceLedger(analysis, {
        generationAllowed: primaryNextAction.type !== "fit_review",
      }),
    [analysis, primaryNextAction.type],
  );
  useEffect(() => {
    if (!isGuidedActive) return;
    if (primaryNextAction.type !== "fit_review") {
      advanceStep("GENERATE");
    }
  }, [advanceStep, isGuidedActive, primaryNextAction.type]);
  const canExportCover =
    canExportDocuments &&
    coverPresenter.status === "success" &&
    hasCoverLetterArtifact &&
    !coverLetterComplianceBlocked;
  const showCoverDownloadActions =
    Boolean(coverLetterComplianceBlocked) ||
    coverPresenter.status === "blocked" ||
    (coverPresenter.status === "success" && hasCoverLetterArtifact);
  const fullBaselineEvidence = useMemo(() => {
    if (typeof analysis?.summary === "string" && analysis.summary.trim().length) {
      return analysis.summary.trim();
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
    if (!effectiveBaselineVersionId) {
      return "Resume snapshot is still loading for this analysis.";
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
  const generationSupportState = useMemo(() => {
    if (!canGenerateDocuments || productReadiness.state === "BLOCKED") return "blocked";
    if (productReadiness.confidence === "MEDIUM") return "partial";
    return "strong";
  }, [canGenerateDocuments, productReadiness.confidence, productReadiness.state]);
  const canProceedWithStudioDrafts = canGenerateDocuments;
  const autoGenerationSignature = useMemo(() => {
    if (!canGenerateDocuments) return null;
    if (typeof analysisScore !== "number" || analysisScore < 80) return null;
    if (
      !requestedAnalysisId ||
      !effectiveJobId ||
      !effectiveBaselineId ||
      !effectiveBaselineVersionId
    ) {
      return null;
    }
    return [
      requestedAnalysisId,
      effectiveJobId,
      effectiveBaselineId,
      effectiveBaselineVersionId,
      Math.round(analysisScore),
    ].join("|");
  }, [
    analysisScore,
    canGenerateDocuments,
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    requestedAnalysisId,
  ]);
  const authorityStateTitle =
    generationSupportState === "blocked"
      ? "Generation blocked"
      : generationSupportState === "partial"
        ? "Generation is usable."
        : "Ready to generate";
  const authorityStateExplanation =
    generationSupportState === "blocked"
          ? "This role is not ready for clean Studio output yet. Return to Fit Review to strengthen verified evidence."
      : generationSupportState === "partial"
        ? "Generated from partially verified evidence. Verify key claims to strengthen it."
        : "Generated from verified evidence. Your role analysis and verified baseline evidence support strong tailored output.";
  const authorityReasons = useMemo(() => {
    const reasons: string[] = [];
    activeGenerationReadiness.verificationIssues.forEach((issue) => {
      if (issue.explanation && !reasons.includes(issue.explanation)) {
        reasons.push(issue.explanation);
      }
    });
    activeGenerationReadiness.reasons.forEach((reason) => {
      if (reason.message && !reasons.includes(reason.message)) {
        reasons.push(reason.message);
      }
    });
    return reasons.slice(0, 3);
  }, [activeGenerationReadiness.reasons, activeGenerationReadiness.verificationIssues]);
  const completionCopy = useMemo(() => {
    if (generationSupportState === "partial") {
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
    if (generationSupportState === "blocked") {
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
  }, [generationSupportState]);
  const prioritizedStrengtheningSuggestions = useMemo(() => {
    if (generationSupportState === "strong" && recentIntent !== "refine_intent" && recentIntent !== "used_not_committed") {
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
  }, [generationSupportState, recentIntent]);
  const guardGenerationAction = useCallback(
    (documentType: "resume" | "cover_letter" | "application") => {
      if (studioUiState === "BLOCKED") {
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
    [analysisScore, generationBlockerCodes, router, studioUiState],
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
      return "generated_successfully";
    }
    return canGenerateDocuments ? "ready_to_generate" : "not_generated_yet";
  }, [
    canGenerateDocuments,
    activeGenerationReadiness.blocked,
    hasResumeArtifact,
    resumeGenerating,
    resumePresenter.status,
    resumeState.error,
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
      return "generated_successfully";
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
  }, [
    effectiveBaselineId,
    effectiveBaselineVersionId,
    effectiveJobId,
    excludedTargetingLabels,
    requestedAnalysisId,
    router,
  ]);
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
      stage: "studio",
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
            stage: "studio",
            analysisId: requestedAnalysisId,
            status: response.status,
          });
          return;
        }
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
          setAnalysis(null);
          setAnalysisError(ANALYSIS_LOAD_ERROR_MESSAGE);
          console.warn("[studio] hydration_failed", {
            stage: "studio",
            analysisId: requestedAnalysisId,
            status: "invalid_payload",
          });
          return;
        }
        const nextAnalysis = payload as LatestAnalysis;
        const nextAnalysisId = trimString((payload as { assessmentId?: unknown }).assessmentId);
        const nextBaselineId = trimString((payload as { baselineId?: unknown }).baselineId);
        if (!nextAnalysisId || !nextBaselineId) {
          setAnalysis(null);
          setAnalysisError(ANALYSIS_LOAD_ERROR_MESSAGE);
          console.warn("[studio] hydration_failed", {
            stage: "studio",
            analysisId: requestedAnalysisId,
            status: "missing_required_context",
          });
          return;
        }
        setAnalysis(nextAnalysis);
        setAnalysisError(null);
        console.info("[studio] hydration_succeeded", {
          stage: "studio",
          analysisId: requestedAnalysisId,
          jobId: nextAnalysis?.jobId ?? null,
          baselineId: nextAnalysis?.baselineId ?? null,
          baselineVersionId: nextAnalysis?.baselineVersionId ?? null,
        });
        const analysisJobId = trimString((payload as { jobId?: unknown }).jobId);
        const analysisBaselineId = trimString((payload as { baselineId?: unknown }).baselineId);
        const analysisBaselineVersionId = trimString(
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
          stage: "studio",
          analysisId: requestedAnalysisId,
          status: "exception",
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

  useEffect(() => {
    if (!hydratedFromResultsContext || !generationSectionRef.current) return;
    generationSectionRef.current.scrollIntoView?.({ block: "start" });
  }, [hydratedFromResultsContext]);

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

  const handleResumeDraft = async () => {
    if (!guardGenerationAction("resume")) return;
    setUnlockGenerationConfirmation(null);
    if ((hasSavedResumeEdits || hasUnsavedResumeEdits) && resumeState.response) {
      const proceed =
        typeof window !== "undefined"
          ? window.confirm("Regenerating will replace your saved edits for this version.")
          : true;
      if (!proceed) return;
      setSavedEditedResumeModel(null);
      setDraftResumeModel(generatedResumeModel);
      setIsResumeEditMode(false);
      setResumeEditError(null);
    }
    if (!canProceedWithStudioDrafts) {
      setResumeState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a resume.",
      }));
      return;
    }
    setResumeGenerating(true);
    const shouldShowUnlockConfirmation = isFirstGenerationAfterUnlock;
    trackEvent("resume_generation_attempted", {
      source: "studio",
      analysisId: requestedAnalysisId || undefined,
    });
    console.info("[studio] generation_requested", {
      documentType: "resume",
      analysisId: requestedAnalysisId || null,
      jobId: effectiveJobId || null,
      baselineId: effectiveBaselineId || null,
      baselineVersionId: effectiveBaselineVersionId || null,
    });
    setResumeState(createDocumentState());
    setResumeWarningFlags([]);
    setResumeAuditId(undefined);
    const payload = normalizeGenerationPayload(buildResumePayload(false), "resume");
    try {
      const response = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        console.warn("[studio] generation_failed", {
          documentType: "resume",
          status: response.status,
        });
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setResumeState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
        if (response.status === 422) {
          const failure = readArtifactFailurePresentation(responsePayload);
          if (failure) {
            setResumeState((current) => ({
              ...current,
              artifactFailure: failure,
              response: null,
              error: null,
            }));
            return;
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
            return;
          }
        }
        throw new Error(formatErrorMessage(responsePayload, "Resume generation failed."));
      }
      const presenter = presentResumeGeneration(responsePayload);
      const failure = presenter.failure;
      if (failure) {
        setResumeState((current) => ({
          ...current,
          artifactFailure: failure,
          response: null,
          error: null,
        }));
        return;
      }
      if (presenter.status === "blocked" && presenter.display) {
        trackEvent("resume_generation_blocked_compliance", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "blocked",
        });
        setResumeState((current) => ({ ...current, response: responsePayload }));
        setResumeWarningFlags([]);
        setResumeAuditId(undefined);
        return;
      }
      if (presenter.status === "error") {
        trackEvent("resume_generation_limited", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "error",
        });
        setResumeState((current) => ({
          ...current,
          response: responsePayload,
          error:
            presenter.display?.description ??
            "Resume generation failed. Please review your baseline and try again.",
        }));
        setResumeWarningFlags([]);
        setResumeAuditId(undefined);
        return;
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
              ...normalizeGenerationPayload(buildResumePayload(false), "resume"),
              trustGateMode: "strict",
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

      if (!validatedResult.success) {
        trackEvent("resume_generation_limited", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "validation_failed",
        });
        setResumeState((current) => ({
          ...current,
          error: GENERATION_TRUST_FALLBACK_ERROR,
        }));
        return;
      }

      setResumeState((current) => ({
        ...current,
        response: validatedResult.output,
        artifactFailure: null,
        error: null,
      }));
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
        documentType: "resume",
      });
    } catch (error) {
      trackEvent("resume_generation_limited", {
        source: "studio",
        analysisId: requestedAnalysisId || undefined,
        reasonCode: "exception",
      });
      const message = error instanceof Error ? error.message : "Resume generation failed.";
      setResumeState((current) => ({
        ...current,
        error: message,
        artifactFailure: {
          headline: "Generation didn?t complete",
          explanation: message,
          nextStep: "Review the input and try again with stronger baseline evidence.",
          retryable: false,
          category: "generation_failed",
          code: "generation_failed",
        },
      }));
    } finally {
      setResumeGenerating(false);
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
      setCoverWarningFlags(extractComplianceWarnings(responsePayload));
      setCoverAuditId(normalizeAuditId(responsePayload));
      setCoverLetterComplianceBlocked(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cover letter unavailable.";
      setCoverState((current) => ({ ...current, error: message }));
    }
  }

  const handleCoverDraft = async () => {
    if (!guardGenerationAction("cover_letter")) return;
    setUnlockGenerationConfirmation(null);
    if (!canProceedWithStudioDrafts) {
      setCoverState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a cover letter.",
      }));
      return;
    }
    setCoverGenerating(true);
    const shouldShowUnlockConfirmation = isFirstGenerationAfterUnlock;
    trackEvent("cover_letter_generation_attempted", {
      source: "studio",
      analysisId: requestedAnalysisId || undefined,
    });
    console.info("[studio] generation_requested", {
      documentType: "cover_letter",
      analysisId: requestedAnalysisId || null,
      jobId: effectiveJobId || null,
      baselineId: effectiveBaselineId || null,
      baselineVersionId: effectiveBaselineVersionId || null,
    });
    setCoverState(createDocumentState());
    setCoverWarningFlags([]);
    setCoverAuditId(undefined);
    setCoverLetterComplianceBlocked(null);
    const payload = normalizeGenerationPayload(buildCoverLetterPayload(false), "cover_letter");
    try {
      const response = await fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        console.warn("[studio] generation_failed", {
          documentType: "cover_letter",
          status: response.status,
        });
        if (response.status === 409) {
          const existingId = readDuplicateCoverLetterId(responsePayload);
          if (existingId) {
            await loadCoverLetterById(existingId);
            return;
          }
        }
        if (response.status === 422) {
          const failure = readArtifactFailurePresentation(responsePayload);
          if (failure) {
            setCoverState((current) => ({
              ...current,
              artifactFailure: failure,
              response: null,
              error: null,
            }));
            return;
          }
          const blockedState = parseComplianceBlockedFromPayload(responsePayload);
          if (blockedState) {
            trackEvent("cover_letter_generation_blocked_compliance", {
              source: "studio",
              analysisId: requestedAnalysisId || undefined,
              reasonCode: "compliance_blocked",
            });
            applyCoverLetterComplianceBlocked(blockedState);
            return;
          }
        }
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setCoverState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
        throw new Error(formatErrorMessage(responsePayload, "Cover letter generation failed."));
      }
      const initialPresenter = presentCoverLetterGeneration(responsePayload);
      const failure = initialPresenter.failure;
      if (failure) {
        setCoverState((current) => ({
          ...current,
          artifactFailure: failure,
          response: null,
          error: null,
        }));
        return;
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
        return;
      }
      if (initialPresenter.status !== "success") {
        throw new Error("Cover letter generation did not return a usable document.");
      }
      const validatedResult = await generateWithRetry({
        generate: async (strictMode) => {
          if (!strictMode) return responsePayload;
          const retryResponse = await fetch("/api/cover-letters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...normalizeGenerationPayload(buildCoverLetterPayload(false), "cover_letter"),
              trustGateMode: "strict",
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

      if (!validatedResult.success) {
        trackEvent("cover_letter_generation_limited", {
          source: "studio",
          analysisId: requestedAnalysisId || undefined,
          reasonCode: "validation_failed",
        });
        setCoverState((current) => ({
          ...current,
          error: GENERATION_TRUST_FALLBACK_ERROR,
        }));
        return;
      }

      setCoverState((current) => ({
        ...current,
        response: validatedResult.output,
        artifactFailure: null,
        error: null,
      }));
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
        documentType: "cover_letter",
      });
    } catch (error) {
      trackEvent("cover_letter_generation_limited", {
        source: "studio",
        analysisId: requestedAnalysisId || undefined,
        reasonCode: "exception",
      });
      console.error("Cover letter generation failed", error);
      const message = error instanceof Error ? error.message : "Cover letter generation failed.";
      setCoverState((current) => ({
        ...current,
        error: message,
        artifactFailure: {
          headline: "Generation didn?t complete",
          explanation: message,
          nextStep: "Review the input and try again with stronger baseline evidence.",
          retryable: false,
          category: "generation_failed",
          code: "generation_failed",
        },
      }));
  } finally {
      setCoverGenerating(false);
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
      const params = new URLSearchParams();
      if (effectiveJobId) params.set("jobId", effectiveJobId);
      if (effectiveBaselineId) params.set("baselineId", effectiveBaselineId);
      if (effectiveBaselineVersionId) params.set("baselineVersionId", effectiveBaselineVersionId);
      if (requestedAnalysisId) {
        params.set("analysisId", requestedAnalysisId);
        params.set("assessmentId", requestedAnalysisId);
      }
      params.set("highlightClaim", claimText);
      return `/fit-review?${params.toString()}`;
    },
    [effectiveBaselineId, effectiveBaselineVersionId, effectiveJobId, requestedAnalysisId],
  );

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
  }, [coverState.response, handleCoverDraft, resumeState.response, verifiedClaimParams]);

  useEffect(() => {
    if (!autoGenerationSignature) return;
    if (autoGenerationSignatureRef.current === autoGenerationSignature) return;
    if (resumeGenerating || coverGenerating || autoGenerationInFlight) return;
    if (!canProceedWithStudioDrafts) return;

    autoGenerationSignatureRef.current = autoGenerationSignature;
    setAutoGenerationInFlight(true);

    const runAutoGeneration = async () => {
      try {
        await Promise.all([handleResumeDraft(), handleCoverDraft()]);
      } finally {
        setAutoGenerationInFlight(false);
      }
    };

    void runAutoGeneration();
  }, [
    autoGenerationInFlight,
    autoGenerationSignature,
    canProceedWithStudioDrafts,
    coverGenerating,
    handleCoverDraft,
    handleResumeDraft,
    resumeGenerating,
  ]);

  const activeArtifactFailure = resumeState.artifactFailure ?? coverState.artifactFailure ?? null;
  const studioNextMove = useMemo(
    () =>
      resolveStudioNextMove({
        analysisScore,
        canGenerateDocuments,
        studioGenerationState,
        primaryNextAction: primaryNextAction.type,
        artifactFailure: activeArtifactFailure,
        actions: {
          generateResume: () => {
            void handleResumeDraft();
          },
          generateCoverLetter: () => {
            void handleCoverDraft();
          },
          reviewTopGaps: () => {
            void router.push(resolveGapsHref);
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
      activeArtifactFailure,
      analysisScore,
      canGenerateDocuments,
      coverState.artifactFailure,
      handleCoverDraft,
      handleResumeDraft,
      improveBaselineHref,
      resolveGapsHref,
      resultsHref,
      router,
      primaryNextAction.type,
      studioGenerationState,
    ],
  );

  const handleResumeBasicDraft = async () => {
    if (!guardGenerationAction("resume")) return;
    if (!canProceedWithStudioDrafts) {
      setResumeState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a resume.",
      }));
      return;
    }
    setResumeGenerating(true);
    setResumeState(createDocumentState());
    setResumeWarningFlags([]);
    setResumeAuditId(undefined);
    const payload = normalizeGenerationPayload(buildResumePayload(true), "resume");
    try {
      const response = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatErrorMessage(responsePayload, "Resume generation failed."));
      }
      setResumeState((current) => ({ ...current, response: responsePayload }));
      setResumeWarningFlags(extractComplianceWarnings(responsePayload));
      setResumeAuditId(normalizeAuditId(responsePayload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resume generation failed.";
      setResumeState((current) => ({ ...current, error: message }));
    } finally {
      setResumeGenerating(false);
    }
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

  function renderCardStatus(status: StudioCardStatus, documentName: string) {
    switch (status) {
      case "not_generated_yet":
        return `${documentName} not generated yet`;
      case "ready_to_generate":
        return `Ready to generate ${documentName.toLowerCase()}`;
      case "generating":
        return `Generating ${documentName.toLowerCase()}`;
      case "generated_successfully":
        return `${documentName} generated successfully`;
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

  const unlockEntryPanel = studioGenerationRenderState.shouldShowUnlockEntry ? (
    <RouteStateShell
      testId="studio-unlock-entry-panel"
      tone="success"
      eyebrow="Unlock"
      title="READY TO GENERATE"
      body={
        <p className="text-sm text-slate-100">
          Your verified evidence supports this role. Your materials are now grounded and ready.
        </p>
      }
      cta={
        <div className="flex flex-wrap gap-3">
          <FormButton
            onClick={() => void handleResumeDraft()}
            disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || resumeGenerating}
          >
            {resumeGenerating
              ? studioGenerationRenderState.shouldShowEnhancedLoadingCopy
                ? "GENERATING VERIFIED DRAFT..."
                : "Generating..."
              : "GENERATE RESUME"}
          </FormButton>
          <FormButton
            variant="secondary"
            onClick={() => void handleCoverDraft()}
            disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || coverGenerating}
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

  return (
    <PageShell className="space-y-4 pb-4">
      {unlockEntryPanel}
      {unlockGenerationLoadingMessage && studioGenerationRenderState.isGenerating ? (
        <Alert intent="info" title="Verified evidence in use">
          {unlockGenerationLoadingMessage}
        </Alert>
      ) : null}
      {autoGenerationLoadingMessage ? (
        <Alert intent="info" title="Generating your documents...">
          {autoGenerationLoadingMessage}
        </Alert>
      ) : null}
      {!studioGenerationRenderState.isGenerating &&
      !hasCompletedGeneration &&
      (resumeState.error || coverState.error || resumeState.artifactFailure || coverState.artifactFailure) ? (
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
      {isGuidedActive && guidedStep === "GENERATE" && !studioBlockedByNextAction ? (
        <GuidedOverlay
          headline="Now this role is ready for tailored output."
          body="Generate your resume now, then save the opportunity."
          ctaLabel="Generate Resume"
          onCtaClick={() => {
            void handleResumeDraft();
          }}
        />
      ) : null}
      <section className="space-y-5 rounded-[28px] bg-slate-900/45 p-6 md:p-8" data-testid="studio-generation-readiness">
        {confidenceUpgradeMessage ? (
          <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
            {confidenceUpgradeMessage}
          </div>
        ) : null}
        {studioDraftMode ? (
          <div
            className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50"
            data-testid="studio-results-ready-banner"
          >
            {generationSupportState === "partial"
              ? "Generated from partially verified evidence. Add verified examples to strengthen it."
              : "Generated from verified evidence."}
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {generationSupportState === "strong"
              ? "Ready"
              : generationSupportState === "partial"
                ? "Draft"
                : "Blocked"}
          </p>
          <p className="text-sm text-slate-300">
            {typeof analysisScore === "number" ? `Fit score ${Math.round(analysisScore)} ? ` : "Fit score unavailable ? "}
            {(selectedJob?.company ?? analysis?.company ?? analysis?.companyName ?? "Unknown company")} -{" "}
            {(selectedJob?.title ?? analysis?.jobTitle ?? analysis?.title ?? "Unknown role")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 md:text-[34px]">
            {authorityStateTitle}
          </h1>
          <p className="text-base leading-7 text-slate-200">{authorityStateExplanation}</p>
          <p className="text-sm font-medium text-slate-200">{primaryNextAction.label}</p>
          <p className="text-sm text-slate-400">
            {generationSupportState === "strong"
              ? "Generated from verified evidence."
              : generationSupportState === "partial"
                ? "Generated from partially verified evidence. Verify key claims to strengthen it."
                : "Based on your analyzed role context and verified baseline evidence."}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4" data-testid="studio-decision-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Decision + Action</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
            {generationSupportState === "strong"
              ? "Strong output: you can use this now with confidence."
              : generationSupportState === "partial"
              ? "Draft output: usable now, stronger with refinement."
              : "Limited output: not ready yet."}
          </h2>
          <p className="mt-2 text-sm text-slate-200">
            {generationSupportState === "strong"
              ? "Built directly from your verified experience and aligned to the role."
              : generationSupportState === "partial"
                ? "Built from partially verified evidence and aligned to key role requirements."
                : "Built from your verified experience, but a few signals still need strengthening."}
          </p>
          {generationSupportState !== "strong" ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-slate-100">
                {generationSupportState === "partial" ? "Why this is still worth using" : "What's holding this back"}
              </p>
              <ul className="space-y-1 text-sm text-slate-300">
                {(canonicalUnverifiedRequirements.length
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
              <p className="text-sm font-semibold text-slate-100">
                {generationSupportState === "partial" ? "If you want to sharpen it" : "Fastest way to improve"}
              </p>
              <ul className="space-y-1 text-sm text-slate-300">
                {generationSupportState === "partial" ? (
                  <>
                    <li>This draft is grounded in baseline evidence and can be strengthened later.</li>
                    <li>Run Fit Review later if you want stronger positioning.</li>
                  </>
                ) : (
                  <>
                    <li>Run Fit Review to strengthen missing areas.</li>
                    <li>Add measurable outcomes to your baseline experience.</li>
                  </>
                )}
              </ul>
            </div>
          ) : null}
        </div>
        <StudioArtifactQualityPanel
          model={artifactQuality}
          confidence={artifactQuality.confidence}
          onVerifyClaim={verifyClaim}
          onEditClaim={openClaimEditModal}
          onDismissClaim={dismissClaim}
        />
        {hasCompletedGeneration ? (
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
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {generationSupportState === "partial" ? (
            <>
              <FormButton
                onClick={handleResumeDraft}
                disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || resumeGenerating}
                className="bg-indigo-600 text-white hover:bg-indigo-500"
              >
                {resumeGenerating ? "Generating..." : "Generate Resume"}
              </FormButton>
              <FormButton
                variant="secondary"
                onClick={handleCoverDraft}
                disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || coverGenerating}
              >
                {coverGenerating ? "Generating..." : "Generate Cover Letter"}
              </FormButton>
              <Link
                href={resolveGapsHref}
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
              >
                Improve baseline
              </Link>
            </>
          ) : primaryNextAction.type === "fit_review" ? (
            <Link
              href={resolveGapsHref}
              className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Start Fit Review
            </Link>
          ) : primaryNextAction.type === "studio" ? (
            <Link
              href={resultsHref}
              className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Review Results
            </Link>
          ) : primaryNextAction.type === "studio_with_save" ? (
            <Link
              href="/job-tracker"
              className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Add to Opportunities
            </Link>
          ) : studioUiState === "BLOCKED" ? (
            <Link
              href={remediationHref}
              className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Resolve gaps before generating
            </Link>
          ) : (
            <>
              <FormButton
                onClick={handleResumeDraft}
                disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || resumeGenerating}
                className="bg-indigo-600 text-white hover:bg-indigo-500"
              >
                {resumeGenerating
                  ? "Generating..."
                  : "Generate Resume"}
              </FormButton>
              <FormButton
                variant="secondary"
                onClick={handleCoverDraft}
                disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || coverGenerating}
              >
                {coverGenerating
                  ? "Generating..."
                  : "Generate Cover Letter"}
              </FormButton>
            </>
          )}
        </div>
      </section>
      {generationSupportState === "partial" || canGenerateDocuments ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="studio-evidence-allowed-panel">
          <h2 className="text-base font-semibold text-slate-100">
            {generationSupportState === "strong"
              ? "Why this output is grounded"
              : "Why this output is limited"}
          </h2>
          <p className="mt-1 text-sm text-slate-200">
            {generationSupportState === "strong"
              ? "This output is grounded in your verified experience."
              : "This output is grounded in verified experience, but some areas still need stronger support."}
          </p>
          {evidenceLedger.entries.length ? (
            <ul className="mt-3 space-y-2">
              {evidenceLedger.entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-white/10 bg-slate-950/35 p-2">
                  <p className="text-sm text-slate-100">{entry.text}</p>
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
      ) : studioGenerationState === "BLOCKED" && !studioDraftMode ? (
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
      {prioritizedStrengtheningSuggestions.length > 0 &&
      (generationSupportState !== "strong" ||
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

      <StudioNextMove move={studioNextMove} />
      <DocumentStrategyPlanSummary plan={documentStrategyPlan} />

      {!studioGenerationRenderState.isBlocked && !studioBlockedByNextAction ? (
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
        className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Resume</h2>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {renderCardStatus(resumeCardStatus, "Resume")}
            </p>
          </div>
        </div>
        {showResumeDownloadActions ? (
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
        {showResumeDownloadActions ? (
          <p className="text-xs text-slate-400">Download: DOCX | PDF</p>
        ) : null}

        {resumeState.tierGateError ? (
          <Alert intent="warning">
            {resumeState.tierGateError.message ?? "Resume export is limited by your subscription tier."}
          </Alert>
        ) : null}
        {resumeWarningFlags.length ? null : null}
        {resumeNeedsBaselineDetail ? (
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
                disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || resumeGenerating}
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

        {resumePresenter.status === "success" && resumeState.response ? (
          <div
            className="space-y-3 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4"
            data-testid="resume-completion-panel"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
              Completed
            </p>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-50">{completionCopy.title}</p>
              <p className="text-sm text-slate-200">{completionCopy.body}</p>
              <p className="text-sm font-medium text-slate-100">{completionCopy.nextStep}</p>
            </div>
            <p className="text-xs text-slate-300">The export matches the draft reviewed in Studio.</p>
          </div>
        ) : null}

        {resumePresenter.status === "success" && resumeState.response ? (
          <section
            className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4"
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
              <Link
                href={resolveGapsHref}
                onClick={() => {
                  recordArtifactRefineIntent();
                  setRecentIntent(readRecentIntentState());
                  trackEvent("artifact_refine_intent", {
                    source: "studio",
                    analysisId: requestedAnalysisId || undefined,
                    reason: generationSupportState,
                  });
                }}
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
              >
                Refine baseline later
              </Link>
            </div>
          </section>
        ) : null}

        {resumeState.artifactFailure ? (
          <ArtifactFailureState
            failure={resumeState.artifactFailure}
            onRetry={() => void handleResumeDraft()}
            retryLabel="Retry resume generation"
          />
        ) : resumePresenter.display && resumePresenter.status !== "blocked" ? (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-sm font-semibold text-slate-100">{resumePresenter.display.title}</p>
            <p className="text-sm text-slate-300">{resumePresenter.display.description}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next step</p>
            <p className="text-sm text-slate-200">
              {resumePresenter.display.reasons[0] ?? "Review flagged items in Results and adjust baseline evidence."}
            </p>
          </div>
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
          <p className="text-sm text-slate-300">Downloads are available.</p>
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
        ) : resumePresenter.status === "success" && resumeState.response ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            {unlockGenerationConfirmation ? (
              <p
                className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-200"
                data-testid="studio-unlock-generation-confirmation"
              >
                {unlockGenerationConfirmation}
              </p>
            ) : null}
            {resumeTrustSummaryVisible ? (
              <VerifiedGenerationTrustSummary testId="studio-resume-trust-summary" />
            ) : null}
            {resumeWarningFlags.length ? (
              <p className="text-xs text-amber-200">
                Verification signals detected. Personalization may be limited. See
                Results for details.
              </p>
            ) : null}
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <ResumePreview
                payload={resumeState.response}
                model={effectiveResumeModel}
                fallbackText={resumePreviewText}
                claimHighlights={visibleImprovableClaims}
                isEditing={isResumeEditMode}
                hasUnsavedChanges={hasUnsavedResumeEdits}
                onEnterEditMode={handleEnterResumeEditMode}
                onSaveEdits={handleSaveResumeEdits}
                onCancelEdits={handleCancelResumeEdits}
                onSummaryChange={handleResumeSummaryChange}
                onBulletChange={handleResumeBulletChange}
              />
            </div>
            {trackerEntryId ? (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200">
                  Track this application
                </p>
                <p className="text-sm text-slate-100">
                  Save this role and update status after applying.
                </p>
                <div className="mt-3 flex justify-end">
                  <FormButton onClick={handleOpenTracker}>
                    Track Application
                  </FormButton>
                </div>
              </div>
            ) : null}

          </div>
        ) : (
          <EmptyState
            title="Resume not generated yet"
            body="Generate your resume to preview and refine your application."
          />
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Cover letter</h2>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {renderCardStatus(coverCardStatus, "Cover letter")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FormButton
              variant="secondary"
              onClick={handleCoverDraft}
              disabled={(!canGenerateDocuments && !canProceedWithStudioDrafts) || coverGenerating}
              data-testid="studio-cover-generate-button"
            >
              {coverGenerating
                ? "Generating..."
                : "Generate Cover Letter"}
            </FormButton>
            {showCoverDownloadActions ? (
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
        {showCoverDownloadActions ? (
          <p className="text-xs text-slate-400">Download: DOCX | PDF</p>
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
              <FormButton onClick={handleCoverDraft} disabled={coverGenerating}>
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

        {coverState.tierGateError ? (
          <Alert intent="warning">
            {coverState.tierGateError.message ??
              "Cover letter export is limited by your subscription tier."}
          </Alert>
        ) : null}
        {coverWarningFlags.length ? null : null}
        {coverState.error && !coverLetterComplianceBlocked ? null : null}

        {!coverLetterComplianceBlocked && coverPresenter.status === "success" && coverState.response ? (
          <div
            className="space-y-3 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4"
            data-testid="cover-completion-panel"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
              Completed
            </p>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-50">{completionCopy.title}</p>
              <p className="text-sm text-slate-200">{completionCopy.body}</p>
              <p className="text-sm font-medium text-slate-100">{completionCopy.nextStep}</p>
            </div>
            <p className="text-xs text-slate-300">The export matches the draft reviewed in Studio.</p>
          </div>
        ) : null}

        {!coverLetterComplianceBlocked && coverPresenter.status === "success" && coverState.response ? (
          <section
            className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4"
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
              <Link
                href={resolveGapsHref}
                onClick={() => {
                  recordArtifactRefineIntent();
                  setRecentIntent(readRecentIntentState());
                  trackEvent("artifact_refine_intent", {
                    source: "studio",
                    analysisId: requestedAnalysisId || undefined,
                    reason: generationSupportState,
                  });
                }}
                className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
              >
                Refine baseline later
              </Link>
            </div>
          </section>
        ) : null}

        {coverState.artifactFailure ? (
          <ArtifactFailureState
            failure={coverState.artifactFailure}
            onRetry={() => void handleCoverDraft()}
            retryLabel="Retry cover letter generation"
          />
        ) : coverPresenter.display && !coverLetterComplianceBlocked && coverPresenter.status !== "blocked" ? (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-sm font-semibold text-slate-100">{coverPresenter.display.title}</p>
            <p className="text-sm text-slate-300">{coverPresenter.display.description}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next step</p>
            <p className="text-sm text-slate-200">
              {coverPresenter.display.reasons[0] ?? "Review the generated draft and download DOCX or PDF."}
            </p>
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
            <p className="text-sm text-slate-200">
              {coverPresenter.display?.reasons?.[0] ??
                "Review flagged items in Results and adjust baseline evidence."}
            </p>
          </div>
        ) : null}

        {!isPro ? (
          <p className="text-sm text-slate-300">Upgrade to Pro to download documents.</p>
        ) : canExportCover ? (
          <p className="text-sm text-slate-300">Downloads are available.</p>
        ) : null}

        {!coverLetterComplianceBlocked ? (
          coverPresenter.status === "success" && coverState.response ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              {unlockGenerationConfirmation ? (
                <p
                  className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-200"
                  data-testid="studio-unlock-generation-confirmation"
                >
                  {unlockGenerationConfirmation}
                </p>
              ) : null}
              {coverTrustSummaryVisible ? (
                <VerifiedGenerationTrustSummary testId="studio-cover-trust-summary" />
              ) : null}
              <div className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3">
                {coverLetterParagraphs.length ? (
                  <div className="mx-auto flex w-full max-w-[760px] flex-col space-y-4 rounded-2xl border border-white/10 bg-slate-950/80 p-6 shadow-inner">
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
              <div className="space-y-3 rounded-2xl border border-rose-400/30 bg-rose-500/5 p-4">
                <p className="text-sm font-semibold text-slate-100">
                  Cover letter generation is currently limited for this role
                </p>
                <p className="text-sm text-slate-200">{toConstraintMessage(coverState.error)}</p>
                <div className="flex justify-end">
                  <FormButton onClick={handleCoverDraft} disabled={coverGenerating}>
                    Retry generation
                  </FormButton>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Cover letter not generated yet"
                body="Generate your cover letter to create a tailored introduction."
              />
            )
          )
        ) : null}
      </section>
      </>
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

      {claimEditDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Edit before verifying
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
                Refine this claim so it stays anchored to real experience
              </h2>
              <p className="text-sm text-slate-300">
                Confirm the wording before sending it to the evidence flow.
              </p>
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
    </PageShell>
  );
}







