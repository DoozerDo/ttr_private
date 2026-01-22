"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { SetupModuleCard } from "./SetupModuleCard";

type WorkspaceRunnerProps = {
  baselineId: string | null;
  jobId: string | null;
};

type DimensionScoreValue = number | string | null | undefined;

type RunDebugInfo = {
  baselineId: string;
  baselineVersionHash: string | null;
  baselineSelectedSectionCount: number;
  baselineTotalChars: number;
  jobId: string | null;
  jobRawChars: number;
  normalizedResponsibilitiesCount: number;
  normalizedResponsibilitiesChars: number;
  normalizedRequirementsCount: number;
  normalizedRequirementsChars: number;
  dimensionScores: Record<string, DimensionScoreValue>;
  totalScore: number;
};

type FitResultPayload = {
  score?: number | null;
  verdict?: string | null;
  dimensionScores?: Record<string, DimensionScoreValue> | DimensionScoreValue[] | null;
  complianceFlags?: unknown[] | null;

  createdAt?: string | null;
  updatedAt?: string | null;
  assessedAt?: string | null;
  runAt?: string | null;
  timestamp?: string | null;
  debug?: RunDebugInfo | null;
  scoringProof?: ScoringProofPayload | null;

  [key: string]: unknown;
};

type ScoringProofPayload = {
  assessmentId?: string | null;
  baselineTextCharsScored?: number;
  jobTextCharsScored?: number;
  truncationAppliedBaseline?: boolean;
  truncationAppliedJob?: boolean;
  normalizedResponsibilitiesCount?: number;
  normalizedRequirementsCount?: number;
  jobRawTextCharCount?: number | null;
  jobRawTextSha256?: string | null;
  jobRawTextTooShort?: boolean | null;
  jobRawTextWarning?: string | null;
};

type ResultsUrlArgs = {
  assessmentId?: string | null;
  jobId?: string | null;
  baselineId?: string | null;
};

export function buildResultsUrl({
  assessmentId,
  jobId,
  baselineId,
}: ResultsUrlArgs): string | null {
  const normalizedAssessmentId = assessmentId?.trim();
  if (normalizedAssessmentId) {
    return `/results?assessmentId=${encodeURIComponent(normalizedAssessmentId)}`;
  }

  const normalizedJobId = jobId?.trim();
  const normalizedBaselineId = baselineId?.trim();

  if (normalizedJobId && normalizedBaselineId) {
    return `/results?jobId=${encodeURIComponent(normalizedJobId)}&baselineId=${encodeURIComponent(
      normalizedBaselineId,
    )}`;
  }

  if (normalizedJobId) {
    return `/results?jobId=${encodeURIComponent(normalizedJobId)}`;
  }

  return null;
}

const formatDimensionEntries = (
  payload: FitResultPayload,
): [string, DimensionScoreValue][] => {
  const entries: [string, DimensionScoreValue][] = [];
  const dims = payload.dimensionScores;

  if (Array.isArray(dims)) {
    dims.forEach((value, index) => {
      entries.push([`Dimension ${index + 1}`, value]);
    });
    return entries;
  }

  if (dims && typeof dims === "object") {
    Object.entries(dims).forEach(([key, value]) => {
      entries.push([key, value]);
    });
  }

  return entries;
};

const renderDimensionValue = (value: DimensionScoreValue): string => {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "n/a";
  }
};

const formatProofNumber = (value?: number | null) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return "n/a";
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (payload && typeof payload === "object") {
    const candidate = (payload as Record<string, unknown>).message;
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate;
    }
  }
  return null;
};

const pickTimestamp = (payload: FitResultPayload | null): string | null => {
  if (!payload) return null;

  const candidates = [
    payload.assessedAt,
    payload.runAt,
    payload.createdAt,
    payload.updatedAt,
    payload.timestamp,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) return candidate;
  }

  return null;
};

const formatTimestamp = (value: string | null): string => {
  if (!value) return "Not yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export function WorkspaceRunner({ baselineId, jobId }: WorkspaceRunnerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingLastRun, setIsLoadingLastRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FitResultPayload | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [completeBanner, setCompleteBanner] = useState<string | null>(null);
  const [latestAssessmentId, setLatestAssessmentId] = useState<string | null>(null);
  const [latestJobId, setLatestJobId] = useState<string | null>(null);
  const [latestBaselineId, setLatestBaselineId] = useState<string | null>(null);
  const router = useRouter();

  const dimensionEntries = useMemo(
    () => (result ? formatDimensionEntries(result) : []),
    [result],
  );

  const flagList = useMemo(() => {
    const flags = result?.complianceFlags;
    if (!Array.isArray(flags)) return [];
    return flags.map((flag) =>
      typeof flag === "string" ? flag : (() => {
        try {
          return JSON.stringify(flag);
        } catch {
          return String(flag);
        }
      })(),
    );
  }, [result]);

  const canRun = Boolean(baselineId) && Boolean(jobId) && !isRunning;
  const showLoadLastRun = Boolean(baselineId) && Boolean(jobId);
  const showResult = Boolean(result);

  const scoreValueText =
    typeof result?.score === "number" ? result.score.toFixed(1) : "n/a";

  const isDevMode = process.env.NODE_ENV !== "production";
  const debugUiEnabled = isDevMode || process.env.NEXT_PUBLIC_DEBUG_UI === "true";
  const runDebugInfo = debugUiEnabled && result?.debug ? result.debug : null;

  const viewResultsHref = buildResultsUrl({
    assessmentId: latestAssessmentId,
    jobId: latestJobId ?? jobId,
    baselineId: latestBaselineId ?? baselineId,
  });

  const statusLine = useMemo(() => {
    if (!baselineId && !jobId) return "Select a baseline and a job to run scoring.";
    if (!baselineId) return "Select a baseline to continue.";
    if (!jobId) return "Select a job to continue.";
    if (isRunning) return "Running compatibility score.";
    if (result) return "Compatibility score ready.";
    return "Ready to run compatibility scoring.";
  }, [baselineId, jobId, isRunning, result]);

  const runAssessment = async () => {
    if (!baselineId || !jobId || isRunning) return;

    setIsRunning(true);
    setError(null);
    setCompleteBanner(null);
    setLatestAssessmentId(null);
    setLatestJobId(null);
    setLatestBaselineId(null);

    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ baselineId, jobId, debug: debugUiEnabled }),
      });

      const payload = await response.json();

      if (!response.ok) {
        const message = extractErrorMessage(payload) ?? "Unable to run compatibility scoring.";
        throw new Error(message);
      }

      const nextResult = payload as FitResultPayload;
      setResult(nextResult);
      const resolvedJobId =
        typeof nextResult.jobId === "string"
          ? nextResult.jobId
          : typeof jobId === "string"
            ? jobId
            : null;
      const resolvedBaselineId =
        typeof nextResult.baselineId === "string"
          ? nextResult.baselineId
          : typeof baselineId === "string"
            ? baselineId
            : null;
      setLatestJobId(resolvedJobId);
      setLatestBaselineId(resolvedBaselineId);
      setLatestAssessmentId(
        typeof nextResult.assessmentId === "string" ? nextResult.assessmentId : null,
      );

      const ts = pickTimestamp(nextResult) ?? new Date().toISOString();
      setLastRunAt(ts);
      setCompleteBanner("Assessment complete");
    } catch (runError: any) {
      setError(runError?.message ?? "Unable to run compatibility scoring right now.");
      setLatestAssessmentId(null);
      setLatestJobId(null);
      setLatestBaselineId(null);
    } finally {
      setIsRunning(false);
    }
  };

  const loadLastRun = async () => {
    if (!baselineId || !jobId || isLoadingLastRun) return;

    setIsLoadingLastRun(true);
    setError(null);
    setCompleteBanner(null);
    setLatestAssessmentId(null);
    setLatestJobId(null);
    setLatestBaselineId(null);

    try {
      const url = `/api/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(
        baselineId,
      )}/latest`;

      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        const message = extractErrorMessage(payload) ?? "Unable to load the last run.";
        throw new Error(message);
      }

      const nextResult = payload as FitResultPayload;
      setResult(nextResult);
      const resolvedJobId =
        typeof nextResult.jobId === "string"
          ? nextResult.jobId
          : typeof jobId === "string"
            ? jobId
            : null;
      const resolvedBaselineId =
        typeof nextResult.baselineId === "string"
          ? nextResult.baselineId
          : typeof baselineId === "string"
            ? baselineId
            : null;
      setLatestJobId(resolvedJobId);
      setLatestBaselineId(resolvedBaselineId);
      setLatestAssessmentId(
        typeof nextResult.assessmentId === "string" ? nextResult.assessmentId : null,
      );

      const ts = pickTimestamp(nextResult) ?? new Date().toISOString();
      setLastRunAt(ts);
      setCompleteBanner("Loaded last run");
    } catch (loadError: any) {
      setError(loadError?.message ?? "Unable to load the last run.");
      setLatestAssessmentId(null);
      setLatestJobId(null);
      setLatestBaselineId(null);
    } finally {
      setIsLoadingLastRun(false);
    }
  };

  return (
    <SetupModuleCard
      label="COMPATIBILITY SCORE"
      title="Score this pairing"
      description="Run a fit assessment to compare your selected baseline and job."
      primaryAction={
        <FormButton onClick={runAssessment} disabled={!canRun}>
          {isRunning ? "Running..." : "Run compatibility score"}
        </FormButton>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-300">{statusLine}</p>
        <div className="text-xs text-slate-400">
          <div>Last run: {formatTimestamp(lastRunAt)}</div>
          {completeBanner ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[11px] font-semibold text-slate-200">
              {completeBanner}
            </div>
          ) : null}
        </div>
      </div>

      {showLoadLastRun ? (
        <button
          type="button"
          onClick={() => {
            void loadLastRun();
          }}
          disabled={isLoadingLastRun || isRunning}
          className="text-xs font-semibold text-slate-300 underline decoration-white/10 underline-offset-4 hover:decoration-white/30 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Load last run"
        >
          {isLoadingLastRun ? "Loading last run..." : "Load last run"}
        </button>
      ) : null}

      {error ? (
        <Alert intent="error" title="Compatibility score">
          <p className="text-sm text-current">{error}</p>
        </Alert>
      ) : null}

      {showResult ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-200">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Result</p>
            <span className="text-xs text-slate-400">
              {result?.verdict ?? "Verdict pending"}
            </span>
          </div>

          <p className="text-4xl font-semibold text-white">{scoreValueText}</p>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Details are hidden by default.</p>
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="text-xs font-semibold text-slate-200 underline decoration-white/10 underline-offset-4 hover:decoration-white/30"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
          </div>

          {showDetails ? (
            <div className="space-y-3">
              {dimensionEntries.length ? (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Dimension scores
                  </p>
                  <div className="grid gap-1 text-xs text-slate-300">
                    {dimensionEntries.map(([label, value], index) => (
                      <p key={`${label}-${index}`}>
                        {label}: {renderDimensionValue(value)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {flagList.length ? (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Compliance flags
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">
                    {flagList.map((flag, index) => (
                      <li key={`flag-${index}`}>{flag}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result?.scoringProof ? (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Scoring proof
                  </p>
                  <div className="grid gap-1 text-xs text-slate-300">
                    <p>Assessment ID: {result.scoringProof.assessmentId ?? "n/a"}</p>
                    <p>
                      Baseline chars scored:{" "}
                      {formatProofNumber(result.scoringProof.baselineTextCharsScored)}
                    </p>
                    <p>
                      Job chars scored: {formatProofNumber(result.scoringProof.jobTextCharsScored)}
                    </p>
                    <p>
                      Normalized responsibilities:{" "}
                      {(result.scoringProof.normalizedResponsibilitiesCount ?? 0).toLocaleString()}
                    </p>
                    <p>
                      Normalized requirements:{" "}
                      {(result.scoringProof.normalizedRequirementsCount ?? 0).toLocaleString()}
                    </p>
                    <p>
                      Job raw text characters:{" "}
                      {(result.scoringProof.jobRawTextCharCount ?? 0).toLocaleString()}
                    </p>
                    <p className="break-words text-xs text-slate-300">
                      Job raw text SHA256:{" "}
                      {result.scoringProof.jobRawTextSha256 ?? "n/a"}
                    </p>
                    {result.scoringProof.jobRawTextTooShort ? (
                      <p className="text-[11px] uppercase tracking-[0.35em] text-amber-300">
                        {result.scoringProof.jobRawTextWarning ??
                          "Raw job description is below the recommended length."}
                      </p>
                    ) : null}
                    <p>
                      Baseline truncated:{" "}
                      {result.scoringProof.truncationAppliedBaseline ? "Yes" : "No"}
                    </p>
                    <p>
                      Job truncated: {result.scoringProof.truncationAppliedJob ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {runDebugInfo ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Debug</p>
                <button
                  type="button"
                  onClick={() => setShowDebugInfo((prev) => !prev)}
                  className="text-[11px] font-semibold text-slate-200 underline decoration-white/10 underline-offset-4 hover:decoration-white/30"
                >
                  {showDebugInfo ? "Hide info" : "Show info"}
                </button>
              </div>
              {showDebugInfo ? (
                <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Baseline ID</span>
                    <span className="text-slate-100">{runDebugInfo.baselineId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Baseline hash</span>
                    <span className="text-slate-100">
                      {runDebugInfo.baselineVersionHash ?? "n/a"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Baseline sections</span>
                    <span className="text-slate-100">
                      {runDebugInfo.baselineSelectedSectionCount} sections -{" "}
                      {formatProofNumber(runDebugInfo.baselineTotalChars)} chars
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Job ID</span>
                    <span className="text-slate-100">{runDebugInfo.jobId ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Job raw text</span>
                    <span className="text-slate-100">
                      {formatProofNumber(runDebugInfo.jobRawChars)} chars
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Responsibilities</span>
                    <span className="text-slate-100">
                      {runDebugInfo.normalizedResponsibilitiesCount.toLocaleString()} items -{" "}
                      {formatProofNumber(runDebugInfo.normalizedResponsibilitiesChars)} chars
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Requirements</span>
                    <span className="text-slate-100">
                      {runDebugInfo.normalizedRequirementsCount.toLocaleString()} items -{" "}
                      {formatProofNumber(runDebugInfo.normalizedRequirementsChars)} chars
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Total score</span>
                    <span className="text-slate-100">
                      {typeof runDebugInfo.totalScore === "number"
                        ? runDebugInfo.totalScore.toFixed(1)
                        : "n/a"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">
                      Dimension scores
                    </p>
                    <div className="grid gap-1 text-[11px] text-slate-300">
                      {Object.entries(runDebugInfo.dimensionScores).map(([label, value]) => (
                        <p key={label}>
                          {label}: {renderDimensionValue(value)}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {viewResultsHref ? (
            <div className="flex justify-end">
              <FormButton onClick={() => router.push(viewResultsHref)} disabled={isRunning}>
                View results
              </FormButton>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Run a fit assessment to see your compatibility score.</p>
      )}
    </SetupModuleCard>
  );
}
