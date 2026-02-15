"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { type ComplianceFlag } from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ScoreGauge } from "@/components/ScoreGauge";
import {
  coverLetterClosingTemplates,
  defaultClosingTemplateKey,
} from "@/lib/coverLetters";
import { formatErrorMessage, readResponsePayload } from "@/lib/compliance/parseComplianceError";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
import { BaselineDto, BaselineVersionDto, listBaselines } from "@/lib/baselines";
import { BaselineBlockPolicyPanel } from "./BaselineBlockPolicyPanel";
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
  };
}

function normalizeCoverLetterContextValue(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const collapsed = trimmed.replace(/\s+/g, " ").toLowerCase();
  return collapsed || undefined;
}

function collectNormalizedContextValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeCoverLetterContextValue(value);
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
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

function readDuplicateCoverLetterId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const rawError = record.error;
  if (!rawError || typeof rawError !== "object") {
    return undefined;
  }
  const errorRecord = rawError as Record<string, unknown>;
  const code = typeof errorRecord.code === "string" ? errorRecord.code.trim() : undefined;
  if (code !== "COVER_LETTER_DUPLICATE") {
    return undefined;
  }
  const existingId = errorRecord.existingCoverLetterId;
  if (typeof existingId !== "string") {
    return undefined;
  }
  const trimmed = existingId.trim();
  return trimmed || undefined;
}

function readTrackerField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const value = record[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
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

function readContentValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const candidate = record.content;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
}

function extractCoverLetterText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const candidateFields: unknown[] = [
    record.content,
    record.letter,
    record.coverLetter,
    record.draft,
    record.generated,
  ];
  for (const candidate of candidateFields) {
    const value = readContentValue(candidate);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function buildCoverLetterParagraphs(payload: unknown): string[] {
  const text = extractCoverLetterText(payload);
  if (!text) return [];
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
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

function getFilenameFromContentDisposition(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const starMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch?.[1]) {
    try {
      return decodeURIComponent(starMatch[1]).trim();
    } catch {
      return starMatch[1].trim();
    }
  }

  const plainMatch = headerValue.match(/filename="?([^";]+)"?/i);
  const parsed = plainMatch?.[1]?.trim();
  return parsed || null;
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

const resumeSectionHeadingByType: Record<string, string> = {
  RAW: "Raw",
  SUMMARY: "Summary",
  EXPERIENCE: "Professional Experience",
  PROJECT: "Projects",
  SKILLS: "Technical Skills",
  EDUCATION: "Education",
  OTHER: "Summary",
};

function resolveResumeSectionHeading(section: ResumeSection) {
  const normalizedTitle = section.title?.trim();
  if (normalizedTitle && !/^other$/i.test(normalizedTitle)) {
    return normalizedTitle;
  }

  const typeKey = section.type?.toUpperCase();
  if (!typeKey) return normalizedTitle;
  return resumeSectionHeadingByType[typeKey] ?? typeKey;
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
        const heading = resolveResumeSectionHeading(section);
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

  const [closingTemplateKey, setClosingTemplateKey] = useState(defaultClosingTemplateKey);

  const router = useRouter();
  const trackerEntryId = readTrackerField(resumeState.response, "trackerEntryId");
  const trackerStatus = readTrackerField(resumeState.response, "trackerStatus");
  const handleOpenTracker = useCallback(() => {
    if (!trackerEntryId) return;
    void router.push(`/applications?focus=${encodeURIComponent(trackerEntryId)}`);
  }, [router, trackerEntryId]);

  const { isPro } = useEntitlements();

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId),
    [jobs, selectedJobId],
  );

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedBaselineVersionId),
    [versions, selectedBaselineVersionId],
  );
  const selectedVersionLabel = selectedVersion?.versionNumber
    ? `Version ${selectedVersion.versionNumber}`
    : "";

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

  const canExportDocuments = readyForDocuments && isPro;

  const verdictLabel = useMemo(() => mapVerdict(analysis?.verdict), [analysis?.verdict]);
  const analysisSummary = analysis?.summary;
  const resumePreviewText = useMemo(() => formatPreview(resumeState.response), [resumeState.response]);
  const resumeStructuredPreview = useMemo(
    () => buildResumePreview(resumeState.response),
    [resumeState.response],
  );
  const selectedClosingTemplate = useMemo(
    () => coverLetterClosingTemplates.find((template) => template.key === closingTemplateKey),
    [closingTemplateKey],
  );
  const coverLetterParagraphs = useMemo(
    () => buildCoverLetterParagraphs(coverState.response),
    [coverState.response],
  );
  const hasCoverLetterArtifact = Boolean(coverState.response);
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
      closingTemplateKey,
      documentType: "cover_letter",
      oneTap,
    };
    if (coverLetterJobContext) {
      payload.jobContext = coverLetterJobContext;
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
      setResumeState((current) => ({
        ...current,
        error: "Upgrade to Pro to download documents.",
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

          {selectedBaselineId ? (
            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Baseline version
              <select
                className="rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
                value={selectedBaselineVersionId}
                onChange={(event) => {
                  pendingVersionSelectionRef.current = null;
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

      {selectedBaselineId && selectedBaselineVersionId ? (
        <BaselineBlockPolicyPanel
          baselineId={selectedBaselineId}
          baselineVersionId={selectedBaselineVersionId}
          baselineVersionHash={selectedVersion?.fileHash ?? null}
          baselineVersionLabel={selectedVersionLabel}
          refreshSignal={versionRefreshSignal}
          onVersionAdvance={handleBlockPolicyVersionAdvance}
          onPoliciesSaved={refreshBlockPolicyList}
        />
      ) : null}

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Latest snapshot</p>
            <h2 className="text-lg font-semibold text-slate-100">CX fit score</h2>
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {isPro ? "Downloads available for Pro+" : "Upgrade to Pro to download documents."}
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
              disabled={!canExportDocuments || resumeExportFormat === "docx"}
            >
              {resumeExportFormat === "docx" ? "Downloading..." : "Download DOCX"}
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => void exportResume("pdf")}
              disabled={!canExportDocuments || resumeExportFormat === "pdf"}
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

        {isPro && coverState.response && !coverLetterComplianceBlocked ? (
          <p className="text-sm text-slate-300">Downloads are available.</p>
        ) : !isPro ? (
          <p className="text-sm text-slate-300">Upgrade to Pro to download documents.</p>
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
              {resumeStructuredPreview ?? (
                <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
                  {resumePreviewText}
                </pre>
              )}
            </div>
            {trackerEntryId ? (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200">
                  Next move
                </p>
                <p className="text-sm text-slate-100">
                  Added to Application Tracker as{' '}
                  <span className="font-semibold text-white">
                    {trackerStatus ?? 'Prepared'}
                  </span>
                  .
                </p>
                <div className="mt-3 flex justify-end">
                  <FormButton onClick={handleOpenTracker}>
                    Open Application Tracker
                  </FormButton>
                </div>
              </div>
            ) : null}
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
          <p className="text-sm text-slate-300">Downloads are available.</p>
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
              body="Generate a draft to preview it."
            />
          )
        ) : null}
      </section>
    </PageShell>
  );
}
