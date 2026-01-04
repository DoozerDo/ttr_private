'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetchJson } from '../lib/api';

enum SearchSetSeniority {
  ENTRY = 'ENTRY',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  EXECUTIVE = 'EXECUTIVE',
  ANY = 'ANY',
}

enum SearchSetWorkMode {
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
  ONSITE = 'ONSITE',
  ANY = 'ANY',
}

type SearchSet = {
  id: string;
  titlePatterns: string[];
  seniority: SearchSetSeniority;
  industry: string[];
  workMode: SearchSetWorkMode;
  sourceUrl: string | null;
  urlBacked?: boolean;
  parseWarning?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type ParsedUrlPreview = {
  sourceUrl: string;
  titlePatterns: string[];
  seniority?: SearchSetSeniority;
  workMode?: SearchSetWorkMode;
  parseWarning: string | null;
};

type SearchSetRunResult = {
  jobId: string;
  title: string | null;
  company: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  fitScore: number | null;
  verdict: string | null;
};

function safeString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null || v === undefined) return '';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function parseList(input: string): string[] {
  const s = (input || '').trim();
  if (!s) return [];
  return s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function detectWorkMode(url: URL): SearchSetWorkMode | null {
  const param =
    url.searchParams.get('f_WT') ||
    url.searchParams.get('workplaceType') ||
    url.searchParams.get('remoteWorkplaceType');
  const map: Record<string, SearchSetWorkMode> = {
    '1': SearchSetWorkMode.ONSITE,
    '2': SearchSetWorkMode.REMOTE,
    '3': SearchSetWorkMode.HYBRID,
    onsite: SearchSetWorkMode.ONSITE,
    remote: SearchSetWorkMode.REMOTE,
    hybrid: SearchSetWorkMode.HYBRID,
  };

  if (param) {
    for (const token of param.split(',').map((v) => v.trim().toLowerCase())) {
      if (map[token]) {
        return map[token];
      }
    }
  }

  const haystack = `${url.searchParams.toString()} ${url.pathname}`.toLowerCase();
  if (haystack.includes('remote')) return SearchSetWorkMode.REMOTE;
  if (haystack.includes('hybrid')) return SearchSetWorkMode.HYBRID;
  if (haystack.includes('onsite') || haystack.includes('on-site')) return SearchSetWorkMode.ONSITE;
  return null;
}

function detectSeniority(url: URL): SearchSetSeniority | null {
  const param = url.searchParams.get('f_E') || url.searchParams.get('experience') || url.searchParams.get('level');
  const map: Record<string, SearchSetSeniority> = {
    '1': SearchSetSeniority.ENTRY,
    '2': SearchSetSeniority.ENTRY,
    '3': SearchSetSeniority.MID,
    '4': SearchSetSeniority.SENIOR,
    '5': SearchSetSeniority.LEAD,
    '6': SearchSetSeniority.EXECUTIVE,
    entry: SearchSetSeniority.ENTRY,
    junior: SearchSetSeniority.ENTRY,
    associate: SearchSetSeniority.MID,
    mid: SearchSetSeniority.MID,
    senior: SearchSetSeniority.SENIOR,
    lead: SearchSetSeniority.LEAD,
    director: SearchSetSeniority.EXECUTIVE,
    executive: SearchSetSeniority.EXECUTIVE,
    vp: SearchSetSeniority.EXECUTIVE,
  };

  if (param) {
    for (const token of param.split(',').map((v) => v.trim().toLowerCase())) {
      if (map[token]) {
        return map[token];
      }
    }
  }

  const haystack = decodeURIComponent(url.search).toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (haystack.includes(key)) {
      return value;
    }
  }

  return null;
}

function detectTitlePatterns(url: URL) {
  const candidates = ['keywords', 'keyword', 'title', 'q', 'query', 'position'];
  const patterns: string[] = [];

  for (const key of candidates) {
    const value = url.searchParams.get(key);
    if (value) {
      patterns.push(...value.split(/[,|]/));
    }
  }

  return parseList(patterns.join(','));
}

function parseJobBoardUrlPreview(rawUrl: string): ParsedUrlPreview | null {
  const cleaned = rawUrl.trim();
  if (!cleaned) return null;

  let parsed: URL | null = null;
  try {
    parsed = new URL(cleaned);
  } catch {
    return {
      sourceUrl: cleaned,
      titlePatterns: [],
      parseWarning: 'Stored URL but could not parse its parameters.',
    };
  }

  const titlePatterns = detectTitlePatterns(parsed);
  const seniority = detectSeniority(parsed) ?? undefined;
  const workMode = detectWorkMode(parsed) ?? undefined;

  const parsedFields: string[] = [];
  const missingFields: string[] = [];

  if (titlePatterns.length > 0) {
    parsedFields.push('titles');
  } else {
    missingFields.push('titles');
  }

  if (seniority) {
    parsedFields.push('seniority');
  } else {
    missingFields.push('seniority');
  }

  if (workMode) {
    parsedFields.push('work mode');
  } else {
    missingFields.push('work mode');
  }

  let parseWarning: string | null = null;
  if (missingFields.length === 3) {
    parseWarning = 'Stored URL but did not recognize keywords or filters.';
  } else if (missingFields.length > 0) {
    parseWarning = `Parsed ${parsedFields.join(', ')}; missing ${missingFields.join(
      ', ',
    )} from URL.`;
  }

  return {
    sourceUrl: parsed.toString(),
    titlePatterns,
    seniority,
    workMode,
    parseWarning,
  };
}

export default function SearchSetsPage() {
  const [items, setItems] = useState<SearchSet[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);

  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const [search, setSearch] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);

  const [titlePatternsInput, setTitlePatternsInput] = useState<string>('');
  const [industryInput, setIndustryInput] = useState<string>('');
  const [seniority, setSeniority] = useState<SearchSetSeniority>(SearchSetSeniority.ANY);
  const [workMode, setWorkMode] = useState<SearchSetWorkMode>(SearchSetWorkMode.ANY);
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [parsePreview, setParsePreview] = useState<ParsedUrlPreview | null>(null);

  const [detail, setDetail] = useState<SearchSet | null>(null);
  const [runResult, setRunResult] = useState<SearchSetRunResult[] | null>(null);

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return items;

    return items.filter((s) => {
      const hay = [
        s.id,
        ...(Array.isArray(s.titlePatterns) ? s.titlePatterns : []),
        ...(Array.isArray(s.industry) ? s.industry : []),
        s.seniority,
        s.workMode,
        s.sourceUrl,
      ]
        .map((v) => safeString(v).toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [items, search]);

  async function loadList() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await apiFetchJson<SearchSet[]>('/api/search-sets', { method: 'GET' });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load search sets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  function clearForm() {
    setEditingId(null);
    setTitlePatternsInput('');
    setIndustryInput('');
    setSeniority(SearchSetSeniority.ANY);
    setWorkMode(SearchSetWorkMode.ANY);
    setSourceUrl('');
    setIsActive(true);
    setParsePreview(null);
    setDetail(null);
    setRunResult(null);
    setError('');
    setNotice('');
  }

  async function loadDetail(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    setRunResult(null);
    try {
      const data = await apiFetchJson<SearchSet>(`/api/search-sets/${id}`, { method: 'GET' });
      setDetail(data);

      setEditingId(id);
      setTitlePatternsInput(Array.isArray(data.titlePatterns) ? data.titlePatterns.join('\n') : '');
      setIndustryInput(Array.isArray(data.industry) ? data.industry.join(', ') : '');
      setSeniority((data.seniority as SearchSetSeniority) ?? SearchSetSeniority.ANY);
      setWorkMode((data.workMode as SearchSetWorkMode) ?? SearchSetWorkMode.ANY);
      setSourceUrl(data.sourceUrl ?? '');
      setIsActive(Boolean(data.isActive));
      setParsePreview(parseJobBoardUrlPreview(data.sourceUrl ?? ''));

      setNotice('Loaded search set into form');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load search set');
    } finally {
      setBusy(false);
    }
  }

  async function createSearchSet() {
    setBusy(true);
    setError('');
    setNotice('');
    setRunResult(null);
    try {
      const payload: Record<string, unknown> = {
        titlePatterns: parseList(titlePatternsInput),
        industry: parseList(industryInput),
        seniority,
        workMode,
        sourceUrl: sourceUrl.trim() || null,
        isActive,
      };

      await apiFetchJson('/api/search-sets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setNotice('Search set created');
      await loadList();
      clearForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create search set');
    } finally {
      setBusy(false);
    }
  }

  async function updateSearchSet() {
    if (!editingId) return;

    setBusy(true);
    setError('');
    setNotice('');
    setRunResult(null);
    try {
      const payload: Record<string, unknown> = {
        titlePatterns: parseList(titlePatternsInput),
        industry: parseList(industryInput),
        seniority,
        workMode,
        sourceUrl: sourceUrl.trim() || null,
        isActive,
      };

      await apiFetchJson(`/api/search-sets/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setNotice('Search set updated');
      await loadList();
      await loadDetail(editingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update search set');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSearchSet(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    setRunResult(null);
    try {
      await apiFetchJson(`/api/search-sets/${id}`, { method: 'DELETE' });
      setNotice('Search set deleted');
      await loadList();
      if (editingId === id) clearForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete search set');
    } finally {
      setBusy(false);
    }
  }

  async function runSearchSet(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    setRunResult(null);
    try {
      const data = await apiFetchJson<SearchSetRunResult[]>(
        `/api/search-sets/${id}/run`,
        {
        method: 'POST',
        body: JSON.stringify({}),
        },
      );
      setRunResult(Array.isArray(data) ? data : []);
      setNotice('Search set run completed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run search set');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setParsePreview(parseJobBoardUrlPreview(sourceUrl));
  }, [sourceUrl]);

  const formModeLabel = editingId ? 'Update Search Set' : 'Create Search Set';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Search Sets</h1>
          <p className="text-sm text-gray-600">Create, manage, and run saved searches.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadList()}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
            disabled={loading || busy}
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={() => clearForm()}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
            disabled={busy}
          >
            New
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="mt-4 space-y-2">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {notice}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="rounded border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">List</h2>
                <p className="text-xs text-gray-600">Use Edit to load a record into the form.</p>
              </div>
              <div className="w-full sm:w-[320px]">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm"
                  placeholder="Filter by title, industry, mode, URL, or id"
                />
              </div>
            </div>

            <div className="mt-4 overflow-auto rounded border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">id</th>
                    <th className="whitespace-nowrap px-3 py-2">title patterns</th>
                    <th className="whitespace-nowrap px-3 py-2">seniority</th>
                    <th className="whitespace-nowrap px-3 py-2">work mode</th>
                    <th className="whitespace-nowrap px-3 py-2">source URL</th>
                    <th className="whitespace-nowrap px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>
                        {loading ? 'Loading...' : 'No search sets found.'}
                      </td>
                    </tr>
                  )}

                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs">
                        {s.id}
                      </td>
                      <td className="px-3 py-2">
                        {Array.isArray(s.titlePatterns) && s.titlePatterns.length > 0
                          ? s.titlePatterns.join(', ')
                          : '—'}
                      </td>
                      <td className="px-3 py-2">{safeString(s.seniority)}</td>
                      <td className="px-3 py-2">{safeString(s.workMode)}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-xs text-gray-700">
                        {safeString(s.sourceUrl || '')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => void loadDetail(s.id)}
                            disabled={busy}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => void runSearchSet(s.id)}
                            disabled={busy}
                          >
                            Run
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => void deleteSearchSet(s.id)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 rounded border p-4">
            <h2 className="text-lg font-semibold">Record detail</h2>
            <p className="mt-1 text-xs text-gray-600">Select a row and click Edit.</p>

            <pre className="mt-3 max-h-[220px] overflow-auto rounded bg-gray-50 p-3 text-xs">
              {detail ? JSON.stringify(detail, null, 2) : '{}'}
            </pre>
            {detail?.parseWarning && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Parsing note: {detail.parseWarning}
              </div>
            )}

            <h3 className="mt-4 text-sm font-semibold">Run result</h3>
            <div className="mt-2 rounded border">
              {runResult === null && (
                <div className="px-3 py-2 text-xs text-gray-600">No run yet.</div>
              )}

              {Array.isArray(runResult) && runResult.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-700">No matching jobs found.</div>
              )}

              {Array.isArray(runResult) && runResult.length > 0 && (
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2">Company</th>
                        <th className="whitespace-nowrap px-3 py-2">Title</th>
                        <th className="whitespace-nowrap px-3 py-2">Fit Score</th>
                        <th className="whitespace-nowrap px-3 py-2">Verdict</th>
                        <th className="whitespace-nowrap px-3 py-2">Apply</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runResult.map((item) => {
                        const link = item.applyUrl;
                        return (
                          <tr key={item.jobId} className="border-t">
                            <td className="px-3 py-2">{item.company || 'Unknown'}</td>
                            <td className="px-3 py-2">{item.title || 'Untitled role'}</td>
                            <td className="px-3 py-2">{item.fitScore ?? '—'}</td>
                            <td className="px-3 py-2">{item.verdict ?? '—'}</td>
                            <td className="px-3 py-2">
                              {link ? (
                                <a
                                  className="text-blue-700 underline"
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Apply
                                </a>
                              ) : (
                                <span className="text-gray-500">No apply link available</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded border p-4">
            <h2 className="text-lg font-semibold">{formModeLabel}</h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title patterns</label>
                <textarea
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={titlePatternsInput}
                  onChange={(e) => setTitlePatternsInput(e.target.value)}
                  placeholder="Engineer\nProduct Manager"
                  rows={4}
                  disabled={busy}
                />
                <div className="mt-1 text-xs text-gray-500">
                  One per line or comma separated. Will be auto-filled when parsing a URL.
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Industry tags</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={industryInput}
                  onChange={(e) => setIndustryInput(e.target.value)}
                  placeholder="fintech, healthcare"
                  disabled={busy}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Seniority</label>
                <select
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value as SearchSetSeniority)}
                  disabled={busy}
                >
                  {Object.values(SearchSetSeniority).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Work mode</label>
                <select
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value as SearchSetWorkMode)}
                  disabled={busy}
                >
                  {Object.values(SearchSetWorkMode).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Job board search URL (optional)
                </label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="Paste a LinkedIn or job board search URL"
                  disabled={busy}
                />
                {parsePreview && (
                  <div className="mt-2 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    <div className="font-semibold">URL parse preview</div>
                    <div className="mt-1">
                      Titles: <span className="font-mono">{parsePreview.titlePatterns.join(', ') || '—'}</span>
                    </div>
                    <div>
                      Seniority: <span className="font-mono">{parsePreview.seniority ?? '—'}</span>
                    </div>
                    <div>
                      Work mode: <span className="font-mono">{parsePreview.workMode ?? '—'}</span>
                    </div>
                    {parsePreview.parseWarning ? (
                      <div className="mt-2 text-amber-700">{parsePreview.parseWarning}</div>
                    ) : (
                      <div className="mt-2 text-green-700">Parsed filters will be applied on save.</div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={busy}
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Active
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                {!editingId ? (
                  <button
                    type="button"
                    onClick={() => void createSearchSet()}
                    className="rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
                    disabled={busy}
                  >
                    Create
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void updateSearchSet()}
                    className="rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
                    disabled={busy}
                  >
                    Save
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => clearForm()}
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                  disabled={busy}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded border p-4">
            <h2 className="text-lg font-semibold">Status</h2>
            <div className="mt-2 text-sm text-gray-700">
              <div>
                Records: <span className="font-mono">{items.length}</span>
              </div>
              <div className="mt-2">
                Filtered: <span className="font-mono">{filtered.length}</span>
              </div>
              <div className="mt-2">
                Mode: <span className="font-mono">{editingId ? 'edit' : 'create'}</span>
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-600">
              If you are not logged in, API calls will redirect to login.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
