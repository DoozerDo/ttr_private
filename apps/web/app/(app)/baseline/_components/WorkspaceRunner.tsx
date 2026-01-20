"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";

type WorkspaceRunnerProps = {
  baselineId: string | null;
  jobId: string | null;
};

type DimensionScoreValue = number | string | null | undefined;

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

  [key: string]: unknown;
};

type RunIdentifierKey = "assessmentId" | "analysisId" | "fitScoreId";

type RunIdentifier = {
  key: RunIdentifierKey;
  value: string;
};

type LatestResultIdentifiers = {
  jobId: string | null;
  baselineId: string | null;
  runIdentifier: RunIdentifier;
};

const RUN_IDENTIFIER_PRIORITY: RunIdentifierKey[] = [
  "assessmentId",
  "analysisId",
  "fitScoreId",
];

const pickRunIdentifier = (payload: FitResultPayload | null): RunIdentifier | null => {
  if (!payload) return null;

  for (const key of RUN_IDENTIFIER_PRIORITY) {
    const candidate = payload[key];
    if (typeof candidate === "string" && candidate.trim().length) {
      return { key, value: candidate.trim() };
    }
  }

  return null;
};

const buildLatestResultIdentifiers = (
  payload: FitResultPayload | null,
  jobId: string | null,
  baselineId: string | null,
): LatestResultIdentifiers | null => {
  const runIdentifier = pickRunIdentifier(payload);
  if (!runIdentifier) return null;

  return {
    jobId,
    baselineId,
    runIdentifier,
  };
};

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
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [completeBanner, setCompleteBanner] = useState<string | null>(null);
  const [latestResultIdentifiers, setLatestResultIdentifiers] = useState<LatestResultIdentifiers | null>(null);
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

  const viewResultsHref = latestResultIdentifiers?.runIdentifier
    ? `/results?${latestResultIdentifiers.runIdentifier.key}=${encodeURIComponent(
        latestResultIdentifiers.runIdentifier.value,
      )}${
        latestResultIdentifiers.jobId
          ? `&jobId=${encodeURIComponent(latestResultIdentifiers.jobId)}`
          : ""
      }${
        latestResultIdentifiers.baselineId
          ? `&baselineId=${encodeURIComponent(latestResultIdentifiers.baselineId)}`
          : ""
      }`
    : null;

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
    setLatestResultIdentifiers(null);

    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ baselineId, jobId }),
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
      setLatestResultIdentifiers(
        buildLatestResultIdentifiers(nextResult, resolvedJobId, resolvedBaselineId),
      );

      const ts = pickTimestamp(nextResult) ?? new Date().toISOString();
      setLastRunAt(ts);
      setCompleteBanner("Assessment complete");
    } catch (runError: any) {
      setError(runError?.message ?? "Unable to run compatibility scoring right now.");
      setLatestResultIdentifiers(null);
    } finally {
      setIsRunning(false);
    }
  };

  const loadLastRun = async () => {
    if (!baselineId || !jobId || isLoadingLastRun) return;

    setIsLoadingLastRun(true);
    setError(null);
    setCompleteBanner(null);

    try {
      const url = new URL("/api/analysis/latest", window.location.origin);
      url.searchParams.set("baselineId", baselineId);
      url.searchParams.set("jobId", jobId);

      const response = await fetch(url.toString(), { cache: "no-store" });
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
      setLatestResultIdentifiers(
        buildLatestResultIdentifiers(nextResult, resolvedJobId, resolvedBaselineId),
      );

      const ts = pickTimestamp(nextResult) ?? new Date().toISOString();
      setLastRunAt(ts);
      setCompleteBanner("Loaded last run");
    } catch (loadError: any) {
      setError(loadError?.message ?? "Unable to load the last run.");
      setLatestResultIdentifiers(null);
    } finally {
      setIsLoadingLastRun(false);
    }
  };

  return (
    <section
      style={{
        ...ttrComponents.basePanel,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p style={{ ...ttrTypography.subtleLabel, letterSpacing: 1.5 }}>
            Compatibility score
          </p>
          <h2 style={{ ...ttrTypography.h2, marginTop: 4, marginBottom: 0 }}>
            Score this pairing
          </h2>
        </div>

        <div className="text-right text-xs text-slate-400">
          <div>Last run: {formatTimestamp(lastRunAt)}</div>
          {completeBanner ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[11px] font-semibold text-slate-200">
              {completeBanner}
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-slate-300">{statusLine}</p>

      <div className="flex flex-wrap items-center gap-3">
        <FormButton onClick={runAssessment} disabled={!canRun}>
          {isRunning ? "Running..." : "Run compatibility score"}
        </FormButton>

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
      </div>

      {error ? (
        <Alert intent="error" title="Compatibility score">
          <p className="text-sm text-current">{error}</p>
        </Alert>
      ) : null}

      {showResult ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-200">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Result
            </p>
            <span className="text-xs text-slate-400">
              {result?.verdict ?? "Verdict pending"}
            </span>
          </div>

          <p className="text-4xl font-semibold text-white">{scoreValueText}</p>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Details are hidden by default.
            </p>

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
        <p className="text-sm text-slate-400">
          Run a fit assessment to see your compatibility score.
        </p>
      )}
    </section>
  );
}
