"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  dimensionScores?:
    | Record<string, DimensionScoreValue>
    | DimensionScoreValue[]
    | null;
  complianceFlags?: unknown[] | null;
  [key: string]: unknown;
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

const extractCreatedAtString = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const createdAt = (payload as Record<string, unknown>).createdAt;
  return typeof createdAt === "string" && createdAt.trim().length ? createdAt : null;
};

export function WorkspaceRunner({ baselineId, jobId }: WorkspaceRunnerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingLatest, setIsLoadingLatest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FitResultPayload | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isRunningRef = useRef(isRunning);
  const isLoadingLatestRef = useRef(isLoadingLatest);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    isLoadingLatestRef.current = isLoadingLatest;
  }, [isLoadingLatest]);

  const dimensionEntries = useMemo(
    () => (result ? formatDimensionEntries(result) : []),
    [result],
  );

  const flagList = useMemo(() => {
    const flags = result?.complianceFlags;
    if (!Array.isArray(flags)) return [];
    return flags.map((flag) => (typeof flag === "string" ? flag : JSON.stringify(flag)));
  }, [result]);

  const runAssessment = async () => {
    if (!baselineId || !jobId || isRunningRef.current || isLoadingLatestRef.current) return;

    setIsRunning(true);
    setError(null);
    setSuccessMessage(null);

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
        const message = extractErrorMessage(payload) ?? "Unable to run fit assessment.";
        throw new Error(message);
      }

      setResult(payload as FitResultPayload);

      const createdAt = extractCreatedAtString(payload);
      setLastRunAt(createdAt ?? new Date().toISOString());

      setSuccessMessage("Assessment complete");
    } catch (runError: any) {
      setError(runError?.message ?? "Unable to run fit assessment right now.");
    } finally {
      setIsRunning(false);
    }
  };

  const loadLatest = useCallback(async () => {
    if (!baselineId || !jobId || isRunningRef.current || isLoadingLatestRef.current) return;

    setIsLoadingLatest(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `/api/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(
          baselineId,
        )}/latest`,
        {
          cache: "no-store",
        },
      );

      const payload = await response.json();
      if (!response.ok) {
        const message = extractErrorMessage(payload) ?? "Unable to load latest assessment.";
        throw new Error(message);
      }

      setResult(payload as FitResultPayload);

      const createdAt = extractCreatedAtString(payload);
      setLastRunAt(createdAt);

      setSuccessMessage("Latest assessment loaded");
    } catch (loadError: any) {
      setError(loadError?.message ?? "Unable to load the latest assessment.");
    } finally {
      setIsLoadingLatest(false);
    }
  }, [baselineId, jobId]);

  useEffect(() => {
    if (!baselineId || !jobId) {
      setResult(null);
      setLastRunAt(null);
      setSuccessMessage(null);
      setError(null);
      return;
    }

    void loadLatest();
  }, [baselineId, jobId, loadLatest]);

  const baselineStatus = baselineId ? "Selected" : "Not selected";
  const jobStatus = jobId ? "Selected" : "Not selected";
  const showResult = Boolean(result);
  const formattedLastRun = useMemo(() => {
    if (!lastRunAt) return null;
    const parsed = new Date(lastRunAt);
    if (Number.isNaN(parsed.getTime())) return lastRunAt;
    return parsed.toLocaleString();
  }, [lastRunAt]);

  return (
    <section
      style={{
        ...ttrComponents.basePanel,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <p
          style={{
            ...ttrTypography.subtleLabel,
            letterSpacing: 1.5,
          }}
        >
          Workspace runner
        </p>
        <h2 style={{ ...ttrTypography.h2, marginTop: 4 }}>Manage pairing</h2>
      </div>

      <div className="space-y-1 text-sm text-slate-200">
        <p>
          Baseline: <span className="font-semibold">{baselineStatus}</span>
          {baselineId ? ` (${baselineId})` : null}
        </p>
        <p>
          Job: <span className="font-semibold">{jobStatus}</span>
          {jobId ? ` (${jobId})` : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <FormButton onClick={runAssessment} disabled={!baselineId || !jobId || isRunning || isLoadingLatest}>
          {isRunning ? "Running..." : "Run Fit Assessment"}
        </FormButton>
        <FormButton
          variant="secondary"
          onClick={() => {
            void loadLatest();
          }}
          disabled={!baselineId || !jobId || isLoadingLatest || isRunning}
        >
          {isLoadingLatest ? "Loading latest..." : "Load latest for job"}
        </FormButton>
      </div>

      {successMessage ? (
        <Alert intent="success">
          <p className="text-sm text-current">{successMessage}</p>
        </Alert>
      ) : null}

      {error ? (
        <Alert intent="error" title="Workspace runner">
          <p className="text-sm text-current">{error}</p>
        </Alert>
      ) : null}

      {showResult ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-200">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Results</p>
            <span className="text-xs text-slate-400">{result?.verdict ?? "Verdict pending"}</span>
          </div>
          {formattedLastRun ? (
            <p className="text-xs text-slate-400">Last run: {formattedLastRun}</p>
          ) : null}
          <p className="text-3xl font-semibold text-white">
            {typeof result?.score === "number" ? result.score.toFixed(1) : "n/a"}
          </p>
          {dimensionEntries.length ? (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Dimension scores</p>
              <div className="grid gap-1 text-xs text-slate-300">
                {dimensionEntries.map(([label, value]) => (
                  <p key={`${label}-${String(value)}`}>
                    {label}: {renderDimensionValue(value)}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {flagList.length ? (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Compliance flags</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">
                {flagList.map((flag, index) => (
                  <li key={`flag-${index}`}>{flag}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          Run a baseline/job pairing to see fit assessment results here.
        </p>
      )}
    </section>
  );
}
