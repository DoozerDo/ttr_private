"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/Alert";
import {
  ComplianceFlagPanel,
  ComplianceViolationPanel,
  type ComplianceFlag,
} from "@/components/ComplianceViolationPanel";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { DocumentStrategyPlanSummary } from "@/components/DocumentStrategyPlanSummary";
import { buildExportPayload } from "../lib/exportPayload";
import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
import { readLastAnalysis, type StoredAnalysisRecord } from "../lib/session";
import { useEntitlements } from "@/src/lib/entitlements";
import { listJobs } from "@/lib/jobsClient";
import type { JobDto } from "@/lib/jobs";
import type { BaselineDto } from "@/lib/baselines";

type AnyObject = Record<string, unknown>;

type DocumentState = {
  response: unknown | null;
  error: string | null;
  tierGateError: TierGateError | null;
  complianceError: ParsedComplianceError | null;
};

const createDocumentState = (): DocumentState => ({
  response: null,
  error: null,
  tierGateError: null,
  complianceError: null,
});

const DOCUMENT_LABEL = "cover letter";
const DOCUMENT_CAPITALIZED = "Cover letter";
const DOWNLOAD_NAME = "cover-letter";
const COPY_LABEL = "Copy cover letter text";

type CoverLetterJobContextPayload = {
  allowedCompanies?: string[];
  allowedRoleTitles?: string[];
};

type CoverLetterPayload = {
  jobId?: string | null;
  baselineId?: string | null;
  baselineVersionId?: string | null;
  oneTap: boolean;
  documentType: "COVER_LETTER";
  jobContext?: CoverLetterJobContextPayload;
  [key: string]: unknown;
};

function extractUnknownMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { message?: unknown; error?: unknown; msg?: unknown; description?: unknown };
  if (typeof candidate.message === "string" && candidate.message.trim().length) return candidate.message;
  if (Array.isArray(candidate.message) && candidate.message.length) {
    return candidate.message.filter((item): item is string => typeof item === "string").join(", ");
  }
  if (typeof candidate.error === "string") return candidate.error;
  if (typeof candidate.msg === "string") return candidate.msg;
  if (typeof candidate.description === "string") return candidate.description;
  return undefined;
}

export default function CoverLettersPage() {
  const [analysisRecord, setAnalysisRecord] = useState<StoredAnalysisRecord | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [documentState, setDocumentState] = useState<DocumentState>(() => createDocumentState());
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [exportState, setExportState] = useState<{ format: "docx" | "pdf" } | null>(null);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [baselineDetail, setBaselineDetail] = useState<BaselineDto | null>(null);
  const { isPro } = useEntitlements();

  useEffect(() => {
    const stored = readLastAnalysis();
    if (stored) {
      setAnalysisRecord(stored);
      setRestoredAt(stored.savedAt);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadJobs = async () => {
      try {
        const fetched = await listJobs({ includeArchived: true });
        if (!cancelled) {
          setJobs(Array.isArray(fetched) ? fetched : []);
        }
      } catch {
        if (!cancelled) {
          setJobs([]);
        }
      }
    };
    void loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  const jobId = useMemo(
    () =>
      readStringFromPaths(analysisRecord, [
        ["jobId"],
        ["analysis", "jobId"],
        ["analysis", "job_id"],
      ]),
    [analysisRecord],
  );

  const baselineId = useMemo(
    () =>
      readStringFromPaths(analysisRecord, [
        ["baselineId"],
        ["analysis", "baselineId"],
        ["analysis", "baseline_id"],
      ]),
    [analysisRecord],
  );

  const baselineVersionId = useMemo(
    () =>
      readStringFromPaths(analysisRecord, [
        ["baselineVersionId"],
        ["analysis", "baselineVersionId"],
        ["analysis", "baseline_version_id"],
      ]),
    [analysisRecord],
  );

  const jobTitle = useMemo(
    () =>
      readStringFromPaths(analysisRecord, [
        ["jobTitle"],
        ["analysis", "jobTitle"],
        ["analysis", "job_title"],
        ["analysis", "job", "title"],
        ["analysis", "job", "jobTitle"],
        ["analysis", "job", "roleTitle"],
      ]),
    [analysisRecord],
  );

  const jobCompany = useMemo(
    () =>
      readStringFromPaths(analysisRecord, [
        ["company"],
        ["analysis", "company"],
        ["analysis", "employer"],
        ["analysis", "job", "company"],
        ["analysis", "job", "companyName"],
        ["analysis", "job", "company_name"],
      ]),
    [analysisRecord],
  );

  const resolvedJob = useMemo(() => {
    if (!jobId) return null;
    return jobs.find((job) => job.id === jobId) ?? null;
  }, [jobId, jobs]);

  useEffect(() => {
    const activeBaselineId = baselineId || analysisRecord?.baselineId;
    if (!activeBaselineId) {
      setBaselineDetail(null);
      return;
    }
    let cancelled = false;
    const loadBaselineDetail = async () => {
      try {
        const response = await fetch(`/api/baselines/${encodeURIComponent(activeBaselineId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
          setBaselineDetail(null);
          return;
        }
        setBaselineDetail(payload as BaselineDto);
      } catch {
        if (!cancelled) {
          setBaselineDetail(null);
        }
      }
    };
    void loadBaselineDetail();
    return () => {
      cancelled = true;
    };
  }, [analysisRecord?.baselineId, baselineId]);

  const jobContextPayload = useMemo(() => {
    const title = normalizeJobContextValue(jobTitle);
    const company = normalizeJobContextValue(jobCompany);
    const context: CoverLetterJobContextPayload = {};
    if (company) context.allowedCompanies = [company];
    if (title) context.allowedRoleTitles = [title];
    return Object.keys(context).length ? context : undefined;
  }, [jobCompany, jobTitle]);

  function buildCoverLetterPayload(oneTap: boolean): CoverLetterPayload {
    return buildExportPayload({
      documentType: "COVER_LETTER",
      oneTap,
      jobId,
      baselineId,
      baselineVersionId,
      extra: {
        documentStrategyPlan,
        ...(jobContextPayload ? { jobContext: jobContextPayload } : {}),
      },
    }) as CoverLetterPayload;
  }

  const readyForDocument = Boolean(jobId && baselineVersionId);

  const latestScore = useMemo(() => resolveAnalysisScore(analysisRecord), [analysisRecord]);

  const verdict = useMemo(() => {
    if (!analysisRecord) return null;
    if (typeof analysisRecord.verdict === "string" && analysisRecord.verdict.trim()) {
      return analysisRecord.verdict.trim();
    }
    if (typeof analysisRecord.analysis.verdict === "string" && analysisRecord.analysis.verdict.trim()) {
      return analysisRecord.analysis.verdict.trim();
    }
    return null;
  }, [analysisRecord]);

  const analysisSummary = useMemo(
    () => readStringFromPaths(analysisRecord, [["summary"], ["analysis", "summary"]]),
    [analysisRecord],
  );
  const documentStrategyPlan = useMemo(
    () =>
      buildDocumentStrategyPlan({
        fitScore: latestScore,
        jobTitle: resolvedJob?.title ?? jobTitle ?? null,
        jobCompany: resolvedJob?.company ?? jobCompany ?? null,
        jobDescription: resolvedJob?.rawDescription ?? resolvedJob?.description ?? null,
        jobRequirements: resolvedJob?.normalizedRequirements ?? [],
        jobResponsibilities: resolvedJob?.normalizedResponsibilities ?? [],
        analysisSummary,
        analysisStrengths: Array.isArray(analysisRecord?.analysis?.strengths)
          ? analysisRecord.analysis.strengths
          : null,
        analysisGaps: Array.isArray(analysisRecord?.analysis?.gaps)
          ? analysisRecord.analysis.gaps
          : null,
        analysisRecommendedActions: Array.isArray(analysisRecord?.analysis?.recommendedActions)
          ? analysisRecord.analysis.recommendedActions
          : null,
        baselineSections: baselineDetail?.sections ?? [],
      }),
    [
      analysisRecord?.analysis?.gaps,
      analysisRecord?.analysis?.recommendedActions,
      analysisRecord?.analysis?.strengths,
      analysisSummary,
      baselineDetail,
      jobCompany,
      jobTitle,
      latestScore,
      resolvedJob,
    ],
  );

  const documentResponse = (documentState.response as AnyObject | null) ?? null;

  const warningFlags = useMemo<ComplianceFlag[]>(() => {
    const flags = Array.isArray(documentResponse?.compliance_flags)
      ? (documentResponse?.compliance_flags as unknown[])
      : [];

    const results: ComplianceFlag[] = [];
    for (const flag of flags) {
      if (!flag || typeof flag !== "object") continue;
      const entry = flag as AnyObject;
      const severity =
        typeof entry.severity === "string"
          ? entry.severity
          : typeof entry.flagSeverity === "string"
            ? entry.flagSeverity
            : undefined;
      if ((severity ?? "warn").toLowerCase() === "block") {
        continue;
      }
      const message =
        typeof entry.message === "string"
          ? entry.message
          : typeof entry.msg === "string"
            ? entry.msg
            : typeof entry.description === "string"
              ? entry.description
              : "";
      if (!message.length) continue;
      const code =
        typeof entry.code === "string"
          ? entry.code
          : typeof entry.flagCode === "string"
            ? entry.flagCode
            : undefined;

      results.push({
        code,
        message,
        severity,
      });
    }

    return results;
  }, [documentResponse?.compliance_flags]);

  const documentPreviewText = useMemo(() => {
    if (!documentState.response) return "";
    const direct = extractBestResumeText(documentState.response);
    if (direct) return direct;
    return safeJsonPreview(documentState.response);
  }, [documentState.response]);

  async function generateDraft() {
    if (!readyForDocument) {
      setDocumentState((prev) => ({
        ...prev,
        error: `Load the latest analysis before generating a ${DOCUMENT_LABEL}.`,
      }));
      return;
    }

    setLoadingDraft(true);
    setDocumentState((prev) => ({
      ...prev,
      response: null,
      error: null,
      tierGateError: null,
      complianceError: null,
    }));

    try {
      const payload = buildCoverLetterPayload(false);

      const res = await fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorPayload = await readResponsePayload(res);
        const tierGate = parseTierGateError({ status: res.status, payload: errorPayload });
        if (tierGate) {
          setDocumentState((prev) => ({ ...prev, tierGateError: tierGate }));
          return;
        }

        const compliance = parseComplianceError({ status: res.status, payload: errorPayload });
        if (compliance) {
          setDocumentState((prev) => ({ ...prev, complianceError: sanitizeComplianceError(compliance) }));
          return;
        }

        throw new Error(formatErrorMessage(errorPayload, `${DOCUMENT_CAPITALIZED} generation failed`));
      }

      const json = await res.json();
      setDocumentState((prev) => ({ ...prev, response: json }));
    } catch (error: unknown) {
      const message =
        extractUnknownMessage(error) ?? `${DOCUMENT_CAPITALIZED} generation failed`;
      setDocumentState((prev) => ({
        ...prev,
        error: message,
      }));
    } finally {
      setLoadingDraft(false);
    }
  }

  async function exportDocument(format: "docx" | "pdf") {
    if (!readyForDocument) {
      setDocumentState((prev) => ({
        ...prev,
        error: `Load the latest analysis before exporting a ${DOCUMENT_LABEL}.`,
      }));
      return;
    }

    if (!isPro) {
      setDocumentState((prev) => ({
        ...prev,
        error: "Upgrade to Pro to download documents.",
      }));
      return;
    }

    setExportState({ format });
    setDocumentState((prev) => ({
      ...prev,
      error: null,
      tierGateError: null,
      complianceError: null,
    }));

    const payload = buildCoverLetterPayload(true);

    try {
      const res = await fetch(`/api/cover-letters/export?format=${encodeURIComponent(format)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorPayload = await readResponsePayload(res);
        const tierGate = parseTierGateError({ status: res.status, payload: errorPayload });
        if (tierGate) {
          setDocumentState((prev) => ({ ...prev, tierGateError: tierGate }));
          return;
        }

        const compliance = parseComplianceError({ status: res.status, payload: errorPayload });
        if (compliance) {
          setDocumentState((prev) => ({ ...prev, complianceError: sanitizeComplianceError(compliance) }));
          return;
        }

        throw new Error(formatErrorMessage(errorPayload, `${DOCUMENT_CAPITALIZED} export failed`));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${DOWNLOAD_NAME}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const message = extractUnknownMessage(error) ?? `${DOCUMENT_CAPITALIZED} export failed`;
      setDocumentState((prev) => ({
        ...prev,
        error: message,
      }));
    } finally {
      setExportState(null);
    }
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Cover letters"
          description="Generate a cover letter draft from your latest analysis, preview it inline, and export when ready."
        />

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Latest analysis</p>
              <h2 className="text-lg font-semibold text-slate-100">Fit score</h2>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Snapshot</span>
          </div>

          <div className="flex items-end gap-6">
            <p className="text-4xl font-semibold text-white">{latestScore !== null ? latestScore.toFixed(1) : "n/a"}</p>
            <div className="space-y-1 text-sm text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                {verdict ?? "Verdict pending"}
              </p>
              {analysisSummary ? <p>{analysisSummary}</p> : null}
            </div>
          </div>

          {restoredAt ? (
            <p className="text-xs text-slate-400">Restored from your last session: {new Date(restoredAt).toLocaleString()}</p>
          ) : null}

        {!analysisRecord ? (
          <EmptyState
            title="No analysis yet"
              body={
                <>
                  Load the latest analysis in the{" "}
                  <Link href="/results" className="text-sky-300 underline">
                    Resume builder
                  </Link>{" "}
                  to generate cover letters.
                </>
              }
              cta={null}
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          ) : (
          <p className="text-sm text-slate-300">
            {readyForDocument
              ? "The latest analysis is ready for cover letter drafting."
              : "Generate the latest analysis in the Resume builder to unlock downloads."}
          </p>
        )}

        {analysisRecord ? <DocumentStrategyPlanSummary plan={documentStrategyPlan} /> : null}
      </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex flex-wrap gap-3">
            <FormButton onClick={() => void generateDraft()} disabled={!readyForDocument || loadingDraft}>
              {loadingDraft ? "Generating..." : `Generate draft ${DOCUMENT_LABEL}`}
            </FormButton>

            <FormButton
              variant="secondary"
              onClick={() => void exportDocument("docx")}
              disabled={!readyForDocument || !isPro || exportState?.format === "docx"}
            >
              {exportState?.format === "docx" ? "Downloading..." : "Download DOCX"}
            </FormButton>

            <FormButton
              variant="secondary"
              onClick={() => void exportDocument("pdf")}
              disabled={!readyForDocument || !isPro || exportState?.format === "pdf"}
            >
              {exportState?.format === "pdf" ? "Downloading..." : "Download PDF"}
            </FormButton>
          </div>

          <p className="text-sm text-slate-300">
            {isPro
              ? "Downloads are available."
              : "Upgrade to Pro to download documents."}
          </p>

          {documentState.tierGateError ? (
            <p className="text-sm text-amber-300">
              {documentState.tierGateError.message ?? `${DOCUMENT_CAPITALIZED} export is limited by your plan.`}{" "}
              <Link href="/pricing" className="font-semibold text-white underline">
                View plans
              </Link>
              .
            </p>
          ) : null}

          {documentState.complianceError?.type === "insufficient_extracted_text" ? (
            <InsufficientExtractedText error={documentState.complianceError} />
          ) : documentState.complianceError ? (
            <ComplianceViolationPanel error={documentState.complianceError} />
          ) : null}

          {documentState.error ? (
            <Alert intent="error" title={`Unable to process ${DOCUMENT_LABEL}`}>
              {documentState.error}
            </Alert>
          ) : null}

          {documentState.response ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
              {warningFlags.length ? (
                <ComplianceFlagPanel
                  title="Compliance warnings"
                  description={`${DOCUMENT_CAPITALIZED} generated with compliance notices.`}
                  flags={warningFlags}
                  intent="warning"
                />
              ) : null}

              <div className="mt-3 flex justify-end">
                <FormButton
                  variant="secondary"
                  onClick={() => {
                    if (!documentPreviewText) return;
                    void navigator.clipboard.writeText(documentPreviewText);
                  }}
                  disabled={!documentPreviewText}
                >
                  {COPY_LABEL}
                </FormButton>
              </div>

              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
                {documentPreviewText}
              </pre>
            </div>
          ) : (
            <EmptyState
              title={`No ${DOCUMENT_LABEL} generated yet`}
              body="Generate a draft to preview it here."
              cta={null}
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          )}
        </section>
      </div>
    </PageShell>
  );
}

function resolveAnalysisScore(record: StoredAnalysisRecord | null): number | null {
  if (!record) return null;
    if (typeof record.fitScore === "number") return record.fitScore;
    const analysis = record.analysis;
    if (typeof analysis.scoring_v2?.score === "number") return analysis.scoring_v2.score;
    if (typeof analysis.score === "number") return analysis.score;
  if (typeof analysis.fit_score === "number") return analysis.fit_score;
  if (typeof analysis.overallScore === "number") return analysis.overallScore;
  if (typeof analysis.overall_score === "number") return analysis.overall_score;
  return null;
}

function readStringFromPaths(record: StoredAnalysisRecord | null, paths: string[][]): string | null {
  if (!record) return null;
  for (const path of paths) {
    const value = getValueAtPath(record as AnyObject, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getValueAtPath(source: AnyObject, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function sanitizeComplianceError(error: ParsedComplianceError): ParsedComplianceError {
  return {
    ...error,
    auditId: undefined,
    baselineVersionHash: undefined,
  };
}

type ResumeSectionLike = {
  type?: string | null;
  title?: string | null;
  content?: unknown;
  text?: unknown;
  lines?: unknown;
  bullets?: unknown;
};

function stripInternalKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalKeys);

  if (value && typeof value === "object") {
    const obj = value as AnyObject;
    const out: AnyObject = {};
    for (const [key, nested] of Object.entries(obj)) {
      const lower = key.toLowerCase();

      const looksInternal =
        lower.includes("audit") ||
        lower.includes("hash") ||
        lower === "jobid" ||
        lower === "baselineid" ||
        lower === "baselineversionid" ||
        lower.endsWith("_id") ||
        lower === "id";

      if (looksInternal) continue;

      out[key] = stripInternalKeys(nested);
    }
    return out;
  }

  return value;
}

function coercePreviewText(payload: unknown): string | null {
  const obj = payload as AnyObject | null;

  const candidates = ["previewText", "preview_text", "text", "rawText", "raw_text", "content"];

  for (const candidate of candidates) {
    const value = obj?.[candidate];
    if (typeof value === "string" && value.trim().length) return value.trim();
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

function stringsOnly(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeJobContextValue(value?: string | null): string | undefined {
  if (!value) return undefined;

  const cleaned = value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  return cleaned.length ? cleaned : undefined;
}

function extractSectionText(section: ResumeSectionLike): string {
  const directCandidates: unknown[] = [section.content, section.text];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim().length) return candidate.trim();
  }

  const lines = stringsOnly(section.lines);
  if (lines.length) return lines.join("\n");

  const bullets = stringsOnly(section.bullets);
  if (bullets.length) return bullets.map((line) => `- ${line}`).join("\n");

  return "";
}

function extractBestResumeText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const direct = coercePreviewText(payload);
  if (direct) return direct;

  const obj = payload as Record<string, unknown>;
  const sectionsRaw = obj["sections"];
  if (!Array.isArray(sectionsRaw)) return null;

  const sections = sectionsRaw as ResumeSectionLike[];

  const rawSection =
    sections.find((section) => (section.type ?? "").toString().toUpperCase() === "RAW") ??
    sections.find((section) => (section.title ?? "").toString().toUpperCase() === "RAW");

  const picked = rawSection ?? sections[0];
  if (!picked) return null;

  const text = extractSectionText(picked);
  return text.length ? text : null;
}
