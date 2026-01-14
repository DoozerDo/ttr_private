'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { Alert } from '@/components/Alert';
import { EmptyState } from '@/components/EmptyState';
import { FormButton } from '@/components/FormButton';
import { PageHeader } from '@/components/PageHeader';
import { PageShell } from '@/components/PageShell';

import {
  getSearchSet,
  runSearchSet,
  type SearchSetApiError,
  type SearchSetDto,
  type SearchSetResultItem,
  type SearchSetRunMetadata,
} from '@/lib/searchSetsClient';
import type { TierGateError } from '@/lib/tiers';

const RESULT_LIMIT = 10;

const PROVIDER_ID_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  GREENHOUSE: 'Greenhouse',
};

function resolveProviderLabel(metadata: SearchSetRunMetadata | null, searchSet: SearchSetDto | null) {
  const providerId = metadata?.providerId;
  if (providerId) return PROVIDER_ID_LABELS[providerId] ?? providerId;

  const sourceType = searchSet?.sourceType;
  if (sourceType) return SOURCE_TYPE_LABELS[sourceType] ?? sourceType;

  return 'Saved jobs';
}

function formatCount(value?: number | null) {
  if (typeof value === 'number') return `${value}`;
  return 'Not available';
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not available';
  return d.toLocaleString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function humanizeKey(input: string) {
  return input
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function ScoreRing({ score }: { score: number | null }) {
  const normalized = typeof score === 'number' ? Math.min(Math.max(score, 0), 100) : 0;
  const degree = (normalized / 100) * 360;
  const gradient = `conic-gradient(#f97316 ${degree}deg, #0f172a ${degree}deg)`;

  return (
    <div className="relative h-16 w-16">
      <div className="absolute inset-0 rounded-full border border-slate-800" style={{ background: gradient }} />
      <div className="absolute inset-[4px] rounded-full bg-slate-900/80" />
      <div className="relative flex h-full w-full items-center justify-center">
        <span className="text-sm font-semibold text-white">
          {typeof score === 'number' ? score.toFixed(1) : 'n/a'}
        </span>
      </div>
    </div>
  );
}

type BaselineVersionLite = {
  id: string;
  label?: string | null;
  filename?: string | null;
  createdAt?: string | null;
};

type BaselineLite = {
  id: string;
  label?: string | null;
  name?: string | null;
  versions?: BaselineVersionLite[] | null;
};

type BaselineVersionOption = {
  id: string;
  display: string;
  baselineLabel: string;
};

function coerceBaselineList(payload: unknown): BaselineLite[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter(isRecord)
    .map((b) => {
      const id = typeof b.id === 'string' ? b.id : '';
      const label =
        typeof b.label === 'string'
          ? b.label
          : typeof b.name === 'string'
            ? b.name
            : undefined;

      const versionsRaw = (b.versions ?? (b as any).baselineVersions) as unknown;
      const versions: BaselineVersionLite[] = Array.isArray(versionsRaw)
        ? versionsRaw
            .filter(isRecord)
            .map((v) => ({
              id: typeof v.id === 'string' ? v.id : '',
              label: typeof v.label === 'string' ? v.label : null,
              filename: typeof v.filename === 'string' ? v.filename : null,
              createdAt: typeof v.createdAt === 'string' ? v.createdAt : null,
            }))
            .filter((v) => Boolean(v.id))
        : [];

      return { id, label, versions };
    })
    .filter((b) => Boolean(b.id));
}

function formatBaselineVersionOption(baseline: BaselineLite, version: BaselineVersionLite): BaselineVersionOption {
  const baselineLabel = baseline.label?.trim() || `Baseline ${baseline.id.slice(0, 8)}`;
  const versionLabel =
    version.label?.trim() ||
    version.filename?.trim() ||
    `Version ${version.id.slice(0, 8)}`;

  return {
    id: version.id,
    baselineLabel,
    display: `${baselineLabel} · ${versionLabel}`,
  };
}

async function fetchBaselines(): Promise<BaselineLite[]> {
  const res = await fetch('/api/baselines', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    await res.text().catch(() => '');
    const error = new Error('Failed to load baselines.');
    Object.assign(error, { status: res.status });
    throw error;
  }

  const data = (await res.json()) as unknown;
  return coerceBaselineList(data);
}

export default function SearchSetRunPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const searchSetId = params?.id ?? '';
  const initialBaselineVersionId = searchParams?.get('baselineVersionId') ?? '';

  const [searchSet, setSearchSet] = useState<SearchSetDto | null>(null);
  const [searchSetLoading, setSearchSetLoading] = useState(true);
  const [searchSetError, setSearchSetError] = useState<string | null>(null);

  const [baselineOptions, setBaselineOptions] = useState<BaselineVersionOption[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(true);
  const [baselinesError, setBaselinesError] = useState<string | null>(null);

  const [selectedBaselineVersionId, setSelectedBaselineVersionId] = useState<string>('');
  const [running, setRunning] = useState(false);

  const [runResults, setRunResults] = useState<SearchSetResultItem[]>([]);
  const [runMetadata, setRunMetadata] = useState<SearchSetRunMetadata | null>(null);
  const [runExecuted, setRunExecuted] = useState(false);

  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const isProGated = Boolean(tierGateError);

  const handleUpgrade = useCallback(() => {
    router.push('/pricing');
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setSearchSetLoading(true);
      setSearchSetError(null);

      try {
        const ss = await getSearchSet(searchSetId);
        if (!mounted) return;
        setSearchSet(ss ?? null);
      } catch (e) {
        if (!mounted) return;
        const msg = (e as Error)?.message || 'Unable to load this search set.';
        setSearchSetError(msg);
        setSearchSet(null);
      } finally {
        if (!mounted) return;
        setSearchSetLoading(false);
      }
    }

    if (searchSetId) load();

    return () => {
      mounted = false;
    };
  }, [searchSetId]);

  useEffect(() => {
    let mounted = true;

    async function loadBaselines() {
      setBaselinesLoading(true);
      setBaselinesError(null);

      try {
        const list = await fetchBaselines();
        if (!mounted) return;

        const options = list
          .flatMap((b) => (b.versions ?? []).map((v) => formatBaselineVersionOption(b, v)))
          .filter((o) => Boolean(o.id));

        setBaselineOptions(options);

        const stored =
          typeof window !== 'undefined'
            ? sessionStorage.getItem('ttr:lastBaselineVersionId') ?? ''
            : '';

        const preferred =
          (initialBaselineVersionId && options.some((o) => o.id === initialBaselineVersionId) && initialBaselineVersionId) ||
          (stored && options.some((o) => o.id === stored) && stored) ||
          (options[0]?.id ?? '');

        setSelectedBaselineVersionId(preferred);

        if (typeof window !== 'undefined') {
          if (preferred) sessionStorage.setItem('ttr:lastBaselineVersionId', preferred);
          else sessionStorage.removeItem('ttr:lastBaselineVersionId');
        }

        if (!options.length) {
          setBaselinesError('Upload a baseline to run search sets.');
        }
      } catch (e) {
        if (!mounted) return;
        const status = typeof (e as any).status === 'number' ? (e as any).status : undefined;
        const msg =
          status === 401
            ? 'We could not load your baselines. Please make sure you are signed in and try again.'
            : 'We ran into a problem loading your baselines. Please refresh the page and try again.';
        setBaselinesError(msg);
        setBaselineOptions([]);
        setSelectedBaselineVersionId('');
      } finally {
        if (!mounted) return;
        setBaselinesLoading(false);
      }
    }

    loadBaselines();

    return () => {
      mounted = false;
    };
  }, [initialBaselineVersionId]);

  const selectedBaselineLabel = useMemo(() => {
    if (!selectedBaselineVersionId) return '';
    const option = baselineOptions.find((o) => o.id === selectedBaselineVersionId);
    return option?.display ?? '';
  }, [baselineOptions, selectedBaselineVersionId]);

  const lastRunInfo = useMemo(() => {
    if (!searchSet?.lastRunAt) return null;
    return {
      at: searchSet.lastRunAt,
      baselineVersionId: searchSet.lastRunBaselineVersionId ?? null,
      resultCount: typeof searchSet.lastRunResultCount === 'number' ? searchSet.lastRunResultCount : null,
    };
  }, [searchSet]);

  const runStateMessage = lastRunInfo?.at
    ? `Last run on ${formatDate(lastRunInfo.at)}.`
    : 'This search set has not been run yet.';

  const resultsAreStale =
    runExecuted &&
    !!lastRunInfo?.baselineVersionId &&
    !!selectedBaselineVersionId &&
    lastRunInfo.baselineVersionId !== selectedBaselineVersionId;

  const snapshotSourceUrl = runMetadata?.sourceSnapshot?.sourceUrl ?? searchSet?.sourceUrl ?? null;
  const snapshotFetchedAt = runMetadata?.sourceSnapshot?.fetchedAt ?? searchSet?.lastRunAt ?? null;
  const snapshotListingCount =
    runMetadata?.fetchedListingCount ?? runMetadata?.sourceSnapshot?.listingCount ?? null;

  const runDisabled =
    running ||
    searchSetLoading ||
    baselinesLoading ||
    !selectedBaselineVersionId ||
    !searchSetId ||
    isProGated;

  const handleRun = useCallback(async () => {
    if (!searchSetId || !selectedBaselineVersionId || isProGated) return;

    setRunning(true);
    setRunError(null);
    setRunMessage(null);
    setValidationErrors([]);

    try {
      const response = await runSearchSet(searchSetId, selectedBaselineVersionId, RESULT_LIMIT);
      const normalizedResults = response.results ?? [];
      setRunResults(normalizedResults);
      setRunMetadata(response.metadata ?? null);
      setRunExecuted(true);

      const count = normalizedResults.length;
      setRunMessage(count ? `Run complete. Found ${count} matching roles.` : 'Run complete. No matches found.');

      const runTimestamp = new Date().toISOString();
      setSearchSet((prev) =>
        prev
          ? {
              ...prev,
              lastRunAt: runTimestamp,
              lastRunBaselineVersionId: selectedBaselineVersionId,
              lastRunResultCount: count,
            }
          : prev,
      );

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('ttr:lastBaselineVersionId', selectedBaselineVersionId);
      }
    } catch (err) {
      const apiError = err as SearchSetApiError;

      if (apiError?.tierGate) {
        setTierGateError(apiError.tierGate);
        setRunError(null);
        setRunMessage(null);
        return;
      }

      if (apiError?.validationErrors?.length) {
        setValidationErrors(apiError.validationErrors);
      }

      setRunError(apiError?.message ?? 'Unable to run this search set.');
    } finally {
      setRunning(false);
    }
  }, [searchSetId, selectedBaselineVersionId, isProGated]);

  const overviewRows = useMemo(() => {
    if (!searchSet) return [];

    const createdAt = (searchSet as any).createdAt as string | undefined;
    const updatedAt = (searchSet as any).updatedAt as string | undefined;

    return [
      { label: 'Created', value: formatDate(createdAt ?? null) },
      { label: 'Updated', value: formatDate(updatedAt ?? null) },
      { label: 'Source', value: searchSet.sourceType ? (SOURCE_TYPE_LABELS[searchSet.sourceType] ?? searchSet.sourceType) : 'Not available' },
    ];
  }, [searchSet]);

  return (
    <PageShell>
      <div className="space-y-6 py-6">
        <PageHeader title="Run search set" description="Apply a baseline to the saved filter and surface the best fit roles." />

        {searchSet ? <p className="text-sm text-slate-300">{runStateMessage}</p> : null}

        {searchSetError ? (
          <Alert intent="error" title="Unable to load search set">
            {searchSetError}
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Search set</p>
              <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
            </div>

            {searchSetLoading ? (
              <p className="text-sm text-slate-400">Loading search set details...</p>
            ) : searchSet ? (
              <div className="space-y-3">
                {searchSet.sourceUrl ? (
                  <a href={searchSet.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-sky-300 underline">
                    {searchSet.sourceUrl}
                  </a>
                ) : null}

                <div className="space-y-2 text-sm text-slate-200">
                  {overviewRows.map((row) => (
                    <div key={row.label} className="flex flex-wrap gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        {row.label}
                      </span>
                      <span className="text-slate-200">{row.value}</span>
                    </div>
                  ))}
                </div>

                {searchSet.parseWarning ? (
                  <Alert intent="warning" title="Warning">
                    <div className="space-y-2">
                      <p>{searchSet.parseWarning}</p>
                      <p className="text-xs text-slate-200">
                        Results may be broader and less targeted, but the search set can still run.
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

            {isProGated ? (
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
              <Alert intent="warning" title="Baseline needed">
                {baselinesError}{' '}
                <Link href="/baseline" className="text-sky-300 underline">
                  Open baseline library
                </Link>
              </Alert>
            ) : !baselineOptions.length ? (
              <Alert intent="warning" title="Baseline needed">
                Upload a baseline to run search sets.{' '}
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
                  {baselineOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.display}
                    </option>
                  ))}
                </select>

                {selectedBaselineLabel ? (
                  <p className="text-xs text-slate-400">Selected: {selectedBaselineLabel}</p>
                ) : null}

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

                <div className="flex justify-end">
                  <FormButton onClick={handleRun} disabled={runDisabled}>
                    {running ? 'Running...' : runExecuted ? 'Re-run' : 'Run search set'}
                  </FormButton>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Source snapshot</p>
              <h2 className="text-lg font-semibold text-slate-100">Provider pull details</h2>
            </div>
            <span className="text-xs text-slate-400">
              {snapshotFetchedAt ? `Last fetched ${formatDate(snapshotFetchedAt)}` : 'Not captured yet'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Provider</p>
              <p className="text-slate-100">{resolveProviderLabel(runMetadata, searchSet)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Source URL</p>
              {snapshotSourceUrl ? (
                <a href={snapshotSourceUrl} target="_blank" rel="noreferrer" className="text-sm text-sky-300 underline">
                  {snapshotSourceUrl}
                </a>
              ) : (
                <p className="text-sm text-slate-400">Not available</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Fetched at</p>
              <p className="text-slate-100">{formatDate(snapshotFetchedAt)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Listing count</p>
              <p className="text-slate-100">{formatCount(snapshotListingCount)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Ingested new</p>
              <p className="text-slate-100">{formatCount(runMetadata?.ingestedNewCount ?? null)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Deduped</p>
              <p className="text-slate-100">{formatCount(runMetadata?.dedupedCount ?? null)}</p>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            {runMetadata?.sourceSnapshot
              ? 'This snapshot reflects the last provider pull.'
              : 'Run the search set to capture provider metadata.'}
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
                {runResults.length ? `${runResults.length} / ${RESULT_LIMIT} shown` : runExecuted ? 'No matches found' : 'Run the set to view matches'}
              </span>
            </div>
          </div>

          {resultsAreStale ? (
            <Alert intent="warning" title="Baseline changed">
              These results were generated with a different baseline version. Re-run the set to refresh them.
            </Alert>
          ) : null}

          {!runExecuted ? (
            <EmptyState
              title="Run the set to show matches"
              body="Pick a baseline version and press Run to see the strongest job matches."
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
            />
          ) : runResults.length === 0 ? (
            <EmptyState
              title="No matches yet"
              body="Try a different baseline or broaden your filters and run again."
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
            />
          ) : (
            <div className="space-y-4">
              {runResults.map((result, index) => {
                const raw = (result as any).raw ?? {};
                const dimensionScores = raw.dimensionScores;
                const location = typeof raw.location === 'string' ? raw.location : null;

                return (
                  <article
                    key={(result.jobId ?? index) + '-' + index}
                    className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <ScoreRing score={result.fitScore ?? null} />
                      <div className="flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-lg font-semibold text-white">{result.title ?? 'Untitled role'}</p>
                            <p className="text-sm text-slate-300">
                              {result.company ?? 'Company unknown'}
                              {location ? ` · ${location}` : ''}
                            </p>
                          </div>
                          <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-200">
                            {result.verdict ?? 'Verdict pending'}
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
                            <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-300 underline">
                              View source
                            </a>
                          ) : null}
                        </div>

                        {isRecord(dimensionScores) ? (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {Object.entries(dimensionScores)
                              .filter(([, value]) => typeof value === 'number')
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
