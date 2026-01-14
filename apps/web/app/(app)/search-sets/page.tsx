'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/Alert';
import { FormButton } from '@/components/FormButton';
import { PageHeader } from '@/components/PageHeader';
import { PageShell } from '@/components/PageShell';
import { TextInput } from '@/components/TextInput';
import { TierGateNotice } from '@/components/TierGateNotice';
import { parseTierGateError, type TierGateError } from '@/lib/tiers';
import type { SearchSetDto } from '@/lib/searchSetsClient';

type SearchSetPayload = {
  baselineVersionId?: string;
  sourceUrl: string;
  sourceType?: string;
  sourceOptions?: {
    maxListings?: number;
  };
  titlePatterns?: string[];
  seniority?: string[];
  workMode?: string;
  parseWarning?: string;
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

export default function SearchSetsPage() {
  const router = useRouter();

  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [maxListings, setMaxListings] = useState('50');
  const [titlePatternsInput, setTitlePatternsInput] = useState('');
  const [seniority, setSeniority] = useState<string>('');
  const [workMode, setWorkMode] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingSearchSet, setPendingSearchSet] = useState<SearchSetDto | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

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

    if (greenhouseSourceUrlUnsupported) {
      return;
    }

    if (!sourceSectionValid) {
      setError('Complete the source configuration before creating a search set.');
      return;
    }

    if (!baselineVersionId) {
      setBaselineValidationError('Select a baseline version before creating a search set.');
      return;
    }

    setPendingSearchSet(null);
    setSubmitting(true);

    try {
      const normalizedMaxListings = maxListingsValid
        ? Math.min(100, Math.max(5, Math.floor(maxListingsNumber)))
        : 50;

      const payload: SearchSetPayload = {
        baselineVersionId,
        sourceType,
        sourceOptions: { maxListings: normalizedMaxListings },
        sourceUrl: parsedUrl.toString(),
        titlePatterns: titlePatterns.length ? titlePatterns : undefined,
        seniority: seniority ? [seniority] : undefined,
        workMode: workMode || undefined,
        parseWarning: parsed.warning,
      };

      if (debugUiEnabled) {
        console.debug(
          'createSearchSet payload includes baselineVersionId: ' +
            (payload.baselineVersionId ? payload.baselineVersionId : 'missing'),
        );
      }

      const result = await createSearchSet(payload);
      setPendingSearchSet(result);

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('ttr:lastBaselineVersionId', baselineVersionId);
      }
    } catch (e) {
      const tierGate = (e as any).tierGate as TierGateError | undefined;
      if (tierGate) {
        setTierGateError(tierGate);
      } else {
        const status =
          typeof (e as any).status === 'number' ? (e as any).status : undefined;
        const validationError = status != null && status >= 400 && status < 500;
        const userMessage = validationError
          ? 'We could not create this search set. Please check the source URL and your filters, then try again.'
          : 'Something went wrong while creating your search set. This is on us. Please try again in a moment.';
        setError(userMessage);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    parsedUrl,
    parsed.warning,
    titlePatterns,
    seniority,
    workMode,
    sourceSectionValid,
    sourceType,
    maxListingsValid,
    maxListingsNumber,
    greenhouseSourceUrlUnsupported,
    baselineVersionId,
  ]);

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

        {tierGateError ? <TierGateNotice error={tierGateError} /> : null}
        {error ? (
          <Alert intent="error" title="Unable to create search set">
            <div className="space-y-3">
              <p>{error}</p>
              <div className="flex justify-end">
                <FormButton variant="secondary" onClick={onSubmit} disabled={submitting}>
                  Try again
                </FormButton>
              </div>
            </div>
          </Alert>
        ) : null}

        {summaryData ? (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Parsed filters
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Review before results</h2>
            </div>

            <div className="space-y-3 text-sm text-slate-200">
              <div className="flex flex-wrap gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Keywords
                </span>
                <span className="text-slate-100">
                  {summaryData.keywords.length ? summaryData.keywords.join(', ') : 'None recorded'}
                </span>
              </div>

              {summaryData.location ? (
                <div className="flex flex-wrap gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Location
                  </span>
                  <span className="text-slate-100">{summaryData.location}</span>
                </div>
              ) : null}

              {summaryData.seniorityOrRole ? (
                <div className="flex flex-wrap gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    {summaryData.seniorityOrRole.label}
                  </span>
                  <span className="text-slate-100">{summaryData.seniorityOrRole.value}</span>
                </div>
              ) : null}

              {summaryData.exclusions.length ? (
                <div className="flex flex-wrap gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Inferred exclusions
                  </span>
                  <span className="text-slate-100">{summaryData.exclusions.join(', ')}</span>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <FormButton onClick={handleContinue}>Continue to results</FormButton>
            </div>
          </section>
        ) : null}

        <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Baseline
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Which baseline should we use?</h2>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Baseline version
              </label>
              <select
                value={baselineVersionId}
                onChange={(event) => {
                  clearFormErrors();
                  setPendingSearchSet(null);
                  setBaselineVersionId(event.target.value);
                  setBaselineValidationError(null);
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('ttr:lastBaselineVersionId', event.target.value);
                  }
                }}
                disabled={baselineDropdownDisabled}
                className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
              >
                <option value="">{baselineDropdownPlaceholder}</option>
                {baselineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.display}
                  </option>
                ))}
              </select>

              {baselinesError ? <Alert intent="warning">{baselinesError}</Alert> : null}
              {baselineValidationError ? (
                <p className="text-[11px] text-rose-400">{baselineValidationError}</p>
              ) : null}

              <p className="text-[11px] text-slate-400">This selection will carry into the run page.</p>

              {debugUiEnabled ? (
                <div className="space-y-1 rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Debug</p>
                  <p>baselinesFetchStatus: {baselinesFetchStatus}</p>
                  <p>baselineOptionsCount: {baselineOptions.length}</p>
                  <p>selectedBaselineVersionId: {baselineVersionId || 'none'}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-6 pt-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Source
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                Where do the listings come from?
              </h2>
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
