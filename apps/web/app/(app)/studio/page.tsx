"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import {
  ComplianceFlagPanel,
  ComplianceViolationPanel,
  type ComplianceFlag,
} from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ScoreGauge } from "@/components/ScoreGauge";
import {
  coverLetterClosingTemplates,
  defaultClosingTemplateKey,
} from "@/lib/coverLetters";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
import { BaselineDto, BaselineVersionDto, listBaselines } from "@/lib/baselines";
import { listJobs } from "@/lib/jobsClient";
import { useAutoGenerateThreshold } from "../lib/settings";

type Job = Awaited<ReturnType<typeof listJobs>>[number];

type LatestAnalysis = {
  score?: number | string | null;
  overallScore?: number | string | null;
  verdict?: string | null;
  summary?: string | null;
  baselineId?: string;
  baselineVersionId?: string;
};

type DocumentState = {
  response: unknown | null;
  error: string | null;
  tierGateError: TierGateError | null;
  complianceError: ParsedComplianceError | null;
};

type ResumeSection = {
  id?: string;
  type?: string;
  title?: string;
  content?: string;
};

function createDocumentState(): DocumentState {
  return {
    response: null,
    error: null,
    tierGateError: null,
    complianceError: null,
  };
}

function normalizeAuditId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keys = ["auditId", "audit_id", "id"];
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function trimToString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function extractComplianceWarnings(payload: unknown): ComplianceFlag[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const raw =
    record.compliance_flags ??
    record.complianceFlags ??
    record.complianceWarnings ??
    record.warningFlags ??
    record.flags ??
    [];
  if (!Array.isArray(raw)) return [];
  const normalized: ComplianceFlag[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) {
        normalized.push({ message: trimmed });
      }
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const message =
      trimToString(candidate.message) ??
      trimToString(candidate.msg) ??
      trimToString(candidate.description);
    if (!message) continue;
    const code = trimToString(candidate.code);
    const severity =
      trimToString(candidate.severity) ??
      trimToString(candidate.flagSeverity) ??
      trimToString(candidate.flag_severity);
    normalized.push({
      code,
      message,
      severity,
    });
  }
  return normalized;
}

function formatPreview(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "Preview unavailable.";
  }
}

function normalizeHeader(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutColon = trimmed.replace(/:$/, "");
  return withoutColon.replace(/\s+/g, " ").toLowerCase();
}

function stripDuplicateLeadingHeader(title?: string, content?: string): string | undefined {
  if (!content) return undefined;
  const normalizedTitle = normalizeHeader(title);
  if (!normalizedTitle) return content;
  const lines = content.split(/\r?\n/);
  if (!lines.length) return content;
  const firstLine = lines[0].trim();
  if (!firstLine) return content;
  if (normalizeHeader(firstLine) !== normalizedTitle) {
    return content;
  }
  const remainder = lines.slice(1).join("\n").trim();
  return remainder || undefined;
}

function downloadBlob(blob: Blob, fileName: string) {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function mapVerdict(value?: string | null): "Apply" | "Consider" | "Skip" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("apply")) return "Apply";
  if (normalized.includes("consider")) return "Consider";
  if (
    normalized.includes("skip") ||
    normalized.includes("pass") ||
    normalized.includes("decline")
  ) {
    return "Skip";
  }
  return null;
}

function splitSectionLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isBulletLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("-") || trimmed.startsWith("•");
}

function formatBulletLine(line: string): string {
  const trimmed = line.trim();
  return trimmed.replace(/^[-•]+\s*/, "").trim() || trimmed;
}

function renderSectionContent(content?: string): ReactNode | null {
  if (!content) return null;
  const lines = splitSectionLines(content);
  if (!lines.length) return null;

  const bulletLines = lines.filter((line) => isBulletLine(line));
  if (lines.length > 1 && bulletLines.length >= Math.max(1, Math.floor(lines.length / 2))) {
    return (
      <ul className="space-y-1 pl-4 text-sm leading-relaxed text-slate-200">
        {bulletLines.map((line, index) => (
          <li key={`${line}-${index}`}>{formatBulletLine(line)}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-200">
      {lines.map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </div>
  );
}

function extractResumeSections(payload: unknown): ResumeSection[] | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const rawSections = record.sections;
  if (!Array.isArray(rawSections)) return undefined;
  const normalized: ResumeSection[] = [];
  for (const section of rawSections) {
    if (!section || typeof section !== "object") continue;
    const entry = section as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title : undefined;
    const type = typeof entry.type === "string" ? entry.type : undefined;
    const id = typeof entry.id === "string" ? entry.id : undefined;
    const content = typeof entry.content === "string" ? entry.content : undefined;
    if (!title && !content && !type) continue;
    normalized.push({ id, type, title, content });
  }
  return normalized.length ? normalized : undefined;
}

function buildResumePreview(payload: unknown): ReactNode | null {
  const sections = extractResumeSections(payload);
  if (!sections || !sections.length) return null;
  const normalizedSections = sections
    .map((section) => ({
      ...section,
      content: stripDuplicateLeadingHeader(section.title, section.content),
    }))
    .filter((section) => normalizeHeader(section.title) !== "raw")
    .filter((section) => section.title || section.content);
  if (!normalizedSections.length) return null;
  return (
    <div className="space-y-6">
      {normalizedSections.map((section, index) => {
        const content = renderSectionContent(section.content);
        if (!content && !section.title) return null;
        const heading = section.title ?? section.type;
        const key = section.id ?? heading ?? `resume-section-${index}`;
        return (
          <article key={key} className="space-y-2">
            {heading ? (
              <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
                {heading}
              </h3>
            ) : null}
            {content}
          </article>
        );
      })}
    </div>
  );
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

  const baselineTouchedRef = useRef(baselineTouched);
  useEffect(() => {
    baselineTouchedRef.current = baselineTouched;
  }, [baselineTouched]);

  const versionTouchedRef = useRef(versionTouched);
  useEffect(() => {
    versionTouchedRef.current = versionTouched;
  }, [versionTouched]);

  const [versions, setVersions] = useState<BaselineVersionDto[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
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

  const [coverState, setCoverState] = useState<DocumentState>(() => createDocumentState());
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverExportFormat, setCoverExportFormat] = useState<"docx" | "pdf" | null>(null);
  const [coverWarningFlags, setCoverWarningFlags] = useState<ComplianceFlag[]>([]);
  const [coverAuditId, setCoverAuditId] = useState<string | undefined>();

  const [closingTemplateKey, setClosingTemplateKey] = useState(defaultClosingTemplateKey);

  const [autoGenerateThreshold] = useAutoGenerateThreshold();

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

  const generationMessage = useMemo(() => {
    if (!selectedBaselineVersionId) {
      return "Select a baseline version before generating documents.";
    }
    if (analysisScore === null) {
      return "Run the compatibility check before generating a resume or cover letter.";
    }
    return null;
  }, [analysisScore, selectedBaselineVersionId]);

  const readyForDocuments =
    Boolean(selectedJobId && selectedBaselineId && selectedBaselineVersionId) &&
    analysisScore !== null;

  const exportsUnlocked =
    readyForDocuments && typeof analysisScore === "number" && analysisScore >= autoGenerateThreshold;

  const verdictLabel = useMemo(() => mapVerdict(analysis?.verdict), [analysis?.verdict]);
  const analysisSummary = analysis?.summary;
  const resumePreviewText = useMemo(() => formatPreview(resumeState.response), [resumeState.response]);
  const coverPreviewText = useMemo(() => formatPreview(coverState.response), [coverState.response]);
  const resumeStructuredPreview = useMemo(
    () => buildResumePreview(resumeState.response),
    [resumeState.response],
  );
  const selectedClosingTemplate = useMemo(
    () => coverLetterClosingTemplates.find((template) => template.key === closingTemplateKey),
    [closingTemplateKey],
  );

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
          const message = formatErrorMessage(payload, "Baseline versions could not be loaded.");
          setVersionsError(message);
          setVersions([]);
          setSelectedBaselineVersionId("");
          return;
        }
        const parsed = payload as BaselineVersionDto[];
        setVersions(parsed);
        setVersionsError(null);
        setSelectedBaselineVersionId((current) => {
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
          error instanceof Error ? error.message : "Baseline versions could not be loaded.";
        setVersionsError(message);
        setVersions([]);
        setSelectedBaselineVersionId("");
      } finally {
        if (!canceled) {
          setVersionsLoading(false);
        }
      }
    };
    setVersionTouched(false);
    void loadVersions();
    return () => {
      canceled = true;
    };
  }, [selectedBaselineId, requestedBaselineVersionId]);

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
          `/api/analysis/latest?jobId=${encodeURIComponent(selectedJobId)}`,
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
    const payload = {
      jobId: selectedJobId,
      baselineId: selectedBaselineId,
      baselineVersionId: selectedBaselineVersionId,
      oneTap: false,
    };
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
        const compliance = parseComplianceError({ status: response.status, payload: responsePayload });
        if (compliance) {
          setResumeState((current) => ({ ...current, complianceError: compliance }));
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
    if (!exportsUnlocked) {
      setResumeState((current) => ({
        ...current,
        error: "Score must reach the export threshold before downloading.",
      }));
      return;
    }
    setResumeExportFormat(format);
    setResumeState(createDocumentState());
    setResumeWarningFlags([]);
    setResumeAuditId(undefined);
    const payload = {
      jobId: selectedJobId,
      baselineId: selectedBaselineId,
      baselineVersionId: selectedBaselineVersionId,
      oneTap: true,
    };
    try {
      const response = await fetch(`/api/resume/export?format=${encodeURIComponent(format)}`, {
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
        const compliance = parseComplianceError({ status: response.status, payload: responsePayload });
        if (compliance) {
          setResumeState((current) => ({ ...current, complianceError: compliance }));
          return;
        }
        throw new Error(formatErrorMessage(responsePayload, "Resume export failed."));
      }
      const blob = await response.blob();
      downloadBlob(blob, `resume.${format}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resume export failed.";
      setResumeState((current) => ({ ...current, error: message }));
    } finally {
      setResumeExportFormat(null);
    }
  };

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
    const payload = {
      jobId: selectedJobId,
      baselineId: selectedBaselineId,
      baselineVersionId: selectedBaselineVersionId,
      closingTemplateKey,
    };
    try {
      const response = await fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setCoverState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
        const compliance = parseComplianceError({ status: response.status, payload: responsePayload });
        if (compliance) {
          setCoverState((current) => ({ ...current, complianceError: compliance }));
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
    if (!exportsUnlocked) {
      setCoverState((current) => ({
        ...current,
        error: "Score must reach the export threshold before downloading.",
      }));
      return;
    }
    setCoverExportFormat(format);
    setCoverState(createDocumentState());
    setCoverWarningFlags([]);
    setCoverAuditId(undefined);
    const payload = {
      jobId: selectedJobId,
      baselineId: selectedBaselineId,
      baselineVersionId: selectedBaselineVersionId,
      closingTemplateKey,
      oneTap: true,
    };
    try {
      const response = await fetch(
        `/api/cover-letters/export?format=${encodeURIComponent(format)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const responsePayload = await readResponsePayload(response);
      if (!response.ok) {
        const tierGate = parseTierGateError({ status: response.status, payload: responsePayload });
        if (tierGate) {
          setCoverState((current) => ({ ...current, tierGateError: tierGate }));
          return;
        }
        const compliance = parseComplianceError({ status: response.status, payload: responsePayload });
        if (compliance) {
          setCoverState((current) => ({ ...current, complianceError: compliance }));
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

          {selectedBaselineId ? (
            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Baseline version
              <select
                className="rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
                value={selectedBaselineVersionId}
                onChange={(event) => {
                  setSelectedBaselineVersionId(event.target.value);
                  setVersionTouched(true);
                }}
                disabled={versionsLoading}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.versionNumber ? `Version ${version.versionNumber}` : version.id}
                    {version.fileHash ? ` (${version.fileHash.slice(0, 8)})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {versionsError ? (
            <Alert intent="error" title="Versions unavailable">
              {versionsError}
            </Alert>
          ) : null}
          {selectedBaselineId && !versionsLoading && versions.length === 0 ? (
            <Alert intent="warning" title="No baseline versions">
              Upload a baseline version for this baseline before generating documents.
            </Alert>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Latest snapshot</p>
            <h2 className="text-lg font-semibold text-slate-100">CX fit score</h2>
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Exports unlock at {autoGenerateThreshold}
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <ScoreGauge score={analysisScore ?? undefined} loading={analysisLoading} label="fit score" />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              {verdictLabel ?? "Verdict pending"}
            </p>
            <p className="text-3xl font-semibold text-white">
              {analysisScore !== null ? analysisScore.toFixed(1) : "n/a"}
            </p>
            <p className="text-sm text-slate-300">
              {analysisSummary ?? "Run the compatibility check in the Resume builder to unlock analysis."}
            </p>
          </div>
        </div>

        {!analysis ? (
          <EmptyState
            title="No analysis yet"
            body="Run the latest compatibility scoring to surface a score and verdict."
          />
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Resume</h2>
            <p className="text-sm text-slate-300">
              Generate a resume draft based on your selected job, baseline, and fit assessment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FormButton onClick={handleResumeDraft} disabled={!readyForDocuments || resumeGenerating}>
              {resumeGenerating ? "Generating..." : "Generate draft"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("docx")}
              disabled={!exportsUnlocked || resumeExportFormat === "docx"}
            >
              {resumeExportFormat === "docx" ? "Downloading..." : "Download DOCX"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("pdf")}
              disabled={!exportsUnlocked || resumeExportFormat === "pdf"}
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
        {resumeState.complianceError ? (
          <ComplianceViolationPanel error={resumeState.complianceError} />
        ) : null}
        {resumeState.error ? (
          <Alert intent="error" title="Resume unavailable">
            {resumeState.error}
          </Alert>
        ) : null}

        <p className="text-sm text-slate-300">
          {exportsUnlocked
            ? "Your score meets the export threshold."
            : `Score must reach ${autoGenerateThreshold} before downloads unlock.`}
        </p>

        {resumeState.response ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            {resumeWarningFlags.length ? (
              <ComplianceFlagPanel
                title="Compliance warnings"
                description="The resume draft included these advisory flags."
                flags={resumeWarningFlags}
                intent="warning"
                auditId={resumeAuditId}
              />
            ) : null}
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
              {resumeStructuredPreview ?? (
                <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
                  {resumePreviewText}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="No resume generated yet" body="Generate a draft to preview it." />
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Cover letter</h2>
            <p className="text-sm text-slate-300">
              Generate a cover letter draft with an industry-aligned closing template.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FormButton onClick={handleCoverDraft} disabled={!readyForDocuments || coverGenerating}>
              {coverGenerating ? "Generating..." : "Generate draft"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportCoverLetter("docx")}
              disabled={!exportsUnlocked || coverExportFormat === "docx"}
            >
              {coverExportFormat === "docx" ? "Downloading..." : "Download DOCX"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportCoverLetter("pdf")}
              disabled={!exportsUnlocked || coverExportFormat === "pdf"}
            >
              {coverExportFormat === "pdf" ? "Downloading..." : "Download PDF"}
            </FormButton>
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm text-slate-400">
          Closing template
          <select
            className="rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
            value={closingTemplateKey}
            onChange={(event) => setClosingTemplateKey(event.target.value)}
          >
            {coverLetterClosingTemplates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
        </label>

        {selectedClosingTemplate ? (
          <p className="text-sm text-slate-300">{selectedClosingTemplate.text}</p>
        ) : null}

        {generationMessage ? (
          <Alert intent="warning" title="Prerequisites missing">
            {generationMessage}
          </Alert>
        ) : null}

        {coverState.tierGateError ? (
          <Alert intent="warning">
            {coverState.tierGateError.message ??
              "Cover letter export is limited by your subscription tier."}
          </Alert>
        ) : null}
        {coverState.complianceError ? (
          <ComplianceViolationPanel error={coverState.complianceError} />
        ) : null}
        {coverState.error ? (
          <Alert intent="error" title="Cover letter unavailable">
            {coverState.error}
          </Alert>
        ) : null}

        <p className="text-sm text-slate-300">
          {exportsUnlocked
            ? "Your score meets the export threshold."
            : `Score must reach ${autoGenerateThreshold} before downloads unlock.`}
        </p>

        {coverState.response ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            {coverWarningFlags.length ? (
              <ComplianceFlagPanel
                title="Compliance warnings"
                description="The cover letter draft included these advisory flags."
                flags={coverWarningFlags}
                intent="warning"
                auditId={coverAuditId}
              />
            ) : null}
            <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
              {coverPreviewText}
            </pre>
          </div>
        ) : (
          <EmptyState
            title="No cover letter generated yet"
            body="Generate a draft to preview it."
          />
        )}
      </section>
    </PageShell>
  );
}
