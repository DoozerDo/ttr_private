'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type SearchSetPayload = {
  sourceUrl: string;
  titlePatterns?: string[];
  seniority?: string[];
  workMode?: string;
  parseWarning?: string;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
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

async function createSearchSet(payload: SearchSetPayload): Promise<{ id: string }> {
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
    throw new Error(text || `Request failed (${res.status})`);
  }

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== 'object' || !('id' in data) || typeof (data as any).id !== 'string') {
    throw new Error('Unexpected response from createSearchSet.');
  }

  return { id: (data as any).id };
}

export default function SearchSetsPage() {
  const router = useRouter();

  const [sourceUrl, setSourceUrl] = useState('');
  const [titlePatternsInput, setTitlePatternsInput] = useState('');
  const [seniority, setSeniority] = useState<string>('');
  const [workMode, setWorkMode] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const parsed = useMemo(() => safeParseUrl(sourceUrl), [sourceUrl]);

  const titlePatterns = useMemo(() => {
    return titlePatternsInput
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }, [titlePatternsInput]);

  const onSubmit = useCallback(async () => {
    setError(undefined);

    if (!parsed.url) {
      setError(parsed.warning || 'Invalid job URL.');
      return;
    }

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
      router.push(`/search-sets/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [parsed.url, parsed.warning, titlePatterns, seniority, workMode, router]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Create Search Set</h1>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Job URL</label>
          <input
            type="url"
            placeholder="https://..."
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
          {parsed.warning && <p className="text-sm text-yellow-700">{parsed.warning}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Title patterns</label>
          <input
            type="text"
            placeholder="Director Support, Support Operations..."
            value={titlePatternsInput}
            onChange={(e) => setTitlePatternsInput(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
          <p className="text-xs text-gray-600">Comma separated.</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Seniority</label>
          <select
            value={seniority}
            onChange={(e) => setSeniority(e.target.value)}
            className="w-full rounded border px-3 py-2"
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
          <label className="text-sm font-medium">Work mode</label>
          <select
            value={workMode}
            onChange={(e) => setWorkMode(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">Select work mode</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          onClick={onSubmit}
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Search Set'}
        </button>
      </div>
    </div>
  );
}
