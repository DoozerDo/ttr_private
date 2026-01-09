"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TierGateNotice } from "@/components/TierGateNotice";

import type { BaselineDto } from "../../../lib/baselines";
import {
  getSearchSet,
  runSearchSet,
  type SearchSetApiError,
  type SearchSetDto,
  type SearchSetRunResult,
} from "../../../lib/searchSetsClient";
import type { TierGateError } from "@/lib/tiers";

const RESULT_LIMIT = 10;

const KNOWN_RESULT_KEYS = new Set([
  "jobId",
  "title",
  "company",
  "applyUrl",
  "sourceUrl",
  "fitScore",
  "verdict",
  "dimensionScores",
]);

type StoredSearchSetRun = {
  baselineVersionId: string;
  runAt: string;
  results: SearchSetRunResult[];
};

const SEARCH_SET_RUN_RESULTS_STORAGE_KEY = "target-this-role.search-set-run-results";

function readStoredSearchSetRuns(): Record<string, StoredSearchSetRun> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SEARCH_SET_RUN_RESULTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, StoredSearchSetRun>;
  } catch {
    return {};
  }
}

function loadStoredRunResults(searchSetId: string): StoredSearchSetRun | null {
  const stored = readStoredSearchSetRuns();
  const entry = stored[searchSetId];
  if (!entry) return null;
  if (
    typeof entry.baselineVersionId !== "string" ||
    typeof entry.runAt !== "string" ||
    !Array.isArray(entry.results)
  ) {
    return null;
  }
  return entry;
}

function persistStoredRunResults(searchSetId: string, entry: StoredSearchSetRun) {
  if (typeof window === "undefined") return;
  try {
    const stored = readStoredSearchSetRuns();
    stored[searchSetId] = entry;
    localStorage.setItem(SEARCH_SET_RUN_RESULTS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Swallow storage errors to avoid blocking the UI.
  }
}

type BaselineVersionOption = {
  label: string;
  value: string;
  baselineId: string;
};

function formatDate(value?: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function normalizeExplanationValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return `${value}`;
  if (Array.isArray(value) && value.length) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join(", ");
  }
  return null;
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
}

export default function SearchSetRunPage() {
  const params = useParams<{ id: string }>();
  const searchSetId = params?.id ?? "";

  const [searchSet, setSearchSet] = useState<SearchSetDto | null>(null);
  const [searchSetLoading, setSearchSetLoading] = useState(true);
  const [searchSetError, setSearchSetError] = useState<string | null>(null);

  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(true);
  const [baselinesError, setBaselinesError] = useState<string | null>(null);

  const [selectedBaselineVersionId, setSelectedBaselineVersionId] = useState("");
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<SearchSetRunResult[]>([]);
  const [runExecuted, setRunExecuted] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!searchSetId) return;

    setSearchSetLoading(true);
    setSearchSetError(null);

    getSearchSet(searchSetId)
      .then((data) => setSearchSet(data))
      .catch((error: Error) => {
        setSearchSetError(error.message || "Unable to load this search set.");
      })
      .finally(() => setSearchSetLoading(false));
  }, [searchSetId]);

  useEffect(() => {
    setBaselinesLoading(true);
    setBaselinesError(null);

    fetch("/api/baselines", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => "Unable to load baselines.");
          throw new Error(text);
        }
        return response.json() as Promise<BaselineDto[]>;
      })
      .then((data) => setBaselines(Array.isArray(data) ? data : []))
      .catch((error: Error) => setBaselinesError(error.message))
      .finally(() => setBaselinesLoading(false));
  }, []);

  useEffect(() => {
    if (!searchSetId || !searchSet) return;

    const stored = loadStoredRunResults(searchSetId);
    if (
      !stored ||
      stored.baselineVersionId !== searchSet.lastRunBaselineVersionId ||
      stored.runAt !== searchSet.lastRunAt
    ) {
      return;
    }

    setRunResults(stored.results);
    setRunExecuted(true);
  }, [searchSetId, searchSet]);

  const baselineOptions = useMemo<BaselineVersionOption[]>(() => {
    return baselines.flatMap((baseline) =>
      (baseline.versions ?? []).map((version) => ({
        value: version.id,
        baselineId: baseline.id,
        label: `${baseline.originalFilename ?? baseline.id} · v${version.versionNumber ?? "?"}`,
      })),
    );
  }, [baselines]);

  useEffect(() => {
    if (!selectedBaselineVersionId) return;
    if (!baselineOptions.some((option) => option.value === selectedBaselineVersionId)) {
      setSelectedBaselineVersionId("");
    }
  }, [baselineOptions, selectedBaselineVersionId]);

  const selectedBaselineLabel = useMemo(() => {
    return baselineOptions.find((option) => option.value === selectedBaselineVersionId)?.label ?? null;
  }, [baselineOptions, selectedBaselineVersionId]);

  const getBaselineLabel = useCallback(
    (versionId?: string | null) => {
      if (!versionId) return null;
      const match = baselineOptions.find((option) => option.value === versionId);
      if (match) return match.label;
      return versionId.length > 8
        ? `Baseline ${versionId.slice(0, 8)}`
        : `Baseline ${versionId}`;
    },
    [baselineOptions],
  );

  const lastRunInfo =
    searchSet && searchSet.lastRunAt
      ? {
          at: searchSet.lastRunAt,
          baselineVersionId: searchSet.lastRunBaselineVersionId ?? null,
          resultCount:
            typeof searchSet.lastRunResultCount === "number" ? searchSet.lastRunResultCount : null,
        }
      : null;

  const lastRunBaselineLabel = getBaselineLabel(lastRunInfo?.baselineVersionId);
  const resultsAreStale =
    runExecuted &&
    !!lastRunInfo?.baselineVersionId &&
    !!selectedBaselineVersionId &&
    lastRunInfo.baselineVersionId !== selectedBaselineVersionId;
  const staleBaselineLabel = lastRunBaselineLabel ?? "the previously run baseline version";

  const handleRun = useCallback(async () => {
    if (!searchSetId || !selectedBaselineVersionId) return;
    const baselineVersionId = selectedBaselineVersionId;

    setRunning(true);
    setRunError(null);
    setValidationErrors([]);
    setTierGateError(null);
    setRunMessage(null);

    try {
      const results = await runSearchSet(searchSetId, baselineVersionId, RESULT_LIMIT);
      const normalizedResults = Array.isArray(results) ? results : [];
      const runTimestamp = new Date().toISOString();
      setRunResults(normalizedResults);
      setRunExecuted(true);
      const count = normalizedResults.length;
      setRunMessage(
        count ? `Run complete — Found ${count} matching roles.` : "Run complete — No matches found.",
      );
      persistStoredRunResults(searchSetId, {
        baselineVersionId,
        runAt: runTimestamp,
        results: normalizedResults,
      });
      setSearchSet((prev) =>
        prev
          ? {
              ...prev,
              lastRunAt: runTimestamp,
              lastRunBaselineVersionId: baselineVersionId,
              lastRunResultCount: count,
            }
          : prev,
      );
    } catch (error) {
      const apiError = error as SearchSetApiError;
      if (apiError.validationErrors?.length) {
        setValidationErrors(apiError.validationErrors);
      }
      if (apiError.tierGate) {
        setTierGateError(apiError.tierGate);
      }
      setRunError(apiError.message ?? "Unable to run this search set.");
    } finally {
      setRunning(false);
    }
  }, [searchSetId, selectedBaselineVersionId]);

  const explanationEntries = useMemo(() => {
    return runResults.map((result) =>
      Object.entries(result)
        .filter(([key, value]) => !KNOWN_RESULT_KEYS.has(key) && normalizeExplanationValue(value) !== null)
        .map(([key, value]) => ({
          key,
          label: humanizeKey(key),
          value: normalizeExplanationValue(value) as string,
        })),
    );
  }, [runResults]);

  const overviewRows = useMemo(() => {
    if (!searchSet) return [];
    const rows: Array<{ label: string; value: string }> = [];

    if (searchSet.sourceUrl) rows.push({ label: "Source", value: searchSet.sourceUrl });

    if (searchSet.parseWarning) rows.push({ label: "Warning", value: searchSet.parseWarning });

    rows.push({ label: "Created", value: formatDate(searchSet.createdAt) });
    rows.push({ label: "Updated", value: formatDate(searchSet.updatedAt) });

    return rows;
  }, [searchSet]);

  return (
    <PageShell>
      <div className="space-y-6 pb-10">
        <PageHeader
          kicker="Search sets"
          title="Run search set"
          description="Apply a baseline to the saved filter and surface the best-fit roles."
          rightSlot={
            <Link href="/search-sets" className="text-sky-300 underline">
              Back to search sets
            </Link>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Search set</p>
              <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
            </div>

            {searchSetLoading ? (
              <p className="text-sm text-slate-400">Loading search set details...</p>
            ) : searchSetError ? (
              <Alert intent="error">{searchSetError}</Alert>
            ) : searchSet ? (
              <div className="space-y-3">
                {searchSet.sourceUrl ? (
                  <a
                    href={searchSet.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-sky-300 underline"
                  >
                    {searchSet.sourceUrl}
                  </a>
                ) : null}

                <div className="space-y-2 text-sm text-slate-200">
                  {overviewRows
                    .filter((row) => row.label !== "Source")
                    .map((row) => (
                      <div key={row.label} className="flex flex-wrap gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                          {row.label}
                        </span>
                        <span className="text-slate-200">{row.value}</span>
                      </div>
                    ))}
                </div>

                {searchSet.parseWarning ? <Alert intent="warning">{searchSet.parseWarning}</Alert> : null}
              </div>
            ) : (
              <EmptyState
                title="Search set missing"
                body="This set could not be loaded yet."
                className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
              />
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Baseline version</p>
              <h2 className="text-lg font-semibold text-slate-100">Selection</h2>
            </div>

            {baselinesLoading ? (
              <p className="text-sm text-slate-400">Loading baseline versions...</p>
            ) : baselinesError ? (
              <Alert intent="error">{baselinesError}</Alert>
            ) : !baselineOptions.length ? (
              <Alert intent="warning" title="Baseline needed">
                Upload a baseline to run search sets.{" "}
                <Link href="/baseline" className="text-sky-300 underline">
                  Open baseline library
                </Link>
              </Alert>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedBaselineVersionId}
                  onChange={(event) => setSelectedBaselineVersionId(event.target.value)}
                  className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="" disabled>
                    Select a baseline version
                  </option>
                  {baselines.map((baseline) => (
                    <optgroup key={baseline.id} label={baseline.originalFilename ?? baseline.id}>
                      {(baseline.versions ?? []).map((version) => (
                        <option key={version.id} value={version.id}>
                          v{version.versionNumber ?? "?"} · {baseline.originalFilename ?? baseline.id}
                          {version.fileHash ? ` (${version.fileHash.slice(0, 8)})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {selectedBaselineLabel ? (
                  <p className="text-xs text-slate-400">Selected: {selectedBaselineLabel}</p>
                ) : null}

                <FormButton
                  onClick={handleRun}
                  disabled={running || !selectedBaselineVersionId || searchSetLoading || baselinesLoading}
                >
                  {running ? "Running..." : "Run search set"}
                </FormButton>

                {tierGateError ? <TierGateNotice error={tierGateError} /> : null}
                {runError ? <Alert intent="error">{runError}</Alert> : null}

                {validationErrors.length ? (
                  <Alert intent="warning" title="Validation issues">
                    <ul className="list-disc space-y-1 pl-5 text-[12px] text-slate-200">
                      {validationErrors.map((entry, index) => (
                        <li key={index}>{entry}</li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}

                {runMessage ? <Alert intent="success">{runMessage}</Alert> : null}

                {lastRunInfo ? (
                  <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-200">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold uppercase tracking-[0.3em]">Last run</span>
                      <span>{formatDate(lastRunInfo.at)}</span>
                    </div>
                    <p className="text-sm text-white">
                      {lastRunBaselineLabel ?? "Baseline version unknown"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {typeof lastRunInfo.resultCount === "number"
                        ? `${lastRunInfo.resultCount} results returned`
                        : "Results count unavailable"}
                    </p>
                  </div>
                ) : searchSet ? (
                  <p className="text-xs text-slate-400">
                    Run this set once to capture timestamp, baseline, and results metadata.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Results</p>
              <h2 className="text-lg font-semibold text-slate-100">Matched roles</h2>
            </div>
            <span className="text-xs text-slate-400">
              {runResults.length
                ? `${runResults.length} / ${RESULT_LIMIT} shown`
                : "Run the set to view matches"}
            </span>
          </div>

          {resultsAreStale ? (
            <Alert intent="warning">
              The current matches were generated for {staleBaselineLabel}. Select that baseline value again or re-run
              the set to refresh them.
            </Alert>
          ) : null}

          {!runExecuted ? (
            <EmptyState
              title="Run the set to show matches"
              body="Pick a baseline version and press Run to see the strongest job matches."
              cta={
                <FormButton
                  variant="ghost"
                  onClick={handleRun}
                  disabled={running || !selectedBaselineVersionId || searchSetLoading || baselinesLoading}
                >
                  Run search set
                </FormButton>
              }
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
            />
          ) : runResults.length === 0 ? (
            <EmptyState
              title="No matches yet"
              body="Adjust the baseline or expand your filters and try again."
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
            />
          ) : (
            <div className="space-y-4">
              {runResults.map((result, index) => (
                <article
                  key={(result.jobId ?? index) + "-" + index}
                  className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-white">{result.title ?? "Untitled role"}</p>
                      <p className="text-sm text-slate-300">
                        {result.company ?? "Company unknown"}
                        {result.jobId ? ` · ${result.jobId}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-200">
                        {result.verdict ?? "Verdict pending"}
                      </span>
                      <div className="text-2xl font-bold text-white">
                        {typeof result.fitScore === "number" ? result.fitScore.toFixed(1) : "n/a"}
                      </div>
                      <div className="text-xs text-slate-400">Fit score</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {result.applyUrl ? (
                      <a
                        href={result.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-full border border-white/20 bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-semibold text-slate-900 transition hover:opacity-90"
                      >
                        Open apply link
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Apply link not available</span>
                    )}

                    {result.sourceUrl ? (
                      <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-300 underline">
                        View source
                      </a>
                    ) : null}
                  </div>

                  {result.dimensionScores ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(result.dimensionScores)
                        .filter(([, value]) => typeof value === "number")
                        .map(([dimension, value]) => (
                          <span
                            key={dimension}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-slate-200"
                          >
                            {humanizeKey(dimension)}: {(value as number).toFixed(1)}
                          </span>
                        ))}
                    </div>
                  ) : null}

                  {explanationEntries[index]?.length ? (
                    <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                      {explanationEntries[index].map((entry) => (
                        <div key={entry.key}>
                          <span className="font-semibold text-slate-100">{entry.label}:</span> {entry.value}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
