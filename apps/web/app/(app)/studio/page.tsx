"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { type ComplianceFlag } from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { defaultClosingTemplateKey } from "@/lib/coverLetters";
import { formatErrorMessage, readResponsePayload } from "@/lib/compliance/parseComplianceError";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
import { BaselineDto, BaselineVersionDto, listBaselines } from "@/lib/baselines";
import {
  buildCoverLetterParagraphs,
  collectNormalizedContextValues,
  createDocumentState,
  downloadBlob,
  extractComplianceWarnings,
  formatPreview,
  getFilenameFromContentDisposition,
  mapApplicationConfidence,
  normalizeAuditId,
  readDuplicateCoverLetterId,
  readTrackerField,
  trimToString,
  type ResumeFocusOption,
} from "@/src/lib/studio/helpers";
import { BaselineBlockPolicyPanel } from "./BaselineBlockPolicyPanel";
import { ResumePreview } from "./ResumePreview";
import { listJobs } from "@/lib/jobsClient";
import { useEntitlements } from "@/src/lib/entitlements";

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
  score?: number | string | null;
  overallScore?: number | string | null;
  verdict?: string | null;
  summary?: string | null;
  baselineId?: string;
  baselineVersionId?: string;
  company?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  title?: string | null;
};

type DocumentState = {
  response: unknown | null;
  error: string | null;
  tierGateError: TierGateError | null;
};

type CoverLetterJobContextPayload = {
  allowedCompanies?: string[];
  allowedRoleTitles?: string[];
};

type CoverLetterPayload = {
  jobId?: string;
  baselineId?: string;
  baselineVersionId?: string;
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
  flags: { label: string; message?: string }[];
  auditId?: string;
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
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (!error || typeof error !== "object") {
    return null;
  }
  const errorRecord = error as Record<string, unknown>;
  if (trimToString(errorRecord.code) !== "COMPLIANCE_VIOLATION") {
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
  if (!flags.length) {
    return null;
  }
  const auditId = trimToString(detailRecord.audit_id ?? detailRecord.auditId);
  return {
    title: "Draft needs verification",
    body: "Some content is not supported by your verified baseline yet.",
    flags,
    auditId,
  };
}

export default function StudioPage() {
  const searchParams = useSearchParams();
  const searchParamValue = searchParams.toString();
  const requestedJobId = useMemo(
    () => searchParams.get("jobId")?.trim() ?? "",
    [searchParamValue],
  );
  const requestedBaselineVersionId = useMemo(
    () => searchParams.get("baselineVersionId")?.trim() ?? "",
    [searchParamValue],
  );

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(false);
  const [baselinesError, setBaselinesError] = useState<string | null>(null);

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

  const [resumeState, setResumeState] = useState<DocumentState>(() => createDocumentState());
  const [resumeGenerating, setResumeGenerating] = useState(false);
  const [resumeExportFormat, setResumeExportFormat] =
    useState<"docx" | "pdf" | null>(null);
  const [resumeWarningFlags, setResumeWarningFlags] = useState<ComplianceFlag[]>([]);
  const [resumeAuditId, setResumeAuditId] = useState<string | undefined>();
  const [resumeFocus, setResumeFocus] = useState<ResumeFocusOption>("Auto (recommended)");

  const [coverState, setCoverState] = useState<DocumentState>(() => createDocumentState());
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverExportFormat, setCoverExportFormat] = useState<"docx" | "pdf" | null>(null);
  const [coverWarningFlags, setCoverWarningFlags] = useState<ComplianceFlag[]>([]);
  const [coverAuditId, setCoverAuditId] = useState<string | undefined>();
  const [coverLetterComplianceBlocked, setCoverLetterComplianceBlocked] =
    useState<CoverLetterComplianceBlocked | null>(null);
  const [showComplianceDetails, setShowComplianceDetails] = useState(false);

  function applyCoverLetterComplianceBlocked(blocked: CoverLetterComplianceBlocked) {
    setCoverLetterComplianceBlocked(blocked);
    setCoverState(createDocumentState());
    setCoverWarningFlags([]);
    setCoverAuditId(undefined);
    setShowComplianceDetails(false);
  }

  const router = useRouter();
  const trackerEntryId =
    readTrackerField(resumeState.response, "opportunityId") ??
    readTrackerField(resumeState.response, "trackerEntryId");
  const trackerStatus = readTrackerField(resumeState.response, "trackerStatus");
  const handleOpenTracker = useCallback(() => {
    if (!trackerEntryId) return;
    void router.push("/job-tracker");
  }, [router, trackerEntryId]);

  const { isPro } = useEntitlements();

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId),
    [jobs, selectedJobId],
  );
  const selectedBaseline = useMemo(
    () => baselines.find((baseline) => baseline.id === selectedBaselineId),
    [baselines, selectedBaselineId],
  );

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedBaselineVersionId),
    [versions, selectedBaselineVersionId],
  );

  useEffect(() => {
    setCoverLetterComplianceBlocked(null);
    setShowComplianceDetails(false);
  }, [selectedJobId, selectedBaselineId, selectedBaselineVersionId]);

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

  const analysisScore = useMemo(() => {
    const value = analysis?.overallScore ?? analysis?.score;
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return null;
  }, [analysis]);
  const applicationConfidence = useMemo(
    () => mapApplicationConfidence(analysisScore),
    [analysisScore],
  );

  const generationMessage = useMemo(() => {
    if (!selectedBaselineVersionId) {
      return "Select a baseline that is ready before generating documents.";
    }
    if (analysisScore === null) {
      return "Run the compatibility check before generating a resume or cover letter.";
    }
    return null;
  }, [analysisScore, selectedBaselineVersionId]);

  const readyForDocuments =
    Boolean(selectedJobId && selectedBaselineId && selectedBaselineVersionId) &&
    analysisScore !== null;

  const hasResumeArtifact = Boolean(resumeState.response);
  const canExportDocuments = readyForDocuments && isPro;
  const canExportResume = canExportDocuments && hasResumeArtifact;
  const isResumeDownloadLocked = !isPro;
  const resumePreviewText = useMemo(() => formatPreview(resumeState.response), [resumeState.response]);
  const coverLetterParagraphs = useMemo(
    () => buildCoverLetterParagraphs(coverState.response),
    [coverState.response],
  );
  const hasCoverLetterArtifact = Boolean(coverState.response);
  const positioningNarrative = useMemo(() => {
    if (typeof analysis?.summary === "string" && analysis.summary.trim().length) {
      return analysis.summary.trim();
    }
    return "Operational leadership in support organizations with verified cross-functional execution.";
  }, [analysis?.summary]);
  const positioningBullets = useMemo(() => {
    return [
      "leadership scope",
      "incident management programs",
      "operational scaling",
    ];
  }, []);
  const keywordCoverageRows = useMemo(() => {
    if (!analysis || typeof analysis !== "object") return [];
    const record = analysis as Record<string, unknown>;
    const matched = Array.isArray(record.matchedTerms)
      ? record.matchedTerms.filter((item): item is string => typeof item === "string")
      : [];
    const missing = Array.isArray(record.missingTerms)
      ? record.missingTerms.filter((item): item is string => typeof item === "string")
      : [];
    const rows: Array<{ term: string; status: "covered" | "partial" | "missing" }> = [];
    for (const term of matched.slice(0, 4)) {
      rows.push({ term, status: "covered" });
    }
    for (const term of missing.slice(0, 4)) {
      rows.push({ term, status: "missing" });
    }
    if (!rows.length) {
      rows.push(
        { term: "Operational leadership", status: analysisScore !== null && analysisScore >= 80 ? "covered" : "partial" },
        { term: "Incident management", status: analysisScore !== null && analysisScore >= 70 ? "covered" : "partial" },
        { term: "Cross-functional coordination", status: "covered" },
      );
    }
    return rows.slice(0, 6);
  }, [analysis, analysisScore]);
  const resumeStrengthMetrics = useMemo(() => {
    const score = analysisScore ?? 0;
    return [
      {
        label: "Experience Alignment",
        value: score >= 85 ? "Strong" : score >= 70 ? "Moderate" : "Needs work",
      },
      {
        label: "Keyword Coverage",
        value: keywordCoverageRows.some((row) => row.status === "missing") ? "Partial" : "Strong",
      },
      {
        label: "Leadership Signals",
        value: score >= 75 ? "Strong" : "Moderate",
      },
      {
        label: "Technical Depth",
        value: score >= 70 ? "Moderate" : "Needs work",
      },
    ];
  }, [analysisScore, keywordCoverageRows]);
  const readinessChecks = useMemo(
    () => ({
      resumeAligned: Boolean(resumeState.response),
      coverLetterGenerated: Boolean(coverState.response),
      fitScoreAboveThreshold: typeof analysisScore === "number" && analysisScore >= 70,
    }),
    [analysisScore, coverState.response, resumeState.response],
  );
  const applicationReadinessStatus =
    readinessChecks.resumeAligned &&
    readinessChecks.coverLetterGenerated &&
    readinessChecks.fitScoreAboveThreshold;
  const hasComplianceBlockedDetails = Boolean(
    coverLetterComplianceBlocked &&
      (coverLetterComplianceBlocked.flags.some((flag) => Boolean(flag.message)) ||
        coverLetterComplianceBlocked.auditId),
  );

  function buildCoverLetterPayload(oneTap: boolean): CoverLetterPayload {
    const payload: CoverLetterPayload = {
      jobId: selectedJobId,
      baselineId: selectedBaselineId,
      baselineVersionId: selectedBaselineVersionId,
      closingTemplateKey: defaultClosingTemplateKey,
      documentType: "cover_letter",
      oneTap,
    };
    if (coverLetterJobContext) {
      payload.jobContext = coverLetterJobContext;
    }
    return payload;
  }

  function buildResumePayload(oneTap: boolean) {
    const payload: Record<string, unknown> = {
      jobId: selectedJobId,
      baselineId: selectedBaselineId,
      baselineVersionId: selectedBaselineVersionId,
      oneTap,
    };
    if (resumeFocus !== "Auto (recommended)") {
      payload.resumeFocus = resumeFocus;
    }
    return payload;
  }

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
        setSelectedBaselineId((current) => {
          if (current && fetched.some((baseline) => baseline.id === current)) {
            return current;
          }
          return fetched[0]?.id ?? "";
        });
      } catch (error) {
        if (canceled) return;
        const message =
          error instanceof Error ? error.message : "Baselines could not be loaded.";
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
  }, []);

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
          const message = formatErrorMessage(payload, "Baseline snapshot could not be loaded.");
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
          error instanceof Error ? error.message : "Baseline snapshot could not be loaded.";
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
    if (!selectedJobId) {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }
    let canceled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);
    const loadAnalysis = async () => {
      try {
        const response = await fetch(
          `/api/analysis/job/${encodeURIComponent(selectedJobId)}/latest`,
        );
        const payload = await readResponsePayload(response);
        if (canceled) return;
        if (!response.ok) {
          const message = formatErrorMessage(payload, "Fit analysis could not be loaded.");
          setAnalysis(null);
          setAnalysisError(message);
          return;
        }
        setAnalysis(payload as LatestAnalysis);
        setAnalysisError(null);
      } catch (error) {
        if (canceled) return;
        const message =
          error instanceof Error ? error.message : "Fit analysis could not be loaded.";
        setAnalysis(null);
        setAnalysisError(message);
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
  }, [selectedJobId]);

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
    if (!readyForDocuments) {
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
    const payload = buildResumePayload(false);
    try {
      const response = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setResumeState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
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

  const exportResume = async (format: "docx" | "pdf") => {
    if (!readyForDocuments) {
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
    const payload = buildResumePayload(true);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resume export failed.";
      setResumeState((current) => ({ ...current, error: message }));
    } finally {
      setResumeExportFormat(null);
    }
  };

  async function loadCoverLetterById(coverLetterId: string) {
    setCoverLetterComplianceBlocked(null);
    setShowComplianceDetails(false);
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
      setCoverState((current) => ({ ...current, response: responsePayload }));
      setCoverWarningFlags(extractComplianceWarnings(responsePayload));
      setCoverAuditId(normalizeAuditId(responsePayload));
      setCoverLetterComplianceBlocked(null);
      setShowComplianceDetails(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cover letter unavailable.";
      setCoverState((current) => ({ ...current, error: message }));
    }
  }

  const handleCoverDraft = async () => {
    if (!readyForDocuments) {
      setCoverState((current) => ({
        ...current,
        error: generationMessage ?? "Review prerequisites before generating a cover letter.",
      }));
      return;
    }
    setCoverGenerating(true);
    setCoverState(createDocumentState());
    setCoverWarningFlags([]);
    setCoverAuditId(undefined);
    setCoverLetterComplianceBlocked(null);
    setShowComplianceDetails(false);
    const payload = buildCoverLetterPayload(false);
    try {
      const response = await fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        if (response.status === 409) {
          const existingId = readDuplicateCoverLetterId(responsePayload);
          if (existingId) {
            await loadCoverLetterById(existingId);
            return;
          }
        }
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
        throw new Error(formatErrorMessage(responsePayload, "Cover letter generation failed."));
      }
      setCoverState((current) => ({ ...current, response: responsePayload }));
      setCoverWarningFlags(extractComplianceWarnings(responsePayload));
      setCoverAuditId(normalizeAuditId(responsePayload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cover letter generation failed.";
      setCoverState((current) => ({ ...current, error: message }));
    } finally {
      setCoverGenerating(false);
    }
  };

  const exportCoverLetter = async (format: "docx" | "pdf") => {
    if (!readyForDocuments) {
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
    setCoverExportFormat(format);
    setCoverState(createDocumentState());
    setCoverWarningFlags([]);
    setCoverAuditId(undefined);
    const payload = buildCoverLetterPayload(true);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cover letter export failed.";
      setCoverState((current) => ({ ...current, error: message }));
    } finally {
      setCoverExportFormat(null);
    }
  };

  return (
    <PageShell className="space-y-6">
      <PageHeader
        title="Resume and Cover Letter Studio"
        description="Generate, preview, and export tailored documents using your latest CX Fit analysis."
      />

      {jobsError ? (
        <Alert intent="error" title="Jobs could not be loaded">
          {jobsError}
        </Alert>
      ) : null}
      {baselinesError ? (
        <Alert intent="error" title="Baselines could not be loaded">
          {baselinesError}
        </Alert>
      ) : null}
      {analysisError ? (
        <Alert intent="error" title="Unable to load fit score">
          {analysisError}
        </Alert>
      ) : null}
      {versionsError ? (
        <Alert intent="error" title="Baseline snapshot unavailable">
          {versionsError}
        </Alert>
      ) : null}

      <section className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              body="Upload a job description in the Resume builder and come back to generate documents."
            />
          ) : (
            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Job
              <select
                className="rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
                disabled={jobsLoading}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.company ?? "Untitled company"} - {job.title ?? "Untitled role"}
                    {(job.archivedAt || job.isArchived) && " (archived)"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {baselines.length === 0 ? (
            <EmptyState
              title="No baselines yet"
              body="Upload a baseline to pair with your job before generating documents."
            />
          ) : (
            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Baseline
              <select
                className="rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
                value={selectedBaselineId}
                onChange={(event) => {
                  pendingVersionSelectionRef.current = null;
                  setVersionTouched(false);
                  setSelectedBaselineId(event.target.value);
                  setBaselineTouched(true);
                }}
                disabled={baselinesLoading}
              >
                {baselines.map((baseline) => (
                  <option key={baseline.id} value={baseline.id}>
                    {baseline.originalFilename || `Baseline ${baseline.version}`}
                  </option>
                ))}
              </select>
            </label>
          )}

        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">
          Targeting Context
        </h2>
        <p className="text-sm text-slate-300">
          Role: <span className="font-semibold text-slate-100">{selectedJob?.title ?? "Not selected"}</span>
        </p>
        <p className="text-sm text-slate-300">
          Baseline:{" "}
          <span className="font-semibold text-slate-100">
            {selectedBaseline?.originalFilename ||
              (selectedBaseline ? `Baseline ${selectedBaseline.version}` : "Not selected")}
          </span>
        </p>
        <p className="text-sm text-slate-300">
          Fit Score:{" "}
          <span className="font-semibold text-slate-100">
            {analysisLoading
              ? "Loading..."
              : analysisScore !== null
              ? analysisScore.toFixed(1)
              : "n/a"}
          </span>{" "}
          •{" "}
          <span className="font-semibold text-emerald-300">
            Confidence: {applicationConfidence}
          </span>
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">
          Role Positioning Guidance
        </h2>
        <p className="text-sm text-slate-300">For this role your strongest narrative is:</p>
        <p className="text-sm font-semibold text-slate-100">{positioningNarrative}</p>
        <p className="text-sm text-slate-300">Your resume should emphasize:</p>
        <ul className="space-y-1 text-sm text-slate-200">
          {positioningBullets.map((bullet) => (
            <li key={`positioning-${bullet}`}>• {bullet}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
        <label className="flex flex-col gap-2 text-sm text-slate-400">
          Resume Focus
          <select
            className="rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
            value={resumeFocus}
            onChange={(event) => setResumeFocus(event.target.value as ResumeFocusOption)}
          >
            <option value="Auto (recommended)">Auto (recommended)</option>
            <option value="Operational Leadership">Operational Leadership</option>
            <option value="Technical Depth">Technical Depth</option>
            <option value="Customer Experience Strategy">Customer Experience Strategy</option>
            <option value="Scaling Operations">Scaling Operations</option>
          </select>
        </label>
      </section>

      <p className="text-xs text-slate-400">
        Documents generated from your verified baseline and job analysis.
      </p>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Resume</h2>
            <p className="text-sm text-slate-300">
              Generate a targeted resume based on your selected role, baseline, and job analysis.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FormButton onClick={handleResumeDraft} disabled={!readyForDocuments || resumeGenerating}>
              {resumeGenerating ? "Generating..." : "Generate Resume"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("docx")}
              disabled={
                isResumeDownloadLocked || !canExportResume || resumeExportFormat === "docx"
              }
            >
              {resumeExportFormat === "docx" ? "Downloading..." : "Download DOCX"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("pdf")}
              disabled={
                isResumeDownloadLocked || !canExportResume || resumeExportFormat === "pdf"
              }
            >
              {resumeExportFormat === "pdf" ? "Downloading..." : "Download PDF"}
            </FormButton>
          </div>
        </div>

        {generationMessage ? (
          <Alert intent="warning" title="Prerequisites missing">
            {generationMessage}
          </Alert>
        ) : null}

        {resumeState.tierGateError ? (
          <Alert intent="warning">
            {resumeState.tierGateError.message ?? "Resume export is limited by your subscription tier."}
          </Alert>
        ) : null}
        {resumeWarningFlags.length ? (
          <p className="text-sm text-amber-200">
            Verification signals detected. Personalization may be limited. See Results for details.
          </p>
        ) : null}
        {resumeState.error ? (
          <Alert intent="error" title="Resume unavailable">
            {resumeState.error}
          </Alert>
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
        ) : isPro ? (
          <p className="text-sm text-slate-300">Downloads are available.</p>
        ) : null}

        {resumeState.response ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            {resumeWarningFlags.length ? (
              <p className="text-sm text-amber-200">
                Verification signals detected. Personalization may be limited. See
                Results for details.
              </p>
            ) : null}
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <ResumePreview payload={resumeState.response} fallbackText={resumePreviewText} />
            </div>
            {trackerEntryId ? (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200">
                  Next move
                </p>
                <p className="text-sm text-slate-100">
                  Added to Opportunities as{' '}
                  <span className="font-semibold text-white">
                    {trackerStatus ?? 'Saved'}
                  </span>
                  .
                </p>
                <div className="mt-3 flex justify-end">
                  <FormButton onClick={handleOpenTracker}>
                    Open Opportunities
                  </FormButton>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
                Resume Strength vs Job
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {resumeStrengthMetrics.map((metric) => (
                  <div key={`resume-strength-${metric.label}`} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                    <p className="text-xs text-slate-400">{metric.label}</p>
                    <p className="text-sm font-semibold text-slate-100">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
                Keyword Coverage Map
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {keywordCoverageRows.map((row) => (
                  <li key={`keyword-coverage-${row.term}`} className="flex items-center gap-2">
                    <span>
                      {row.status === "covered"
                        ? "✔ Covered"
                        : row.status === "partial"
                        ? "⚠ Partial"
                        : "✖ Missing"}
                    </span>
                    <span className="text-slate-300">{row.term}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <EmptyState title="No resume generated yet" body="Generate Resume to preview it." />
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Cover Letter</h2>
            <p className="text-sm text-slate-300">
              Generate a targeted cover letter aligned with the role and your verified experience.
            </p>
          </div>
          <FormButton onClick={handleCoverDraft} disabled={!readyForDocuments || coverGenerating}>
            {coverGenerating ? "Generating..." : "Generate Cover Letter"}
          </FormButton>
        </div>

        {generationMessage ? (
          <Alert intent="warning" title="Prerequisites missing">
            {generationMessage}
          </Alert>
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
            {coverLetterComplianceBlocked.flags.length ? (
              <ul className="space-y-2 pl-4 text-slate-100">
                {(() => {
                  const seen = new Set<string>();
                  const uniqueFlags: typeof coverLetterComplianceBlocked.flags = [];
                  for (const flag of coverLetterComplianceBlocked.flags) {
                    if (seen.has(flag.label)) continue;
                    seen.add(flag.label);
                    uniqueFlags.push(flag);
                  }
                  return uniqueFlags.map((flag, index) => (
                    <li key={`blocked-flag-${index}`}>{flag.label}</li>
                  ));
                })()}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <FormButton onClick={handleCoverDraft} disabled={coverGenerating}>
                Regenerate safely
              </FormButton>
              {hasComplianceBlockedDetails ? (
                <button
                  type="button"
                  className="text-sm font-medium text-slate-300 underline-offset-4 transition hover:text-white"
                  onClick={() => setShowComplianceDetails((prev) => !prev)}
                >
                  {showComplianceDetails ? "Hide details" : "See details"}
                </button>
              ) : null}
            </div>
            {showComplianceDetails && hasComplianceBlockedDetails ? (
              <div className="space-y-1 text-xs text-slate-400">
                {coverLetterComplianceBlocked.flags.map(
                  (flag, index) =>
                    flag.message ? (
                      <p key={`blocked-detail-${index}`}>
                        <span className="font-semibold text-slate-100">{flag.label}:</span>{" "}
                        {flag.message}
                      </p>
                    ) : null,
                )}
                {coverLetterComplianceBlocked.auditId ? (
                  <p>Audit ID: {coverLetterComplianceBlocked.auditId}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {coverState.tierGateError ? (
          <Alert intent="warning">
            {coverState.tierGateError.message ??
              "Cover letter export is limited by your subscription tier."}
          </Alert>
        ) : null}
        {coverWarningFlags.length ? (
          <p className="text-sm text-amber-200">
            Verification signals detected. Personalization may be limited. See Results for details.
          </p>
        ) : null}
        {coverState.error && !coverLetterComplianceBlocked ? (
          <Alert intent="error" title="Cover letter unavailable">
            {coverState.error}
          </Alert>
        ) : null}

        {isPro && hasCoverLetterArtifact && !coverLetterComplianceBlocked ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-300">Downloads are available.</p>
            <FormButton
              variant="secondary"
              onClick={() => void exportCoverLetter("docx")}
              disabled={
                !canExportDocuments || coverExportFormat === "docx" || !!coverLetterComplianceBlocked
              }
            >
              {coverExportFormat === "docx" ? "Downloading..." : "Download DOCX"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportCoverLetter("pdf")}
              disabled={
                !canExportDocuments || coverExportFormat === "pdf" || !!coverLetterComplianceBlocked
              }
            >
              {coverExportFormat === "pdf" ? "Downloading..." : "Download PDF"}
            </FormButton>
          </div>
        ) : !isPro ? (
          <p className="text-sm text-slate-300">Upgrade to Pro to download documents.</p>
        ) : null}

        {!coverLetterComplianceBlocked ? (
          coverState.response ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <div className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3">
                {coverLetterParagraphs.length ? (
                  <div className="mx-auto flex w-full max-w-[760px] flex-col space-y-4 rounded-2xl border border-white/10 bg-slate-950/80 p-6 shadow-inner">
                    {coverLetterParagraphs.map((paragraph, index) => {
                      const lines = paragraph.split(/\r?\n/);
                      const isGreeting = index === 0 && /^dear\b/i.test(lines[0] ?? "");
                      return (
                        <p
                          key={`cover-letter-paragraph-${index}`}
                          className={`m-0 text-sm leading-[1.7] tracking-normal text-slate-100 ${
                            isGreeting ? "font-semibold text-slate-50" : "text-slate-200"
                          }`}
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
            <EmptyState
              title="No cover letter generated yet"
              body="Generate Cover Letter to preview it."
            />
          )
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">
          Application Readiness
        </h2>
        <div className="space-y-1 text-sm text-slate-200">
          <p>{readinessChecks.resumeAligned ? "✔" : "✖"} Resume aligned</p>
          <p>{readinessChecks.coverLetterGenerated ? "✔" : "✖"} Cover letter generated</p>
          <p>{readinessChecks.fitScoreAboveThreshold ? "✔" : "✖"} Fit Score above threshold</p>
        </div>
        <p className="text-sm font-semibold text-slate-100">
          Status: {applicationReadinessStatus ? "Ready to Apply" : "In Progress"}
        </p>
      </section>

      {selectedBaselineId && selectedBaselineVersionId ? (
        <details className="space-y-4">
          <summary className="cursor-pointer list-none rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold uppercase tracking-[0.3em] text-slate-200 shadow-sm">
            Advanced Resume Controls
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
}

