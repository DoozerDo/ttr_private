"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

import type { BaselineDto } from "@/lib/baselines";
import {
  getSearchSet,
  runSearchSet,
  type SearchSetApiError,
  type SearchSetDto,
  type SearchSetResultItem,
  type SearchSetRunMetadata,
} from "@/lib/searchSetsClient";
import type { TierGateError } from "@/lib/tiers";

const RESULT_LIMIT = 10;

const PROVIDER_ID_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  GREENHOUSE: 'Greenhouse',
};

function resolveProviderLabel(
  metadata: SearchSetRunMetadata | null,
  searchSet: SearchSetDto | null,
) {
  const providerId = metadata?.providerId;
  if (providerId) {
    return PROVIDER_ID_LABELS[providerId] ?? providerId;
  }

  if (searchSet?.sourceType) {
    return SOURCE_TYPE_LABELS[searchSet.sourceType] ?? searchSet.sourceType;
  }

  return 'Saved jobs';
}

function formatCount(value?: number | null) {
  if (typeof value === 'number') {
    return `${value}`;
  }
  return '—';
}

function ScoreRing({ score }: { score: number | null }) {
  const normalized = typeof score === 'number' ? Math.min(Math.max(score, 0), 100) : 0;
  const degree = (normalized / 100) * 360;
  const gradient = `conic-gradient(#f97316 ${degree}deg, #0f172a ${degree}deg)`;

  return (
    <div className="relative h-16 w-16">
      <div
        className="absolute inset-0 rounded-full border border-slate-800"
        style={{ background: gradient }}
      />
      <div className="absolute inset-[4px] rounded-full bg-slate-900/80" />
      <div className="relative flex h-full w-full items-center justify-center">
        <span className="text-sm font-semibold text-white">
          {typeof score === 'number' ? score.toFixed(1) : 'n/a'}
        </span>
      </div>
    </div>
  );
}

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
  results: SearchSetResultItem[];
  metadata?: SearchSetRunMetadata | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
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
  const router = useRouter();
  const handleUpgrade = useCallback(() => router.push("/pricing"), [router]);

  const [searchSet, setSearchSet] = useState<SearchSetDto | null>(null);
  const [searchSetLoading, setSearchSetLoading] = useState(true);
  const [searchSetError, setSearchSetError] = useState<string | null>(null);

  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(true);
  const [baselinesError, setBaselinesError] = useState<string | null>(null);

  const [selectedBaselineVersionId, setSelectedBaselineVersionId] = useState("");
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<SearchSetResultItem[]>([]);
  const [runMetadata, setRunMetadata] = useState<SearchSetRunMetadata | null>(null);
  const [runExecuted, setRunExecuted] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const canRunSearchSets = !tierGateError;
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
    setRunMetadata(stored.metadata ?? null);
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
  const runStateMessage = lastRunInfo?.at
    ? `Last run on ${formatDate(lastRunInfo.at)} using baseline ${
        lastRunBaselineLabel ?? "baseline version unknown"
      }.`
    : "This search set has not been run yet.";
  const resultsAreStale =
    runExecuted &&
    !!lastRunInfo?.baselineVersionId &&
    !!selectedBaselineVersionId &&
    lastRunInfo.baselineVersionId !== selectedBaselineVersionId;
  const staleBaselineLabel = lastRunBaselineLabel ?? "the previously run baseline version";
  const runDisabled =
    running || !selectedBaselineVersionId || searchSetLoading || baselinesLoading || !canRunSearchSets;
  const snapshotSourceUrl = runMetadata?.sourceSnapshot?.sourceUrl ?? searchSet?.sourceUrl;
  const snapshotFetchedAt = runMetadata?.sourceSnapshot?.fetchedAt ?? searchSet?.lastRunAt ?? null;
  const snapshotListingCount =
    runMetadata?.fetchedListingCount ?? runMetadata?.sourceSnapshot?.listingCount;

  const handleRun = useCallback(async () => {
    if (!searchSetId || !selectedBaselineVersionId || !canRunSearchSets) return;
    const baselineVersionId = selectedBaselineVersionId;

    setRunning(true);
    setRunError(null);
    setValidationErrors([]);
    setTierGateError(null);
    setRunMessage(null);

    try {
      const response = await runSearchSet(searchSetId, baselineVersionId, RESULT_LIMIT);
      const normalizedResults = response.results ?? [];
      const runTimestamp = new Date().toISOString();
      setRunResults(normalizedResults);
      setRunMetadata(response.metadata);
      setRunExecuted(true);
      const count = normalizedResults.length;
      setRunMessage(
        count ? `Run complete - Found ${count} matching roles.` : "Run complete - No matches found.",
      );
      persistStoredRunResults(searchSetId, {
        baselineVersionId,
        runAt: runTimestamp,
        results: normalizedResults,
        metadata: response.metadata,
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
      } else {
        setRunError(apiError.message ?? "Unable to run this search set.");
      }
    } finally {
      setRunning(false);
    }
  }, [searchSetId, selectedBaselineVersionId, canRunSearchSets]);

  const explanationEntries = useMemo(() => {
    return runResults.map((result) => {
      const raw = result.raw ?? {};
      return Object.entries(raw)
        .filter(([key, value]) => !KNOWN_RESULT_KEYS.has(key) && normalizeExplanationValue(value) !== null)
        .map(([key, value]) => ({
          key,
          label: humanizeKey(key),
          value: normalizeExplanationValue(value) as string,
        }));
    });
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

        {searchSet ? (
          <p className="text-sm text-slate-300">{runStateMessage}</p>
        ) : null}

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

                {searchSet.parseWarning ? (
                  <Alert intent="warning">
                    <div className="space-y-2">
                      <p>{searchSet.parseWarning}</p>
                      <p className="text-xs text-slate-200">
                        This means results may be broader and less targeted, but the search set can still run.
                      </p>
                    </div>
                  </Alert>
                ) : null}
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

            {!canRunSearchSets ? (
              <Alert intent="warning" title="PRO required">
                <div className="space-y-3">
                  <p className="text-sm text-slate-200">
                    Running search sets requires the PRO plan.
                  </p>
                  <div className="flex justify-end">
                    <FormButton variant="secondary" onClick={handleUpgrade}>
                      Upgrade to PRO
                    </FormButton>
                  </div>
                </div>
              </Alert>
            ) : baselinesLoading ? (
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

                {canRunSearchSets && runError ? <Alert intent="error">{runError}</Alert> : null}

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
              </div>
            )}
          </section>
        </div>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Source snapshot
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Provider pull details</h2>
            </div>
            <span className="text-xs text-slate-400">
              {snapshotFetchedAt
                ? `Last fetched ${formatDate(snapshotFetchedAt)}`
                : canRunSearchSets
                  ? 'Run the set to capture a snapshot'
                  : 'Upgrade to PRO to run this search set.'}
            </span>
          </div>

          {!runExecuted ? (
            <p className="text-xs text-slate-400">
              {canRunSearchSets
                ? 'Run the search set to capture metadata and view results.'
                : 'Upgrade to PRO to run this search set.'}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Provider</p>
              <p className="text-slate-100">{resolveProviderLabel(runMetadata, searchSet)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Source URL</p>
              {snapshotSourceUrl ? (
                <a
                  href={snapshotSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-sky-300 underline"
                >
                  {snapshotSourceUrl}
                </a>
              ) : (
                <p className="text-sm text-slate-400">Not provided</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Fetched at</p>
              <p className="text-slate-100">{formatDate(snapshotFetchedAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Listing count
              </p>
              <p className="text-slate-100">{formatCount(snapshotListingCount)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Ingested new</p>
              <p className="text-slate-100">{formatCount(runMetadata?.ingestedNewCount)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Deduped</p>
              <p className="text-slate-100">{formatCount(runMetadata?.dedupedCount)}</p>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            {runMetadata?.sourceSnapshot
              ? 'This snapshot reflects the last provider pull.'
              : searchSet?.sourceType
              ? canRunSearchSets
                ? 'Run the provider-backed set to capture metadata.'
                : 'Upgrade to PRO to run this search set.'
              : 'Legacy sets rely on saved jobs and do not produce provider snapshots.'}
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Results</p>
              <h2 className="text-lg font-semibold text-slate-100">Matched roles</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-400">
                {!canRunSearchSets
                  ? "Upgrade to PRO to run this search set and view matched roles."
                  : runResults.length
                    ? `${runResults.length} / ${RESULT_LIMIT} shown`
                    : "Run the set to view matches"}
              </span>
              {canRunSearchSets ? (
                <FormButton onClick={handleRun} disabled={runDisabled}>
                  {running ? "Running..." : runExecuted ? "Re-run" : "Run search set"}
                </FormButton>
              ) : null}
            </div>
          </div>

          {resultsAreStale ? (
            <Alert intent="warning">
              The current matches were generated for {staleBaselineLabel}. Select that baseline value again or re-run
              the set to refresh them.
            </Alert>
          ) : null}

          {!runExecuted ? (
            !canRunSearchSets ? (
              <EmptyState
                title="Upgrade to PRO to view matches"
                body="Upgrade to PRO to run this search set and view matched roles."
                className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
              />
            ) : (
              <EmptyState
                title="Run the set to show matches"
                body="Pick a baseline version and press Run to see the strongest job matches."
                className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
              />
            )
          ) : runResults.length === 0 ? (
            <EmptyState
              title="No matches yet"
              body="Adjust the baseline or expand your filters and try again."
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
            />
          ) : (
            <div className="space-y-4">
              {runResults.map((result, index) => {
                const raw = result.raw ?? {};
                const dimensionScores = raw.dimensionScores;
                const location = typeof raw.location === "string" ? raw.location : null;
                return (
                  <article
                    key={(result.jobId ?? index) + "-" + index}
                    className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <ScoreRing score={result.fitScore ?? null} />
                      <div className="flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-lg font-semibold text-white">{result.title ?? "Untitled role"}</p>
                            <p className="text-sm text-slate-300">
                              {result.company ?? "Company unknown"}
                              {location ? ` · ${location}` : ""}
                            </p>
                          </div>
                          <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-200">
                            {result.verdict ?? "Verdict pending"}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
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
                            <a
                              href={result.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-sky-300 underline"
                            >
                              View source
                            </a>
                          ) : null}
                        </div>

                        {isRecord(dimensionScores) ? (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {Object.entries(dimensionScores)
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
                      </div>
                    </div>

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
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}


