'use client';

import { useCallback, useMemo, useState } from 'react';
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
  sourceUrl: string;
  titlePatterns?: string[];
  seniority?: string[];
  workMode?: string;
  parseWarning?: string;
};

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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function safeParseUrl(input: string): { url?: URL; warning?: string } {
  const trimmed = input.trim();
  if (!trimmed) return {};

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { warning: 'URL must start with http:// or https: / /.' };
    }
    return { url };
  } catch {
    return { warning: 'Invalid URL.' };
  }
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function createSearchSet(payload: SearchSetPayload): Promise<SearchSetDto> {
  const envBase =
    (process.env.NEXT_PUBLIC_API_BASE_URL as string | undefined) ??
    (process.env.API_BASE_URL as string | undefined);

  const endpoint = envBase
    ? `${normalizeBaseUrl(envBase)}/search-sets`
    : '/api/search-sets';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

    throw new Error(text || `Request failed (${res.status})`);
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
  const [titlePatternsInput, setTitlePatternsInput] = useState('');
  const [seniority, setSeniority] = useState<string>('');
  const [workMode, setWorkMode] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingSearchSet, setPendingSearchSet] = useState<SearchSetDto | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);

  const parsed = useMemo(() => safeParseUrl(sourceUrl), [sourceUrl]);

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
    setError(undefined);
    setTierGateError(null);

    if (!parsed.url) {
      setError(parsed.warning || 'Invalid job URL.');
      return;
    }

    setPendingSearchSet(null);
    setSubmitting(true);
    try {
      const payload: SearchSetPayload = {
        sourceUrl: parsed.url.toString(),
        titlePatterns: titlePatterns.length ? titlePatterns : undefined,
        // Fix for R14: API expects array, UI is single-select string.
        seniority: seniority ? [seniority] : undefined,
        workMode: workMode || undefined,
        parseWarning: parsed.warning,
      };

      const result = await createSearchSet(payload);
      setPendingSearchSet(result);
    } catch (e) {
      const tierGate = (e as any).tierGate as TierGateError | undefined;
      if (tierGate) {
        setTierGateError(tierGate);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [parsed.url, parsed.warning, titlePatterns, seniority, workMode]);

  const handleContinue = useCallback(() => {
    if (!pendingSearchSet) return;
    const { id } = pendingSearchSet;
    setPendingSearchSet(null);
    router.push(`/search-sets/${id}`);
  }, [pendingSearchSet, router]);

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
            {error}
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
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Job URL
              </label>
              <TextInput
                type="url"
                placeholder="https://..."
                value={sourceUrl}
                onChange={(event) => {
                  setPendingSearchSet(null);
                  setSourceUrl(event.target.value);
                }}
              />
              {parsed.warning ? <Alert intent="warning">{parsed.warning}</Alert> : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Title patterns
              </label>
              <TextInput
                placeholder="Director Support, Support Operations..."
                value={titlePatternsInput}
                onChange={(event) => {
                  setPendingSearchSet(null);
                  setTitlePatternsInput(event.target.value);
                }}
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
                  setPendingSearchSet(null);
                  setSeniority(event.target.value);
                }}
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
                  setPendingSearchSet(null);
                  setWorkMode(event.target.value);
                }}
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
            <FormButton onClick={onSubmit} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Search Set'}
            </FormButton>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
