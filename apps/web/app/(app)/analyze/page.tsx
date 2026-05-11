"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { FormButton, SecondaryActionLink } from "@/components/FormButton";
import { PageShell } from "@/components/PageShell";
import { ScoreGauge } from "@/components/ScoreGauge";
import type { BaselineDto } from "@/lib/baselines";
import { setCurrentBaseline } from "@/lib/baselines";
import type { JobDto } from "@/lib/jobs";
import type { AnalysisResult, JobSourceType, StoredAnalysisRecord } from "../lib/session";
import {
  normalizeAnalysisResult,
  readLastAnalysis as readStoredAnalysis,
  saveLastAnalysis,
} from "../lib/session";
import { publishBaselineUpdated } from "@/src/lib/baseline-sync";
import { sanitizeRenderedTextValue } from "@/lib/renderedText";

const GENERATION_SCORE_THRESHOLD = 70;
const TIMESTAMP_KEYS = [
  "evaluatedAt",
  "evaluated_at",
  "completedAt",
  "completed_at",
  "createdAt",
  "created_at",
  "analysisAt",
  "analysis_at",
];

function latestVersionId(baseline?: BaselineDto) {
  if (!baseline?.versions?.length) return "";
  const sorted = [...baseline.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  return sorted[0]?.id ?? "";
}

function resolveScore(analysis: AnalysisResult | null): number | null {
  if (!analysis) return null;
  if (typeof analysis.scoring_v2?.score === "number") return analysis.scoring_v2.score;
  return null;
}

function isCanonicalCompletedAnalysis(
  analysis: AnalysisResult | null,
  selectedBaselineId: string,
): analysis is AnalysisResult & { assessmentId: string; baselineId: string } {
  if (!analysis) return false;
  const assessmentId =
    typeof analysis.assessmentId === "string" ? analysis.assessmentId.trim() : "";
  const baselineId =
    typeof analysis.baselineId === "string" ? analysis.baselineId.trim() : "";
  return Boolean(assessmentId && baselineId && baselineId === selectedBaselineId);
}

function resolveTimestamp(analysis: AnalysisResult | null, fallback: string | null): string | null {
  if (analysis) {
    for (const key of TIMESTAMP_KEYS) {
      const value = (analysis as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        return sanitizeRenderedTextValue(value, {
          endpoint: "analyze",
          field: key,
        });
      }
    }
  }
  return fallback;
}

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

function getAlignmentLabel(score: number | null): string {
  if (score === null) return "Alignment pending";
  if (score >= 90) return "Strong Alignment";
  if (score >= 70) return "Moderate Alignment";
  return "Limited Alignment";
}

function truncateText(value: string, limit = 180) {
  const cleaned = sanitizeRenderedTextValue(value, {
    endpoint: "analyze",
    field: "truncateText",
  });
  if (cleaned.length <= limit) return cleaned;
  return sanitizeRenderedTextValue(`${cleaned.slice(0, limit).trim()}…`, {
    endpoint: "analyze",
    field: "truncateText.output",
  });
}

type BaselineInputCardProps = {
  baselines: BaselineDto[];
  baselineId: string;
  loading: boolean;
  error: string | null;
  selectedBaseline?: BaselineDto;
  onBaselineChange: (value: string) => void;
};

function BaselineInputCard({
  baselines,
  baselineId,
  loading,
  error,
  selectedBaseline,
  onBaselineChange,
}: BaselineInputCardProps) {
  return (
    <div className="flex min-h-[220px] flex-col gap-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Baseline Resume</p>
        {selectedBaseline ? (
          <SecondaryActionLink href="/baseline" className="text-[10px] uppercase tracking-[0.3em]">
            Manage
          </SecondaryActionLink>
        ) : null}
      </div>
      <div className="flex flex-1 items-center justify-center">
        {selectedBaseline ? (
          <div className="w-full">
            <p className="text-lg font-semibold text-white">{selectedBaseline.originalFilename}</p>
            <p className="text-sm text-slate-400">
              Uploaded {formatTimestamp(selectedBaseline.createdAt) ?? "—"}
            </p>
          </div>
        ) : (
          <div className="text-center text-sm text-slate-300">
            <p>Add a baseline resume to power this assessment.</p>
            <div className="mt-3 flex justify-center">
              <SecondaryActionLink href="/baseline">Add baseline</SecondaryActionLink>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <label htmlFor="baseline-picker" className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
          Selected baseline
        </label>
        <select
          id="baseline-picker"
          className="w-full rounded-xl border border-slate-700 bg-transparent px-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none"
          value={baselineId}
          onChange={(event) => onBaselineChange(event.target.value)}
          disabled={loading}
        >
          <option value="">{loading ? "Loading baselines…" : "Select a baseline"}</option>
          {baselines.map((baseline) => (
            <option key={baseline.id} value={baseline.id}>
              {baseline.originalFilename}
            </option>
          ))}
        </select>
        {error ? (
          <p className="text-xs text-rose-400">{error}</p>
        ) : (
          <p className="text-xs text-slate-500">Choose the resume you want to compare with a job.</p>
        )}
      </div>
    </div>
  );
}

type JobInputCardProps = {
  jobs: JobDto[];
  jobsLoading: boolean;
  jobsError: string | null;
  jobId: string;
  jobDescription: string;
  selectedJob?: JobDto;
  onJobChange: (value: string) => void;
  onJobDescriptionChange: (value: string) => void;
};

function JobInputCard({
  jobs,
  jobsLoading,
  jobsError,
  jobId,
  jobDescription,
  selectedJob,
  onJobChange,
  onJobDescriptionChange,
}: JobInputCardProps) {
  return (
    <div className="flex min-h-[220px] flex-col gap-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Job Description</p>
      {!selectedJob && jobs.length ? (
        <div className="space-y-2">
          <label htmlFor="job-select" className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
            Saved job
          </label>
          <select
            id="job-select"
            value={jobId}
            onChange={(event) => onJobChange(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-transparent px-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none"
            disabled={jobsLoading}
          >
            <option value="">{jobsLoading ? "Loading jobs…" : "Select a saved job"}</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title || "Untitled role"} {job.company ? `· ${job.company}` : ""}
              </option>
            ))}
          </select>
          {jobsError ? <p className="text-xs text-rose-400">{jobsError}</p> : null}
        </div>
      ) : !selectedJob ? (
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">No saved jobs yet</p>
      ) : null}
      {selectedJob ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-lg font-semibold text-white">{selectedJob.title || "Untitled role"}</p>
          <p className="text-sm text-slate-400">{selectedJob.company ?? "Company not provided"}</p>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Added {formatTimestamp(selectedJob.createdAt) ?? "—"}
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-300">
          <textarea
            value={jobDescription}
            onChange={(event) => onJobDescriptionChange(event.target.value)}
            placeholder="Paste the full job description you want to assess."
            rows={6}
            className="w-full resize-none rounded-xl border border-slate-700 bg-transparent px-3 py-3 text-sm text-white focus:border-slate-500 focus:outline-none"
          />
          <p className="text-xs text-amber-200">
            The pasted description powers the assessment when no saved job is selected.
          </p>
          <p className="text-xs text-slate-500">Characters: {jobDescription.length}</p>
        </div>
      )}
      {!selectedJob ? (
        <div className="flex justify-end">
          <SecondaryActionLink href="/jobs/new" className="text-[10px] uppercase tracking-[0.3em]">
            Add job
          </SecondaryActionLink>
        </div>
      ) : null}
    </div>
  );
}

type InputsSectionProps = {
  inputsReady: boolean;
  baselines: BaselineDto[];
  baselineId: string;
  baselineLoading: boolean;
  baselineError: string | null;
  selectedBaseline?: BaselineDto;
  onBaselineChange: (value: string) => void;
  jobs: JobDto[];
  jobsLoading: boolean;
  jobsError: string | null;
  jobId: string;
  jobDescription: string;
  selectedJob?: JobDto;
  onJobChange: (value: string) => void;
  onJobDescriptionChange: (value: string) => void;
};

function InputsSection({
  inputsReady,
  baselines,
  baselineId,
  baselineLoading,
  baselineError,
  selectedBaseline,
  onBaselineChange,
  jobs,
  jobsLoading,
  jobsError,
  jobId,
  jobDescription,
  selectedJob,
  onJobChange,
  onJobDescriptionChange,
}: InputsSectionProps) {
  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/40 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Inputs</p>
        <p className="text-xs text-slate-500">Single baseline · Single job</p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BaselineInputCard
          baselines={baselines}
          baselineId={baselineId}
          loading={baselineLoading}
          error={baselineError}
          selectedBaseline={selectedBaseline}
          onBaselineChange={onBaselineChange}
        />
        <JobInputCard
          jobs={jobs}
          jobsLoading={jobsLoading}
          jobsError={jobsError}
          jobId={jobId}
          jobDescription={jobDescription}
          selectedJob={selectedJob}
          onJobChange={onJobChange}
          onJobDescriptionChange={onJobDescriptionChange}
        />
      </div>
      {inputsReady ? <div className="mx-auto mt-6 h-px w-full max-w-4xl bg-slate-600/40" /> : null}
    </section>
  );
}

type CompatibilitySectionProps = {
  inputsReady: boolean;
  loading: boolean;
  score: number | null;
  animatedScore: number;
  assessmentId: string | null;
  alignmentLabel: string;
  timestampLabel: string | null;
  error: string | null;
  onAssess: () => void;
};

function CompatibilitySection({
  inputsReady,
  loading,
  score,
  animatedScore,
  assessmentId,
  alignmentLabel,
  timestampLabel,
  error,
  onAssess,
}: CompatibilitySectionProps) {
  return (
    <section
      className={`rounded-3xl border border-slate-700 bg-slate-900/30 p-6 transition-opacity duration-200 ${
        inputsReady ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Compatibility Assessment
        </p>
        {loading && <p className="text-xs text-slate-400">Assessing…</p>}
      </div>
      {error ? (
        <div className="mt-4">
          <Alert intent="error" title="Uh oh">
            {error}
          </Alert>
        </div>
      ) : null}
      {!inputsReady ? (
        <p className="mt-4 text-sm text-amber-200">Add both inputs to run assessment.</p>
      ) : null}
      {score !== null ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          <ScoreGauge score={animatedScore} loading={loading} />
          <p className="text-base font-semibold uppercase tracking-[0.3em] text-slate-400">Compatibility Score</p>
          <p className="text-3xl font-bold text-white">{score.toFixed(1)}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            {alignmentLabel}
          </p>
          <p className="text-xs text-slate-500">Last evaluated: {timestampLabel ?? "—"}</p>
          <p className="text-xs text-emerald-300">
            Analysis completed and saved{assessmentId ? ` · Assessment ${assessmentId}` : ""}.
          </p>
        </div>
      ) : inputsReady && !loading ? (
        <p className="mt-6 text-sm text-slate-400">
          Run the assessment to reveal your compatibility score based on the inputs above.
        </p>
      ) : null}
      <div className="mt-8 flex justify-center">
        <FormButton onClick={onAssess} disabled={!inputsReady || loading}>
          {loading ? "Assessing…" : "Generate Compatibility Score"}
        </FormButton>
      </div>
    </section>
  );
}

type OutputsSectionProps = {
  score: number;
  threshold: number;
  onGenerateResume: () => void;
  onGenerateCoverLetter: () => void;
  onViewDetails: () => void;
  canViewDetails: boolean;
};

function OutputsSection({
  score,
  threshold,
  onGenerateResume,
  onGenerateCoverLetter,
  onViewDetails,
  canViewDetails,
}: OutputsSectionProps) {
  const meetsThreshold = score >= threshold;
  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/30 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
        {meetsThreshold ? "Authorized Outputs" : "Next Steps"}
      </p>
      <p className="mt-2 text-sm text-slate-300">
        {meetsThreshold
          ? "Compatibility threshold met. You may generate application materials."
          : "Threshold not met. Review alignment gaps before generating materials."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {meetsThreshold ? (
          <>
            <FormButton onClick={onGenerateResume}>Generate Resume</FormButton>
            <FormButton variant="secondary" onClick={onGenerateCoverLetter}>
              Generate Cover Letter
            </FormButton>
          </>
        ) : (
          <FormButton variant="secondary" onClick={onViewDetails} disabled={!canViewDetails}>
            View assessment details
          </FormButton>
        )}
      </div>
    </section>
  );
}

function AssessmentHeader() {
  return (
    <div className="space-y-3 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Assessment</p>
      <h1 className="text-4xl font-semibold text-white">Role Compatibility Assessment</h1>
      <p className="mx-auto max-w-3xl text-base text-slate-300">
        Evaluate alignment between your baseline resume and a job description.
      </p>
    </div>
  );
}

export default function AnalyzePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [baselineVersionId, setBaselineVersionId] = useState("");
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [jobId, setJobId] = useState("");
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [jobDescription, setJobDescription] = useState("");
  const suggestedRole = useMemo(
    () =>
      sanitizeRenderedTextValue(searchParams?.get("suggestedRole") ?? "", {
        endpoint: "analyze",
        field: "suggestedRole",
      }),
    [searchParams],
  );
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);

  const selectedBaseline = useMemo(
    () => baselines.find((baseline) => baseline.id === baselineId) ?? undefined,
    [baselines, baselineId],
  );
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === jobId) ?? undefined,
    [jobs, jobId],
  );

  const hasBaseline = Boolean(baselineId);
  const hasSelectedJob = Boolean(jobId);
  const hasJobDescription = jobDescription.trim().length > 0;
  const inputsReady = hasBaseline && (hasSelectedJob || hasJobDescription);

  const resultScore = useMemo(() => resolveScore(result), [result]);
  const canonicalResult = useMemo(
    () => (isCanonicalCompletedAnalysis(result, baselineId) ? result : null),
    [result, baselineId],
  );
  const canonicalScore = useMemo(() => resolveScore(canonicalResult), [canonicalResult]);
  const alignmentLabel = getAlignmentLabel(canonicalScore);
  const timestampLabel = useMemo(
    () => formatTimestamp(resolveTimestamp(canonicalResult, restoredAt)),
    [canonicalResult, restoredAt],
  );

  const jobContextId = useMemo(
    () => (canonicalResult?.jobId || jobId).trim(),
    [canonicalResult?.jobId, jobId],
  );
  const analysisContextId = useMemo(
    () => (canonicalResult?.assessmentId ?? null)?.trim() || null,
    [canonicalResult?.assessmentId],
  );
  const baselineContextId = useMemo(
    () => (canonicalResult?.baselineId ?? baselineId ?? null)?.trim() || null,
    [baselineId, canonicalResult?.baselineId],
  );
  const resultsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (jobContextId) params.set("jobId", jobContextId);
    if (analysisContextId) params.set("analysisId", analysisContextId);
    if (baselineContextId) params.set("baselineId", baselineContextId);
    const query = params.toString();
    return query ? `/results?${query}` : "/results";
  }, [analysisContextId, baselineContextId, jobContextId]);
  const studioHref = useMemo(() => {
    if (!jobContextId) return "/studio";
    const params = new URLSearchParams();
    params.set("jobId", jobContextId);
    if (analysisContextId) params.set("analysisId", analysisContextId);
    if (baselineContextId) params.set("baselineId", baselineContextId);
    if (baselineVersionId) {
      params.set("baselineVersionId", baselineVersionId);
    }
    return `/studio?${params.toString()}`;
  }, [analysisContextId, baselineContextId, baselineVersionId, jobContextId]);
  const coverLetterHref = useMemo(() => {
    if (!jobContextId) return "/cover-letters";
    const params = new URLSearchParams();
    params.set("jobId", jobContextId);
    if (analysisContextId) params.set("analysisId", analysisContextId);
    if (baselineContextId) params.set("baselineId", baselineContextId);
    if (baselineVersionId) {
      params.set("baselineVersionId", baselineVersionId);
    }
    return `/cover-letters?${params.toString()}`;
  }, [analysisContextId, baselineContextId, baselineVersionId, jobContextId]);

  useEffect(() => {
    let cancelled = false;

    const loadBaselines = async () => {
      setBaselineLoading(true);
      setBaselineError(null);

      try {
        const response = await fetch("/api/baselines", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load baselines.");
        }

        const data = (await response.json()) as BaselineDto[];
        if (cancelled) return;

        setBaselines(data);

        const activeBaselineId =
          data.find((baseline) => baseline.status !== "ARCHIVED" && baseline.isActive === true)?.id ?? "";
        const requestedBaselineId = searchParams?.get("baselineId")?.trim() ?? "";
        const requestedBaseline = requestedBaselineId
          ? data.find((baseline) => baseline.id === requestedBaselineId) ?? null
          : null;

        if (data.length === 0) {
          setBaselineId("");
          return;
        }

        if (!activeBaselineId) {
          setBaselineId("");
          setBaselineError("Select a baseline to continue.");
          return;
        }

        if (requestedBaseline) {
          if (requestedBaseline.status === "ARCHIVED") {
            setBaselineId("");
            setBaselineError("That baseline is archived. Go to Baseline to restore or select your current baseline.");
            return;
          }
          if (requestedBaseline.id !== activeBaselineId) {
            setBaselineId("");
            setBaselineError("This link points to a baseline that isn’t your current baseline. Go to Baseline to switch your current baseline.");
            return;
          }
        } else if (requestedBaselineId) {
          setBaselineId("");
          setBaselineError("That baseline is unavailable. Go to Baseline to select your current baseline.");
          return;
        }

        setBaselineId(activeBaselineId);
      } catch (loadError) {
        if (cancelled) return;
        setBaselineError(loadError instanceof Error ? loadError.message : "Unable to load baselines.");
        setBaselines([]);
        setBaselineId("");
      } finally {
        if (!cancelled) setBaselineLoading(false);
      }
    };

    loadBaselines();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      setJobsLoading(true);
      setJobsError(null);

      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load saved jobs.");
        }

        const data = (await response.json()) as JobDto[];
        if (cancelled) return;

        setJobs(data);
        if (data.length === 0) {
          setJobId("");
          return;
        }

        setJobId((prev) => {
          if (prev && data.some((job) => job.id === prev)) return prev;
          return "";
        });
      } catch (loadError) {
        if (cancelled) return;
        setJobsError(loadError instanceof Error ? loadError.message : "Unable to load saved jobs.");
        setJobs([]);
        setJobId("");
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    };

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = baselines.find((baseline) => baseline.id === baselineId);
    setBaselineVersionId(latestVersionId(selected));
  }, [baselineId, baselines]);

  // Baseline identity is canonical and server-backed (isActive). Do not allow deep links to silently override it.

  useEffect(() => {
    const requestedJobId = searchParams?.get("jobId")?.trim() ?? "";
    if (!requestedJobId) return;
    if (!jobs.some((job) => job.id === requestedJobId)) return;
    setJobId(requestedJobId);
  }, [jobs, searchParams]);

  useEffect(() => {
    if (!suggestedRole) return;
    setJobDescription((current) => {
      if (current.trim().length > 0) return current;
      return `Target role: ${suggestedRole}\n\nPaste the job description here to analyze this role.`;
    });
  }, [suggestedRole]);

  useEffect(() => {
    const stored = readStoredAnalysis();
    if (!stored) return;
    const storedAssessmentId =
      typeof stored.analysis?.assessmentId === "string"
        ? stored.analysis.assessmentId.trim()
        : "";
    const storedBaselineId =
      typeof stored.analysis?.baselineId === "string"
        ? stored.analysis.baselineId.trim()
        : "";
    if (!storedAssessmentId || !storedBaselineId) {
      return;
    }

    setResult(stored.analysis);
      setRestoredAt(stored.savedAt);

      // Do not restore baseline identity from session storage (canonical baseline is server-backed isActive).

      if (stored.jobId) {
        const restoredJobId = stored.jobId;
        setJobId((current) => {
          if (current && current.length > 0) {
            return current;
          }
          return restoredJobId;
        });
      }
  }, []);

  useEffect(() => {
    if (loading) {
      setAnimatedScore(0);
      return;
    }
    if (canonicalScore !== null) {
      setAnimatedScore(0);
      const frame = requestAnimationFrame(() => setAnimatedScore(canonicalScore));
      return () => cancelAnimationFrame(frame);
    }
    setAnimatedScore(0);
  }, [loading, canonicalScore]);

  const handleAnalyze = useCallback(async () => {
    if (!hasBaseline || (!hasSelectedJob && !hasJobDescription)) {
      setError("Please select a baseline and add a job description before running the assessment.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let resolvedJobId = jobId;

      if (!hasSelectedJob && hasJobDescription) {
        const createResponse = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawDescription: jobDescription }),
        });

        const created = (await createResponse.json().catch(() => null)) as JobDto | { id?: string } | null;

        if (createResponse.status === 409) {
          const existingJobId = created?.id;
          setError("This job description already exists.");
          if (existingJobId) {
            setJobId(existingJobId);
          }
          return;
        }

        if (!createResponse.ok) {
          const rawMessage =
            created && typeof created === "object" && "message" in created
              ? (created as Record<string, unknown>).message
              : undefined;

          const message =
            typeof rawMessage === "string" && rawMessage.trim().length > 0
              ? rawMessage
              : "Unable to save this job description.";

          throw new Error(message);
        }

        const jobIdFromServer = (created as JobDto)?.id ?? (created as { id?: string })?.id;
        if (!jobIdFromServer) {
          throw new Error("Job creation response was incomplete.");
        }

        resolvedJobId = jobIdFromServer;
        setJobId(resolvedJobId);
      }

      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId, jobId: resolvedJobId }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to analyze this role right now.");
      }

      const raw = await response.json();
      const data = normalizeAnalysisResult(raw);
      const returnedAssessmentId =
        typeof data.assessmentId === "string" ? data.assessmentId.trim() : "";
      const returnedBaselineId =
        typeof data.baselineId === "string" ? data.baselineId.trim() : "";

      if ((data.status === undefined || data.status === "ok") && !returnedAssessmentId) {
        throw new Error("Analysis completed but no persisted assessment record was returned.");
      }

      if (returnedBaselineId && returnedBaselineId !== baselineId) {
        throw new Error("Analysis baseline linkage mismatch. Please retry.");
      }

      setResult(data);
      setRestoredAt(null);
      publishBaselineUpdated({ baselineId, source: "analysis" });

      const storedAt = new Date().toISOString();
      const jobForRecord = jobs.find((job) => job.id === resolvedJobId);
      const isSavedJob = Boolean(resolvedJobId && hasSelectedJob);
      const jobSourceType: JobSourceType = isSavedJob
        ? jobForRecord && (jobForRecord.jdIngestionMethod === "URL" || Boolean(jobForRecord.sourceUrl))
          ? "url"
          : "saved"
        : "pasted";
      const jobSourceUrl = jobForRecord?.sourceUrl ?? null;
      const fitScore = resolveScore(data);

      const record: StoredAnalysisRecord = {
        savedAt: storedAt,
        analysis: data,
        baselineId: baselineId || undefined,
        baselineVersionId: baselineVersionId || undefined,
        jobId: resolvedJobId || undefined,
        jobTitle: jobForRecord?.title ?? null,
        company: jobForRecord?.company ?? null,
        jobSource: {
          type: jobSourceType,
          url: jobSourceUrl,
        },
        fitScore,
        summary: typeof data.summary === "string" ? data.summary : undefined,
        verdict: typeof data.verdict === "string" ? data.verdict : undefined,
      };

      saveLastAnalysis(record);

      if (returnedAssessmentId) {
        await router.push(
          `/results?assessmentId=${encodeURIComponent(returnedAssessmentId)}&analysisId=${encodeURIComponent(
            returnedAssessmentId,
          )}`,
        );
      }
    } catch (analysisError) {
      setResult(null);
      setError(analysisError instanceof Error ? analysisError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [
    baselineId,
    hasBaseline,
    hasJobDescription,
    hasSelectedJob,
    jobDescription,
    jobId,
    jobs,
    router,
  ]);

  const handleBaselineChange = useCallback(
    async (nextBaselineId: string) => {
      setBaselineError(null);
      setBaselineId("");
      try {
        await setCurrentBaseline(nextBaselineId);
        setBaselineId(nextBaselineId);
      } catch (error) {
        setBaselineError(error instanceof Error ? error.message : "Unable to set current baseline.");
      }
    },
    [],
  );

  const handleGenerateResume = useCallback(() => {
    router.push(studioHref);
  }, [router, studioHref]);

  const handleGenerateCoverLetter = useCallback(() => {
    router.push(coverLetterHref);
  }, [router, coverLetterHref]);

  const handleViewDetails = useCallback(() => {
    router.push(resultsHref);
  }, [router, resultsHref]);

  return (
    <PageShell className="results-page-theme">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 py-10">
        <AssessmentHeader />
        <InputsSection
          inputsReady={inputsReady}
          baselines={baselines}
          baselineId={baselineId}
          baselineLoading={baselineLoading}
          baselineError={baselineError}
          selectedBaseline={selectedBaseline}
          onBaselineChange={handleBaselineChange}
          jobs={jobs}
          jobsLoading={jobsLoading}
          jobsError={jobsError}
          jobId={jobId}
          jobDescription={jobDescription}
          selectedJob={selectedJob}
          onJobChange={setJobId}
          onJobDescriptionChange={setJobDescription}
        />
        <CompatibilitySection
          inputsReady={inputsReady}
          loading={loading}
          score={canonicalScore}
          animatedScore={animatedScore}
          assessmentId={
            canonicalResult && typeof canonicalResult.assessmentId === "string"
              ? canonicalResult.assessmentId
              : null
          }
          alignmentLabel={alignmentLabel}
          timestampLabel={timestampLabel}
          error={error}
          onAssess={handleAnalyze}
        />
        {canonicalScore !== null ? (
          <OutputsSection
            score={canonicalScore}
            threshold={GENERATION_SCORE_THRESHOLD}
            onGenerateResume={handleGenerateResume}
            onGenerateCoverLetter={handleGenerateCoverLetter}
            onViewDetails={handleViewDetails}
            canViewDetails={Boolean(jobContextId)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}

