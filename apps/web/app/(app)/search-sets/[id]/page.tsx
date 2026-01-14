'use client';

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

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

const debugUiEnabled =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG_UI === 'true';

const SENIORITY_LABELS: Record<string, string> = {
  ENTRY: 'Entry',
  MID: 'Mid',
  SENIOR: 'Senior',
  LEAD: 'Lead',
  EXECUTIVE: 'Executive',
  ANY: 'Any',
};

function formatSeniorityLabel(value: string): string {
  if (!value) return '';
  const normalized = value.toUpperCase();
  return SENIORITY_LABELS[normalized] ?? value;
}

function splitTitlePatterns(patterns?: string[]) {
  const normalized = (patterns ?? [])
    .map((pattern) => pattern?.trim() ?? '')
    .filter(Boolean);

  const exclusions = normalized
    .filter((entry) => entry.startsWith('-') || entry.startsWith('!'))
    .map((entry) => entry.slice(1).trim())
    .filter(Boolean);

  const keywords = normalized.filter(
    (entry) => !entry.startsWith('-') && !entry.startsWith('!'),
  );

  return { keywords, exclusions };
}

function safeParseUrl(input: string): { url?: URL; warning?: string } {
  const trimmed = input.trim();
  if (!trimmed) return {};

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { warning: 'URL must start with http:// or https://.' };
    }
    return { url };
  } catch {
    return { warning: 'Invalid URL.' };
  }
}

function isGreenhouseJobBoard(url: URL): boolean {
  const host = url.host.toLowerCase();
  return host === 'greenhouse.io' || host.endsWith('.greenhouse.io');
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

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

      return {
        id,
        label,
        versions,
      };
    })
    .filter((b) => Boolean(b.id));
}

function formatBaselineVersionOption(
  baseline: BaselineLite,
  version: BaselineVersionLite,
): BaselineVersionOption {
  const baselineLabel =
    baseline.label?.trim() || `Baseline ${baseline.id.slice(0, 8)}`;
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

async function createSearchSet(payload: SearchSetPayload): Promise<SearchSetDto> {
  const res = await fetch('/api/search-sets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const parsedPayload = tryParseJson(text);
    const tierGate = parseTierGateError({
      status: res.status,
      payload: parsedPayload ?? text,
    });

    if (tierGate) {
      throw Object.assign(new Error('TIER_GATED'), { tierGate });
    }

    const error = new Error(text || `Request failed (${res.status})`);
    Object.assign(error, { status: res.status });
    throw error;
  }

  const data = (await res.json()) as unknown;
  if (
    !data ||
    typeof data !== 'object' ||
    !('id' in data) ||
    typeof (data as any).id !== 'string'
  ) {
    throw new Error('Unexpected response from createSearchSet.');
  }

  return data as SearchSetDto;
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

  const [baselinesLoading, setBaselinesLoading] = useState(false);
  const [baselinesFetchStatus, setBaselinesFetchStatus] = useState<LoadStatus>('idle');
  const [baselinesError, setBaselinesError] = useState<string | null>(null);
  const [baselineOptions, setBaselineOptions] = useState<BaselineVersionOption[]>([]);
  const [baselineVersionId, setBaselineVersionId] = useState<string>('');
  const [baselineValidationError, setBaselineValidationError] = useState<string | null>(null);

  const parsed = useMemo(() => safeParseUrl(sourceUrl), [sourceUrl]);
  const parsedUrl = parsed.url;
  const clearFormErrors = useCallback(() => {
    setError(undefined);
    setTierGateError(null);
    setSubmitAttempted(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const stored =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('ttr:lastBaselineVersionId') ?? ''
        : '';
    if (stored) setBaselineVersionId(stored);

    setBaselineOptions([]);
    setBaselinesLoading(true);
    setBaselinesFetchStatus('loading');
    setBaselinesError(null);

    fetchBaselines()
      .then((list) => {
        if (!mounted) return;

        const options = list
          .flatMap((b) =>
            (b.versions ?? []).map((v) => formatBaselineVersionOption(b, v)),
          )
          .filter((o) => Boolean(o.id));

        setBaselineOptions(options);
        if (!options.length) {
          setBaselinesFetchStatus('success');
          setBaselinesError('You need to upload a baseline before creating a search set.');
          setBaselineVersionId('');
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('ttr:lastBaselineVersionId');
          }
          return;
        }

        setBaselinesFetchStatus('success');
        setBaselinesError(null);

        const stillValid = stored && options.some((o) => o.id === stored);
        if (!stillValid) {
          setBaselineVersionId(options[0].id);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('ttr:lastBaselineVersionId', options[0].id);
          }
        }
      })
      .catch((e) => {
        if (!mounted) return;
        setBaselineOptions([]);
        setBaselineVersionId('');
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('ttr:lastBaselineVersionId');
        }

        const status =
          typeof (e as any).status === 'number' ? (e as any).status : undefined;
        const message =
          status === 401
            ? 'We could not load your baselines. Please make sure you are signed in and try again.'
            : 'We ran into a problem loading your baselines. Please refresh the page and try again.';
        setBaselinesError(message);
        setBaselinesFetchStatus('error');
      })
      .finally(() => {
        if (!mounted) return;
        setBaselinesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const baselineOptionsLoaded =
    baselinesFetchStatus === 'success' && baselineOptions.length > 0;
  const baselineFormReady = baselineOptionsLoaded && Boolean(baselineVersionId);
  const formInputsDisabled = !baselineFormReady;
  const baselineDropdownDisabled = baselinesLoading || !baselineOptionsLoaded;
  const baselineDropdownPlaceholder = baselinesLoading
    ? 'Loading baseline versions...'
    : baselineOptionsLoaded
      ? 'Select a baseline version'
      : 'No baselines available';

  const greenhouseDomainUnsupported =
    sourceType === 'GREENHOUSE' && parsedUrl instanceof URL && !isGreenhouseJobBoard(parsedUrl);
  const greenhouseApplicationUrlUnsupported =
    sourceType === 'GREENHOUSE' &&
    parsedUrl instanceof URL &&
    parsedUrl.pathname.toLowerCase().includes('/applications/');
  const greenhouseSourceUrlUnsupported =
    greenhouseDomainUnsupported || greenhouseApplicationUrlUnsupported;

  const maxListingsNumber = Number(maxListings);
  const maxListingsValid =
    Number.isFinite(maxListingsNumber) &&
    Number.isInteger(maxListingsNumber) &&
    maxListingsNumber >= 5 &&
    maxListingsNumber <= 100;

  const maxListingsError =
    maxListings && !maxListingsValid ? 'Enter a number between 5 and 100.' : undefined;

  const sourceTypeError = submitAttempted && !sourceType ? 'Select a source type.' : undefined;

  const sourceSectionValid = Boolean(
    sourceType && parsedUrl instanceof URL && maxListingsValid && !greenhouseSourceUrlUnsupported,
  );

  const titlePatterns = useMemo(() => {
    return titlePatternsInput
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }, [titlePatternsInput]);

  const summaryData = useMemo(() => {
    if (!pendingSearchSet) return null;

    const { keywords, exclusions } = splitTitlePatterns(pendingSearchSet.titlePatterns);
    const seniorityValues = (pendingSearchSet.seniority ?? [])
      .map(formatSeniorityLabel)
      .filter(Boolean);

    const seniorityOrRole =
      seniorityValues.length > 0
        ? { label: 'Seniority', value: seniorityValues.join(', ') }
        : keywords.length
          ? { label: 'Role hints', value: keywords.join(', ') }
          : null;

    return {
      keywords,
      exclusions,
      location: (pendingSearchSet as any).location as string | undefined,
      seniorityOrRole,
    };
  }, [pendingSearchSet]);

  const onSubmit = useCallback(async () => {
    setSubmitAttempted(true);
    setError(undefined);
    setTierGateError(null);
    setBaselineValidationError(null);

    if (!(parsedUrl instanceof URL)) {
      setError(parsed.warning || 'Invalid job URL.');
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

    if (!sourceSectionValid) {
      setError('Complete the source configuration before creating a search set.');
      return;
    }

    if (!baselineVersionId) {
      setBaselineValidationError('Select a baseline version before creating a search set.');
      return;
    }

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
      setSubmitting(false);
    }
  }, [searchSetId, selectedBaselineVersionId, canRunSearchSets]);

  const handleContinue = useCallback(() => {
    if (!pendingSearchSet) return;
    const { id } = pendingSearchSet;
    setPendingSearchSet(null);

    const params = new URLSearchParams();
    if (baselineVersionId) params.set('baselineVersionId', baselineVersionId);

    const qs = params.toString();
    router.push(qs ? `/search-sets/${id}?${qs}` : `/search-sets/${id}`);
  }, [pendingSearchSet, router, baselineVersionId]);

  return (
    <PageShell>
      <div className="space-y-6 py-6">
        <PageHeader
          title="Search Sets"
          description="Create search filters by pointing us at a job posting URL."
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

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Source type
                </label>
                <select
                  value={sourceType}
                  onChange={(event) => {
                    clearFormErrors();
                    setPendingSearchSet(null);
                    setSourceType(event.target.value);
                  }}
                  disabled={formInputsDisabled}
                  className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">Select source type</option>
                  <option value="GREENHOUSE">Greenhouse</option>
                  <option value="MANUAL" disabled>
                    Manual URL list (coming soon)
                  </option>
                </select>
                <p className={`text-[11px] ${sourceTypeError ? 'text-rose-400' : 'text-slate-400'}`}>
                  {sourceTypeError ?? 'Greenhouse is the only source we support today.'}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Source URL
                </label>
                <TextInput
                  type="url"
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(event) => {
                    clearFormErrors();
                    setPendingSearchSet(null);
                    setSourceUrl(event.target.value);
                  }}
                  disabled={formInputsDisabled}
                />
                {parsed.warning ? <Alert intent="warning">{parsed.warning}</Alert> : null}
                {greenhouseDomainUnsupported ? (
                  <Alert intent="error">
                    This source URL does not appear to be supported. We currently support Greenhouse job boards only.
                  </Alert>
                ) : null}
                {greenhouseApplicationUrlUnsupported ? (
                  <Alert intent="error">
                    Please paste a Greenhouse job board or listings URL. Application links are not supported.
                  </Alert>
                ) : null}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Max listings
                </label>
                <TextInput
                  type="number"
                  min={5}
                  max={100}
                  step={1}
                  value={maxListings}
                  onChange={(event) => {
                    clearFormErrors();
                    setPendingSearchSet(null);
                    setMaxListings(event.target.value);
                  }}
                  disabled={formInputsDisabled}
                />
                <p className={`text-[11px] ${maxListingsError ? 'text-rose-400' : 'text-slate-400'}`}>
                  {maxListingsError ?? 'Limit how many listings we process (5-100).'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Title patterns
              </label>
              <TextInput
                placeholder="Director Support, Support Operations..."
                value={titlePatternsInput}
                onChange={(event) => {
                  clearFormErrors();
                  setPendingSearchSet(null);
                  setTitlePatternsInput(event.target.value);
                }}
                disabled={formInputsDisabled}
              />
              <p className="text-[11px] text-slate-400">Comma separated.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Seniority
              </label>
              <select
                value={seniority}
                onChange={(event) => {
                  clearFormErrors();
                  setPendingSearchSet(null);
                  setSeniority(event.target.value);
                }}
                disabled={formInputsDisabled}
                className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">Select seniority</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="manager">Manager</option>
                <option value="director">Director</option>
                <option value="vp">VP</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Work mode
              </label>
              <select
                value={workMode}
                onChange={(event) => {
                  clearFormErrors();
                  setPendingSearchSet(null);
                  setWorkMode(event.target.value);
                }}
                disabled={formInputsDisabled}
                className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">Select work mode</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <FormButton
              onClick={onSubmit}
              disabled={
                !sourceSectionValid ||
                submitting ||
                !baselineFormReady ||
                baselinesLoading ||
                greenhouseSourceUrlUnsupported
              }
            >
              {submitting ? 'Creating...' : 'Create Search Set'}
            </FormButton>
          </div>
        </section>
      </div>
    </PageShell>
  );
}