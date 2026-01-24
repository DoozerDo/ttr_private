"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import {
  ComplianceFlagPanel,
  ComplianceViolationPanel,
} from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TextInput } from "@/components/TextInput";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
import { useAutoGenerateThreshold } from "../lib/settings";
import { getVerdictDisplayOrDefault } from "@/lib/fit-verdict";
import {
  buildReasonSummary,
  mapComplianceFlags,
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

type LatestAnalysis = {
  baselineId: string;
  baselineVersion?: number | null;
  baselineVersionId?: string | null;
  baselineVersionHash?: string | null;
  jobId: string;
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
  createdAt?: string | null;
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
  hasResume: boolean;
  autoGenerateThreshold: number;
};

type DocumentType = "resume" | "cover-letter";

type DocumentState = {
  response: unknown;
  error: ApiError | null;
  tierGateError: TierGateError | null;
  complianceError: ParsedComplianceError | null;
};

type DocumentConfig = {
  label: string;
  pluralLabel: string;
  capitalizedLabel: string;
  generatePath: string;
  exportPath: string;
  previewTitle: string;
  copyButtonLabel: string;
};

const createDocumentState = (): DocumentState => ({
  response: null,
  error: null,
  tierGateError: null,
  complianceError: null,
});

const DOCUMENT_CONFIG: Record<DocumentType, DocumentConfig> = {
  resume: {
    label: "resume",
    pluralLabel: "resumes",
    capitalizedLabel: "Resume",
    generatePath: "/api/resume",
    exportPath: "/api/resume/export",
    previewTitle: "Resume draft preview",
    copyButtonLabel: "Copy resume text",
  },
  "cover-letter": {
    label: "cover letter",
    pluralLabel: "cover letters",
    capitalizedLabel: "Cover letter",
    generatePath: "/api/cover-letters",
    exportPath: "/api/cover-letters/export",
    previewTitle: "Cover letter draft preview",
    copyButtonLabel: "Copy cover letter text",
  },
};

type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: string;
  auditId?: string;
};

type DocumentExportResult = {
  success: boolean;
  auditId?: string | null;
  error?: ApiError | null;
};

const createClientError = (message: string, code = "validation_error"): ApiError => ({
  status: 400,
  code,
  message,
});

const buildApiError = (response: Response, data: unknown, fallback: string): ApiError => {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const errorNode = (payload.error as Record<string, unknown>) ?? payload;
  const code =
    (errorNode?.code as string | undefined) ||
    (payload.code as string | undefined) ||
    (response.status === 401 ? "unauthorized" : "unknown_error");
  const message =
    (errorNode?.message as string | undefined) ||
    (payload.message as string | undefined) ||
    formatErrorMessage(data, fallback);
  const details =
    (errorNode?.details as string | undefined) ||
    (payload.details as string | undefined) ||
    undefined;
  const auditId =
    (payload.audit_id as string | undefined) ||
    (payload.auditId as string | undefined) ||
    (errorNode?.audit_id as string | undefined) ||
    (errorNode?.auditId as string | undefined);

  return {
    status: response.status,
    code,
    message,
    details,
    auditId,
  };
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
      industryContext: typeof scores.industry_context === "number" ? scores.industry_context : undefined,
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
  hasResume,
  autoGenerateThreshold,
}: NextStepArgs): NextStep[] => {
  const verdictInfo = getVerdictDisplayOrDefault(verdict);
  const needsMoreInsight = score === null || score === undefined || score < autoGenerateThreshold;
  const steps: NextStep[] = [];

  steps.push({
    title: "Open Fit Review",
    description: hasAnalysis
      ? `Explore why this role received a ${verdictInfo.label.toLowerCase()} verdict and what to focus on next.`
      : "Generate or load the latest analysis to surface Fit Review and tailored guidance.",
  });

  steps.push({
    title: "Practice with Interview Toolkit",
    description: "Pair Fit Review insights with the Interview Toolkit to tackle the most impactful gaps.",
  });

  if (needsMoreInsight) {
    steps.push({
      title: "Re-run the analysis",
      description:
        "Address the gaps Fit Review outlines, rerun the analysis, and confirm your baseline still reflects the role.",
    });
  }

  steps.push({
    title: "Generate a resume",
    description: needsMoreInsight
      ? `Once your fit score hits ${autoGenerateThreshold} or higher, export a resume tailored to this opportunity.`
      : hasResume
        ? "Download or share the resume you already generated."
        : "One tap export is available. Generate and share with confidence.",
  });

  return steps;
};

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
  const [isGeneratingBoth, setIsGeneratingBoth] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [exportState, setExportState] = useState<
    { docType: DocumentType; format: "docx" | "pdf" } | null
  >(null);
  const [isExportingBoth, setIsExportingBoth] = useState(false);
  const [exportBothError, setExportBothError] = useState<ApiError | null>(null);
  const [exportBothSuccessAuditIds, setExportBothSuccessAuditIds] = useState<
    { resume?: string | null; coverLetter?: string | null } | null
  >(null);
  const [complianceError, setComplianceError] = useState<ParsedComplianceError | null>(null);
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"manual" | "latest">("manual");
  const [documents, setDocuments] = useState<Record<DocumentType, DocumentState>>({
    resume: createDocumentState(),
    "cover-letter": createDocumentState(),
  });
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [lastLoadedRunIdentifier, setLastLoadedRunIdentifier] = useState<string | null>(null);
  const [autoGenerateThreshold] = useAutoGenerateThreshold();
  const [calibrationProfile, setCalibrationProfile] = useState<CalibrationProfile>("balanced");
  const [calibrationResult, setCalibrationResult] = useState<CalibratedResult | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [useCalibratedScore, setUseCalibratedScore] = useState(false);

  // Prevent SSR hydration mismatches for locale and timezone dependent formatting.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const updateDocumentState = (type: DocumentType, updates: Partial<DocumentState>) => {
    setDocuments((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...updates,
      },
    }));
  };

  const clearDocumentErrors = useCallback(() => {
    setDocuments((prev) => ({
      resume: {
        ...prev.resume,
        error: null,
        tierGateError: null,
        complianceError: null,
      },
      "cover-letter": {
        ...prev["cover-letter"],
        error: null,
        tierGateError: null,
        complianceError: null,
      },
    }));
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const documentType: DocumentType =
    searchParams?.get("documentType") === "cover-letter" ? "cover-letter" : "resume";
  const documentConfig = DOCUMENT_CONFIG[documentType];
  const currentDocumentState = documents[documentType];
  const runIdentifier = useMemo(() => {
    const candidate =
      searchParams?.get("assessmentId") ??
      searchParams?.get("analysisId") ??
      searchParams?.get("fitScoreId");
    return candidate?.trim() ?? null;
  }, [searchParams]);

  const hasClipboardAPI =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

  const copyTextToClipboard = async (text: string) => {
    if (!hasClipboardAPI || !text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const documentResponse = (currentDocumentState.response as AnyObject | null) ?? null;

  const rawFlags = Array.isArray(documentResponse?.compliance_flags)
    ? (documentResponse?.compliance_flags as unknown[])
    : [];

  const documentWarningFlags = rawFlags.filter((flag) => {
    const severity = ((flag as AnyObject | null)?.severity as string | null | undefined) ?? "warn";
    return severity.toLowerCase() !== "block";
  });

  const documentAuditId = (documentResponse?.audit_id as string | undefined) || undefined;

  const documentBaselineHash =
    (documentResponse?.baseline_version_hash as string | undefined) ||
    (documentResponse?.baselineVersionHash as string | undefined) ||
    undefined;

  const currentErrorDetails = {
    status: currentDocumentState.error?.status ?? null,
    code: currentDocumentState.error?.code ?? null,
    message: currentDocumentState.error?.message ?? null,
    details: currentDocumentState.error?.details ?? null,
    auditId: currentDocumentState.error?.auditId ?? null,
  };

  const setManualBaselineId = (value: string) => {
    setBaselineId(value);
    setAnalysisSource("manual");
    clearDocumentErrors();
  };

  const setManualJobId = (value: string) => {
    setJobId(value);
    setAnalysisSource("manual");
    clearDocumentErrors();
  };

  const getDocumentPayload = () => {
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? "";
    return { jobId: jobIdValue, baselineVersionId: baselineVersionIdValue };
  };

  const latestScore: number | null = useMemo(() => {
    if (!latest) return null;
    const v = latest.overallScore ?? (typeof latest.score === "number" ? latest.score : latest.score ?? null);
    return typeof v === "number" ? v : null;
  }, [latest]);

  const activeAnalysis = useMemo(() => {
    if (useCalibratedScore && calibrationResult) return calibrationResult;
    return latest;
  }, [useCalibratedScore, calibrationResult, latest]);

  const activeScore = useMemo(() => {
    if (!activeAnalysis) return null;
    const value =
      activeAnalysis.overallScore ??
      (typeof activeAnalysis.score === "number" ? activeAnalysis.score : activeAnalysis.score ?? null);
    return typeof value === "number" ? value : null;
  }, [activeAnalysis]);

  const activeVerdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(activeAnalysis?.verdict ?? null),
    [activeAnalysis?.verdict],
  );

  const currentVerdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(latest?.verdict ?? null),
    [latest?.verdict],
  );

  const verdictToneClass = useMemo(() => {
    switch (activeVerdictInfo.label) {
      case "Apply":
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
      case "Consider":
        return "border-amber-300/40 bg-amber-500/10 text-amber-200";
      case "Skip":
        return "border-rose-400/40 bg-rose-500/10 text-rose-200";
      default:
        return "border-slate-500/30 bg-slate-800/40 text-slate-200";
    }
  }, [activeVerdictInfo.label]);

  const jobDescriptor = useMemo(() => {
    if (latest?.jobTitle) {
      return latest.company ? `${latest.jobTitle} at ${latest.company}` : latest.jobTitle;
    }
    return latest?.jobId ? "Job details loaded" : "No job selected";
  }, [latest?.company, latest?.jobId, latest?.jobTitle]);

  const baselineDescriptor = useMemo(() => {
    if (latest?.baselineId) return "Baseline selected";
    if (baselineId) return "Baseline context provided";
    return "No baseline selected";
  }, [baselineId, latest?.baselineId]);

  const fitReviewPath = useMemo(() => {
    const candidateJobId = (latest?.jobId || jobId || "").trim();
    if (!candidateJobId) return "/fit-review";
    return `/fit-review?jobId=${encodeURIComponent(candidateJobId)}`;
  }, [jobId, latest?.jobId]);

  const readyForDocument = useMemo(() => {
    return analysisSource === "latest" && !!latest?.jobId && !!latest?.baselineVersionId;
  }, [analysisSource, latest?.baselineVersionId, latest?.jobId]);

  const oneTapEligible = useMemo(() => {
    if (activeScore === null) return false;
    return activeScore >= autoGenerateThreshold;
  }, [activeScore, autoGenerateThreshold]);

  const qualityBadge = useMemo(() => {
    if (activeScore === null) return null;
    const optimized = activeScore >= autoGenerateThreshold;
    return {
      label: optimized ? "Ready" : "Draft",
      toneClass: optimized
        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
        : "border-amber-300/40 bg-amber-500/10 text-amber-200",
    };
  }, [activeScore, autoGenerateThreshold]);

  const nextSteps = useMemo(
    () =>
      getNextSteps({
        score: activeScore,
        verdict: activeAnalysis?.verdict ?? null,
        hasAnalysis: !!latest,
        hasResume: !!documents.resume.response,
        autoGenerateThreshold,
      }),
    [activeAnalysis?.verdict, activeScore, autoGenerateThreshold, documents.resume.response, latest],
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

  const dimensionEntries = useMemo(() => {
    const scores = normalizeDimensionScores(latest);
    const keys = Object.keys(DIMENSION_LABELS) as Array<keyof FitDimensionScores>;
    return keys.map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      value: typeof scores[key] === "number" ? scores[key] : null,
    }));
  }, [latest]);

  const reasonSummary = useMemo(
    () => buildReasonSummary(latest?.strengths ?? [], latest?.gaps ?? []),
    [latest?.gaps, latest?.strengths],
  );

  const complianceFlagList = useMemo(
    () => sortComplianceFlagsBySeverity(mapComplianceFlags(latest?.complianceFlags ?? undefined)),
    [latest?.complianceFlags],
  );

  const topComplianceFlags = complianceFlagList.slice(0, 3);
  const hiddenComplianceFlags = complianceFlagList.slice(3);
  const hasMoreComplianceFlags = complianceFlagList.length > 3;

  const latestAuditId = latest?.auditId ?? latest?.audit_id ?? null;
  const baselineVersionIdentifier =
    latest?.baselineVersionId ??
    latest?.baselineVersionHash ??
    (typeof latest?.baselineVersion === "number" ? `${latest.baselineVersion}` : null);

  const metadataEntries = useMemo(() => {
    const createdAtValue = latest?.createdAt;

    const isoLooksValid =
      createdAtValue && !Number.isNaN(new Date(createdAtValue).getTime());

    // Deterministic on first render (server + initial client render): do not call toLocaleString yet.
    const createdAtLabel = isoLooksValid
      ? hasMounted
        ? new Date(createdAtValue as string).toLocaleString()
        : (createdAtValue as string)
      : "Not available";

    return [
      { label: "Assessment ID", value: latest?.assessmentId ?? "Not available" },
      { label: "Job", value: jobDescriptor ?? "Not available" },
      { label: "Job ID", value: latest?.jobId ?? jobId ?? "Not available" },
      { label: "Baseline ID", value: latest?.baselineId ?? baselineId ?? "Not available" },
      { label: "Baseline version", value: baselineVersionIdentifier ?? "Not available" },
      { label: "Audit ID", value: latestAuditId ?? "Not available" },
      { label: "Run recorded", value: createdAtLabel },
    ];
  }, [
    baselineId,
    baselineVersionIdentifier,
    hasMounted,
    jobDescriptor,
    jobId,
    latest?.assessmentId,
    latest?.baselineId,
    latest?.createdAt,
    latest?.jobId,
    latestAuditId,
  ]);

  const exportBothSuccessDetails = exportBothSuccessAuditIds
    ? {
        message: "Resume and cover letter exported.",
        resumeAuditId: exportBothSuccessAuditIds.resume ?? null,
        coverLetterAuditId: exportBothSuccessAuditIds.coverLetter ?? null,
      }
    : null;

  const exportBothErrorDetails = exportBothError
    ? {
        status: exportBothError.status ?? null,
        code: exportBothError.code ?? null,
        message: exportBothError.message ?? null,
        details: exportBothError.details ?? null,
        auditId: exportBothError.auditId ?? null,
      }
    : null;

  const exportBothErrorJson = JSON.stringify(exportBothErrorDetails ?? {}, null, 2);
  const exportBothSuccessJson = JSON.stringify(exportBothSuccessDetails ?? {}, null, 2);

  const debugMode = debugUiEnabled;

  const latestStatusMessage = useMemo(() => {
    if (loadingLatest) return "Loading latest analysis...";
    if (!jobId) return "Enter a job ID to load the latest analysis.";
    if (!baselineId) return "Select a baseline to load the latest analysis.";
    if (analysisSource === "latest" && latest) return "Latest analysis loaded.";
    return "Load latest analysis to populate the score and unlock one tap export.";
  }, [analysisSource, jobId, baselineId, latest, loadingLatest]);

  const documentPreviewText = useMemo(() => {
    if (!currentDocumentState.response) return "";
    const direct = extractBestResumeText(currentDocumentState.response);
    if (direct) return direct;
    return safeJsonPreview(currentDocumentState.response);
  }, [currentDocumentState.response]);

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
      setTierGateError(null);
      clearDocumentErrors();

      try {
        const res = await fetch(
          `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`,
          { cache: "no-store" },
        );

        const payload = await readResponsePayload(res.clone());

        if (!res.ok) {
          const tierGate = parseTierGateError({ status: res.status, payload });
          if (tierGate) {
            setTierGateError(tierGate);
            return;
          }

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
        setRestoredAt(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load analysis");
      } finally {
        setLoadingLatest(false);
      }
    },
    [loadingLatest, clearDocumentErrors],
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
    setTierGateError(null);
    clearDocumentErrors();

    try {
      const res = await fetch(
        `/api/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(baselineId)}/latest`,
        { cache: "no-store" },
      );

      const payload = await readResponsePayload(res.clone());

      if (!res.ok) {
        const tierGate = parseTierGateError({ status: res.status, payload });
        if (tierGate) {
          setTierGateError(tierGate);
          return;
        }

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
    } catch (e: any) {
      setError(e?.message || "Failed to load analysis");
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
    setCalibrationResult(null);
    setUseCalibratedScore(false);
    setCalibrationError(null);
  }, [latest?.assessmentId]);

  const handleCalibrate = useCallback(async () => {
    if (!latest?.assessmentId) return;

    setCalibrating(true);
    setCalibrationError(null);

    try {
      const res = await fetch(
        `/api/analysis/fit-assessments/${encodeURIComponent(latest.assessmentId)}/calibrate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: calibrationProfile }),
        },
      );

      const payload = await readResponsePayload(res.clone());

      if (!res.ok) {
        const message = formatErrorMessage(payload, "Unable to calibrate the latest analysis.");
        setCalibrationError(message);
        setCalibrationResult(null);
        return;
      }

      const data = await res.json();
      setCalibrationResult(data as CalibratedResult);
    } catch (e: any) {
      setCalibrationError(e?.message ?? "Calibration failed.");
      setCalibrationResult(null);
    } finally {
      setCalibrating(false);
    }
  }, [calibrationProfile, latest?.assessmentId]);

  async function generateDocument(oneTap = false, targetDocType: DocumentType = documentType) {
    const targetDocumentConfig = DOCUMENT_CONFIG[targetDocType];
    const { jobId: resumeJobId, baselineVersionId: resumeBaselineVersionId } = getDocumentPayload();

    if (analysisSource !== "latest" || !resumeJobId || !resumeBaselineVersionId) {
      updateDocumentState(targetDocType, {
        error: createClientError(
          `Load the latest analysis before generating a ${targetDocumentConfig.label}.`,
          "document_not_ready",
        ),
      });
      return;
    }

    setLoading(true);
    updateDocumentState(targetDocType, {
      error: null,
      tierGateError: null,
      complianceError: null,
      response: null,
    });

    const downloadName = targetDocumentConfig.label.replace(" ", "-");

    try {
      const res = await fetch(targetDocumentConfig.generatePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineId,
          baselineVersionId: resumeBaselineVersionId,
          jobId: resumeJobId,
          oneTap,
        }),
      });

      if (!res.ok) {
        const payload = await readResponsePayload(res);
        const tierGate = parseTierGateError({ status: res.status, payload });

        if (tierGate) {
          updateDocumentState(targetDocType, { tierGateError: tierGate });
          return;
        }

        const compliance = parseComplianceError({ status: res.status, payload });
        if (compliance) {
          updateDocumentState(targetDocType, { complianceError: compliance });
          return;
        }

        const apiError = buildApiError(res, payload, `${targetDocumentConfig.capitalizedLabel} generation failed`);
        updateDocumentState(targetDocType, { error: apiError });
        return;
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = await res.json();
        updateDocumentState(targetDocType, { response: json });
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      updateDocumentState(targetDocType, {
        error: createClientError(
          e?.message ?? `${targetDocumentConfig.capitalizedLabel} generation failed`,
          "document_error",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateBothDocuments() {
    if (!readyForDocument || isGeneratingBoth) return;
    setIsGeneratingBoth(true);
    try {
      await generateDocument(false, "resume");
      await generateDocument(false, "cover-letter");
    } finally {
      setIsGeneratingBoth(false);
    }
  }

  async function exportDocument(
    format: "docx" | "pdf",
    targetDocType: DocumentType = documentType,
  ): Promise<DocumentExportResult> {
    const targetDocumentConfig = DOCUMENT_CONFIG[targetDocType];
    const { jobId: resumeJobId, baselineVersionId: resumeBaselineVersionId } = getDocumentPayload();

    if (analysisSource !== "latest" || !resumeJobId || !resumeBaselineVersionId) {
      const clientError = createClientError(
        `Load the latest analysis before exporting a ${targetDocumentConfig.label}.`,
        "document_not_ready",
      );
      updateDocumentState(targetDocType, { error: clientError });
      return { success: false, error: clientError };
    }

    setExportState({ docType: targetDocType, format });
    updateDocumentState(targetDocType, { error: null, tierGateError: null, complianceError: null });

    const downloadName = targetDocumentConfig.label.replace(" ", "-");

    try {
      const res = await fetch(`${targetDocumentConfig.exportPath}?format=${encodeURIComponent(format)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineId,
          baselineVersionId: resumeBaselineVersionId,
          jobId: resumeJobId,
          oneTap: true,
        }),
      });

      if (!res.ok) {
        const payload = await readResponsePayload(res);
        const tierGate = parseTierGateError({ status: res.status, payload });

        if (tierGate) {
          updateDocumentState(targetDocType, { tierGateError: tierGate });
          return { success: false };
        }

        const compliance = parseComplianceError({ status: res.status, payload });
        if (compliance) {
          updateDocumentState(targetDocType, { complianceError: compliance });
          return { success: false };
        }

        const apiError = buildApiError(res, payload, `${targetDocumentConfig.capitalizedLabel} export failed`);
        updateDocumentState(targetDocType, { error: apiError });
        return { success: false, error: apiError };
      }

      const auditId = res.headers.get("X-Compliance-Audit-Id") ?? null;
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${downloadName}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      return { success: true, auditId };
    } catch (e: any) {
      const clientError = createClientError(
        e?.message ?? `${targetDocumentConfig.capitalizedLabel} export failed`,
        "document_error",
      );
      updateDocumentState(targetDocType, { error: clientError });
      return { success: false, error: clientError };
    } finally {
      setExportState(null);
    }
  }

  async function exportBothDocuments() {
    if (isExportingBoth) return;
    setExportBothError(null);
    setExportBothSuccessAuditIds(null);
    setIsExportingBoth(true);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const resumeResult = await exportDocument("docx", "resume");
    if (!resumeResult.success) {
      setExportBothError(resumeResult.error ?? null);
      setIsExportingBoth(false);
      return;
    }

    const coverResult = await exportDocument("docx", "cover-letter");
    if (!coverResult.success) {
      setExportBothError(coverResult.error ?? null);
      setIsExportingBoth(false);
      return;
    }

    setExportBothSuccessAuditIds({
      resume: resumeResult.auditId ?? null,
      coverLetter: coverResult.auditId ?? null,
    });
    setIsExportingBoth(false);
  }

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
          description="Generate resumes and cover letters, review the latest analysis, and export artifacts for any job."
        />

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          {!latest ? (
            <EmptyState
              title="No analysis yet"
              body="Load the latest analysis to reveal the fit score and verdict."
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
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Active fit score
                  </p>
                  <p className="text-5xl font-semibold text-white">
                    {activeScore !== null ? activeScore.toFixed(1) : "Not available"}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <span
                    className={`rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] ${verdictToneClass}`}
                  >
                    {activeVerdictInfo.label}
                  </span>
                  <p className="max-w-2xl text-sm text-slate-200">{activeVerdictInfo.description}</p>
                  <p className="text-xs text-slate-400">{jobDescriptor}</p>
                  <p className="text-xs text-slate-400">{baselineDescriptor}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Current score
                  </p>
                  <p className="mt-1 text-3xl font-semibold text-white">
                    {latestScore !== null ? latestScore.toFixed(1) : "Not available"}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                    {currentVerdictInfo.label}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    This result remains unchanged while calibration only affects the active score.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Calibrated score
                    </p>
                    <span className="text-xs text-slate-400">
                      {calibrationResult?.calibration?.label ?? "Not run"}
                    </span>
                  </div>
                  {calibrationResult ? (
                    <>
                      <p className="mt-1 text-3xl font-semibold text-white">
                        {calibrationResult.overallScore?.toFixed(1) ?? "Not available"}
                      </p>
                      <p className="text-sm text-slate-300">
                        {calibrationDeltaText ? `${calibrationDeltaText} vs current score` : "Delta unavailable"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">Run a calibration to compare the adjusted score.</p>
                  )}

                  <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
                    <input
                      id="use-calibrated-score"
                      type="checkbox"
                      checked={useCalibratedScore}
                      disabled={!calibrationResult}
                      onChange={(event) => setUseCalibratedScore(event.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border border-white/20 bg-slate-950 text-emerald-300 focus:ring-emerald-400"
                    />
                    <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      Use calibrated score for gating
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div>
                  <label
                    className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400"
                    htmlFor="calibration-profile"
                  >
                    Calibration profile
                  </label>
                  <div className="mt-2 flex flex-col gap-1">
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
                    <p className="text-xs text-slate-400">
                      {selectedCalibrationProfile?.description ?? "Adjust weights to tilt the scoring emphasis."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <FormButton onClick={() => void handleCalibrate()} disabled={calibrating}>
                    {calibrating ? "Calibrating..." : "Calibrate score"}
                  </FormButton>
                  <p className="text-xs text-slate-400">
                    Calibration recalculates the score without overwriting the stored analysis.
                  </p>
                </div>
              </div>

              {calibrationError ? (
                <Alert intent="error" title="Calibration failed">
                  {calibrationError}
                </Alert>
              ) : null}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Next action
              </p>
              <h2 className="text-2xl font-semibold text-white">Continue shaping your story</h2>
              <p className="text-sm text-slate-300">
                Generate tailored documents, review what influenced the verdict, or run the analysis again.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <FormButton
                onClick={() => void handleGenerateBothDocuments()}
                disabled={!readyForDocument || loading || isExportingBoth || isGeneratingBoth}
              >
                {isGeneratingBoth ? "Generating..." : "Generate tailored resume and cover letter"}
              </FormButton>
              <FormButton variant="secondary" onClick={() => router.push("/interview-toolkit")}>
                View interview toolkit
              </FormButton>
              <FormButton variant="ghost" onClick={() => router.push("/analyze")}>
                Run again
              </FormButton>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Why you got this score
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Insights</h2>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Top 3</span>
          </div>

          {reasonSummary.primary.length ? (
            <div className="mt-3 space-y-3">
              {reasonSummary.primary.map((item, index) => (
                <div
                  key={`${item.message}-${item.type}-${index}`}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${
                      item.type === "strength" ? "text-emerald-300" : "text-amber-300"
                    }`}
                  >
                    {item.type === "strength" ? "Strength" : "Gap"}
                  </span>
                  <p className="text-sm text-slate-100">{item.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Load an analysis to see the strengths and gaps that shaped this score.
            </p>
          )}

          <details className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-100">
              Supporting evidence and extra context
            </summary>
            <div className="mt-3 space-y-3 text-sm text-slate-200">
              {reasonSummary.extras.length
                ? reasonSummary.extras.map((item, index) => (
                    <div key={`${item.message}-${item.type}-${index}`}>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        {item.type === "strength" ? "Strength" : "Gap"}
                      </p>
                      <p>{item.message}</p>
                    </div>
                  ))
                : null}
              {latest?.summary ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Summary</p>
                  <p>{latest.summary}</p>
                </div>
              ) : null}
              {!reasonSummary.extras.length && !latest?.summary ? (
                <p className="text-sm text-slate-500">No additional context available yet.</p>
              ) : null}
            </div>
          </details>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Compliance flags
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Integrity checks</h2>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Sorted by severity</span>
          </div>

          {topComplianceFlags.length ? (
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              {topComplianceFlags.map((flag) => (
                <li key={flag.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-400">
                    <span>{flag.severity === "block" ? "Critical" : "Advisory"}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-100">{flag.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No compliance flags detected for this run.</p>
          )}

          {hasMoreComplianceFlags ? (
            <details className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                Show all {complianceFlagList.length} compliance flags
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {complianceFlagList.map((flag) => (
                  <li
                    key={`all-${flag.id}`}
                    className="rounded-xl border border-white/10 bg-slate-950/50 p-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      {flag.severity === "block" ? "Critical" : "Advisory"}
                    </p>
                    <p className="text-sm text-slate-100">{flag.message}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <details className="space-y-4">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-100">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Advanced details
                </p>
                <h2 className="text-lg font-semibold text-white">Dimension scores & metadata</h2>
              </div>
              <span className="text-xs text-slate-400">Expand for hidden context</span>
            </summary>
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Dimension scores
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Run metadata
                </p>
                <dl className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {metadataEntries.map((entry) => (
                    <div key={entry.label}>
                      <dt className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        {entry.label}
                      </dt>
                      <dd className="text-sm text-slate-100">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </details>
        </section>

        {exportBothSuccessDetails ? (
          <Alert intent="success" title="Resume and cover letter exported.">
            <details
              style={{
                marginTop: 8,
                cursor: "pointer",
                fontSize: 12,
                color: "rgba(226,232,240,0.7)",
              }}
            >
              <summary>Copy details</summary>
              <pre
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  backgroundColor: "rgba(15,23,42,0.6)",
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {exportBothSuccessJson}
              </pre>
              {hasClipboardAPI && (
                <button
                  type="button"
                  onClick={() => copyTextToClipboard(exportBothSuccessJson)}
                  className="mt-2"
                  style={{
                    border: "1px solid rgba(148,163,184,0.4)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    backgroundColor: "transparent",
                    color: "rgba(226,232,240,0.9)",
                  }}
                >
                  Copy details
                </button>
              )}
            </details>
            <p className="mt-2 text-xs text-slate-400">
              Resume audit ID: {exportBothSuccessDetails.resumeAuditId ?? "Not available"}. Cover letter audit ID:{" "}
              {exportBothSuccessDetails.coverLetterAuditId ?? "Not available"}.
            </p>
          </Alert>
        ) : null}

        {exportBothError ? (
          <Alert intent="error" title="Unable to export documents">
            <p className="text-sm text-slate-100" style={{ margin: 0 }}>
              {exportBothError.message}
            </p>
            <details
              style={{
                marginTop: 8,
                cursor: "pointer",
                fontSize: 12,
                color: "rgba(226,232,240,0.7)",
              }}
            >
              <summary>Copy details</summary>
              <pre
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  backgroundColor: "rgba(15,23,42,0.6)",
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {exportBothErrorJson}
              </pre>
              {hasClipboardAPI && (
                <button
                  type="button"
                  onClick={() => copyTextToClipboard(exportBothErrorJson)}
                  className="mt-2"
                  style={{
                    border: "1px solid rgba(148,163,184,0.4)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    backgroundColor: "transparent",
                    color: "rgba(226,232,240,0.9)",
                  }}
                >
                  Copy details
                </button>
              )}
            </details>
            <p className="mt-2 text-xs text-slate-400">Audit ID: {exportBothError.auditId ?? "Not available"}</p>
          </Alert>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Next steps
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Where to focus now</h2>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Action plan</span>
          </div>

          <ol className="list-decimal space-y-4 pl-4 text-sm text-slate-300 marker:text-slate-500">
            {nextSteps.map((step, index) => (
              <li key={step.title + "-" + index} className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">{step.title}</p>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>

          <div className="flex justify-end">
            <FormButton variant="ghost" onClick={() => router.push(fitReviewPath)} disabled={!latest?.jobId}>
              Open Fit Review
            </FormButton>
          </div>
        </section>

        {tierGateError ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-50">
            <span>{tierGateError.message ?? "A plan update may unlock resume generation."} </span>
            <Link href="/pricing" className="font-semibold text-white underline">
              View plans
            </Link>
            .
          </div>
        ) : null}

        {complianceError ? <ComplianceViolationPanel error={complianceError} /> : null}

        {error ? (
          <Alert intent="error" title="Uh oh">
            {error}
          </Alert>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Generate {documentConfig.capitalizedLabel}
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Output</h2>
              <p className="mt-1 text-sm text-slate-400">
                {documentType === "resume"
                  ? "This generates a resume draft. Cover letter generation is handled in the Cover Letter flow."
                  : "This generates a cover letter draft. Resume generation is handled in the resume flow."}
              </p>
            </div>

            {qualityBadge ? (
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] ${qualityBadge.toneClass}`}
              >
                {qualityBadge.label}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <FormButton onClick={() => void generateDocument(false)} disabled={!readyForDocument || loading || isExportingBoth}>
              {loading ? "Generating..." : `Generate draft ${documentConfig.label}`}
            </FormButton>

            <FormButton
              variant="secondary"
              onClick={() => void generateDocument(true)}
              disabled={!readyForDocument || !oneTapEligible || loading || isExportingBoth}
              title={
                readyForDocument
                  ? oneTapEligible
                    ? `Generate an export-ready ${documentConfig.label} based on the latest analysis`
                    : `Requires fit score of at least ${autoGenerateThreshold}`
                  : "Load the latest analysis before using one tap"
              }
            >
              One tap export (optimized {documentConfig.pluralLabel})
            </FormButton>
          </div>

          <div className="flex flex-wrap gap-3">
            <FormButton
              variant="secondary"
              onClick={() => void exportDocument("docx")}
              disabled={
                !readyForDocument ||
                !oneTapEligible ||
                (exportState?.docType === documentType && exportState.format === "docx") ||
                isExportingBoth
              }
            >
              {exportState?.docType === documentType && exportState.format === "docx"
                ? "Downloading..."
                : "Download DOCX"}
            </FormButton>

            <FormButton
              variant="secondary"
              onClick={() => void exportDocument("pdf")}
              disabled={
                !readyForDocument ||
                !oneTapEligible ||
                (exportState?.docType === documentType && exportState.format === "pdf") ||
                isExportingBoth
              }
            >
              {exportState?.docType === documentType && exportState.format === "pdf"
                ? "Downloading..."
                : "Download PDF"}
            </FormButton>
          </div>

          <div className="space-y-2 text-sm text-slate-300">
            {oneTapEligible ? (
              <p>
                Your fit score meets the export threshold. Review the draft below and download this {documentConfig.label} when ready.
              </p>
            ) : (
              <p>
                Your score is below {autoGenerateThreshold}. You can generate and review a draft now. Downloads unlock once you reach the export threshold for this {documentConfig.label}.
              </p>
            )}
          </div>

          {currentDocumentState.tierGateError ? (
            <p className="text-sm text-amber-300">
              {currentDocumentState.tierGateError.message ??
                `${documentConfig.capitalizedLabel} export is limited by your current plan.`}{" "}
              <Link href="/pricing" className="font-semibold text-white underline">
                View plans
              </Link>
              .
            </p>
          ) : null}

          {currentDocumentState.complianceError ? (
            <ComplianceViolationPanel error={currentDocumentState.complianceError} />
          ) : null}

          {currentDocumentState.error ? (
            <Alert intent="error" title={`Unable to generate ${documentConfig.capitalizedLabel}`}>
              <p style={{ margin: 0 }}>{currentDocumentState.error.message}</p>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: 12,
                  marginTop: 6,
                  color: "rgba(226,232,240,0.8)",
                }}
              >
                <span>Status: {currentDocumentState.error.status}</span>
                <span>Code: {currentDocumentState.error.code}</span>
                {currentDocumentState.error.auditId && <span>Audit ID: {currentDocumentState.error.auditId}</span>}
              </div>
              <details
                style={{
                  marginTop: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  color: "rgba(226,232,240,0.7)",
                }}
              >
                <summary>Copy details</summary>
                <pre
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    backgroundColor: "rgba(15,23,42,0.6)",
                    padding: 8,
                    borderRadius: 6,
                  }}
                >
                  {JSON.stringify(currentErrorDetails, null, 2)}
                </pre>
                {hasClipboardAPI && (
                  <button
                    type="button"
                    onClick={() => copyTextToClipboard(JSON.stringify(currentErrorDetails, null, 2))}
                    className="mt-2"
                    style={{
                      border: "1px solid rgba(148,163,184,0.4)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      backgroundColor: "transparent",
                      color: "rgba(226,232,240,0.9)",
                    }}
                  >
                    Copy details
                  </button>
                )}
              </details>
            </Alert>
          ) : null}

          {currentDocumentState.response ? (
            <>
              {documentWarningFlags.length ? (
                <ComplianceFlagPanel
                  title="Compliance warnings"
                  description={`${documentConfig.capitalizedLabel} generated with compliance notices.`}
                  flags={documentWarningFlags as any}
                  auditId={documentAuditId}
                  baselineVersionHash={documentBaselineHash}
                  intent="warning"
                />
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {documentConfig.previewTitle}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {documentConfig.capitalizedLabel} draft ready. Review below, then download when available.
                </p>

                <div className="mt-3 flex justify-end">
                  <FormButton
                    variant="secondary"
                    onClick={() => {
                      const text = documentPreviewText || "";
                      if (!text) return;
                      void navigator.clipboard.writeText(text);
                    }}
                    disabled={!documentPreviewText}
                  >
                    {documentConfig.copyButtonLabel}
                  </FormButton>
                </div>

                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
                  {documentPreviewText}
                </pre>
              </div>
            </>
          ) : (
            <EmptyState
              title={`No ${documentConfig.label} generated yet`}
              body="Generate a draft to preview it here."
              cta={null}
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          )}
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
      </div>
    </PageShell>
  );
}
