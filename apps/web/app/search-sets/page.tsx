'use client';

import React, { useEffect, useMemo, useState } from 'react';

type AnyRecord = Record<string, unknown>;

type SearchSet = {
  id: string;
} & AnyRecord;

type ApiError = {
  message?: string;
  error?: string;
  statusCode?: number;
};

type RunResult = unknown;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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

function pickFirst(obj: AnyRecord, keys: string[]): string {
  for (const k of keys) {
    if (k in obj) return safeString(obj[k]);
  }
  return '';
}

async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let detail: ApiError = {};
    try {
      detail = isJson ? await res.json() : { message: await res.text() };
    } catch {
      detail = { message: 'Request failed' };
    }
    const msg =
      detail.message ||
      detail.error ||
      `Request failed with status ${res.status}`;
    throw new Error(msg);
  }

  if (!isJson) {
    // @ts-expect-error non-json not expected
    return (await res.text()) as T;
  }

  return (await res.json()) as T;
}

function formatDateMaybe(v: unknown): string {
  const s = safeString(v);
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function buildPayloadFromForm(form: {
  name: string;
  query: string;
  location: string;
  source: string;
  frequency: string;
  extraJson: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (form.name.trim()) {
    payload.name = form.name.trim();
    payload.title = form.name.trim();
  }

  if (form.query.trim()) payload.query = form.query.trim();
  if (form.location.trim()) payload.location = form.location.trim();
  if (form.source.trim()) payload.source = form.source.trim();
  if (form.frequency.trim()) payload.frequency = form.frequency.trim();

  if (form.extraJson.trim()) {
    try {
      const extra = JSON.parse(form.extraJson);
      if (isRecord(extra)) {
        for (const [k, v] of Object.entries(extra)) {
          if (k !== 'id') payload[k] = v;
        }
      }
    } catch {
      // validated elsewhere
    }
  }

  return payload;
}

export default function SearchSetsPage() {
  const [items, setItems] = useState<SearchSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [queryFilter, setQueryFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formName, setFormName] = useState('');
  const [formQuery, setFormQuery] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formFrequency, setFormFrequency] = useState('');
  const [formExtraJson, setFormExtraJson] = useState('');
  const [formJsonError, setFormJsonError] = useState('');

  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<RunResult>(null);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) || null,
    [items, selectedId],
  );

  const filtered = useMemo(() => {
    const q = queryFilter.trim().toLowerCase();
    if (!q) return items;

    return items.filter((s) => {
      const name = pickFirst(s, ['name', 'title']);
      const query = pickFirst(s, ['query', 'keywords']);
      const source = pickFirst(s, ['source']);
      const location = pickFirst(s, ['location']);
      const hay = `${s.id} ${name} ${query} ${source} ${location}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, queryFilter]);

  const tableColumns = useMemo(() => {
    const preferred = [
      'name',
      'title',
      'query',
      'location',
      'source',
      'frequency',
      'createdAt',
      'updatedAt',
    ];

    const present = new Set<string>();
    items.forEach((i) => Object.keys(i).forEach((k) => present.add(k)));

    const cols: string[] = ['id'];
    preferred.forEach((k) => {
      if (present.has(k)) cols.push(k);
    });

    return cols;
  }, [items]);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<SearchSet[]>('/api/search-sets');
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load search sets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetForm() {
    setFormMode('create');
    setSelectedId('');
    setFormName('');
    setFormQuery('');
    setFormLocation('');
    setFormSource('');
    setFormFrequency('');
    setFormExtraJson('');
    setFormJsonError('');
    setRunResult(null);
    setError('');
    setNotice('');
  }

  function validateExtraJson(value: string) {
    if (!value.trim()) {
      setFormJsonError('');
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (!isRecord(parsed)) {
        setFormJsonError('Extra JSON must be an object');
        return;
      }
      setFormJsonError('');
    } catch {
      setFormJsonError('Invalid JSON');
    }
  }

  function startEdit(s: SearchSet) {
    setFormMode('edit');
    setSelectedId(s.id);
    setFormName(pickFirst(s, ['name', 'title']));
    setFormQuery(pickFirst(s, ['query', 'keywords']));
    setFormLocation(pickFirst(s, ['location']));
    setFormSource(pickFirst(s, ['source']));
    setFormFrequency(pickFirst(s, ['frequency']));

    const extras: AnyRecord = {};
    Object.entries(s).forEach(([k, v]) => {
      if (
        ![
          'id',
          'name',
          'title',
          'query',
          'keywords',
          'location',
          'source',
          'frequency',
          'createdAt',
          'updatedAt',
        ].includes(k)
      ) {
        extras[k] = v;
      }
    });

    setFormExtraJson(
      Object.keys(extras).length ? JSON.stringify(extras, null, 2) : '',
    );
    validateExtraJson(JSON.stringify(extras));
  }

  async function onCreate() {
    if (!formName.trim()) {
      setError('Name is required');
      return;
    }

    validateExtraJson(formExtraJson);
    if (formJsonError) return;

    try {
      await apiFetch('/api/search-sets', {
        method: 'POST',
        body: JSON.stringify(
          buildPayloadFromForm({
            name: formName,
            query: formQuery,
            location: formLocation,
            source: formSource,
            frequency: formFrequency,
            extraJson: formExtraJson,
          }),
        ),
      });
      setNotice('Search set created');
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function onUpdate() {
    if (!selectedId) return;

    validateExtraJson(formExtraJson);
    if (formJsonError) return;

    try {
      await apiFetch(`/api/search-sets/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify(
          buildPayloadFromForm({
            name: formName,
            query: formQuery,
            location: formLocation,
            source: formSource,
            frequency: formFrequency,
            extraJson: formExtraJson,
          }),
        ),
      });
      setNotice('Search set updated');
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function onDelete(id: string) {
    try {
      await apiFetch(`/api/search-sets/${id}`, { method: 'DELETE' });
      setNotice('Search set deleted');
      if (id === selectedId) resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function onRun(id: string) {
    setRunLoading(true);
    setRunResult(null);
    setError('');
    try {
      const data = await apiFetch<RunResult>(
        `/api/search-sets/${id}/run`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      setRunResult(data);
      setNotice('Search set run complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Search Sets</h1>
      <p className="text-sm text-gray-600">Save and run job search configurations.</p>

      {(error || notice) && (
        <div className="mt-4">
          {error && <div className="text-red-700">{error}</div>}
          {notice && <div className="text-green-700">{notice}</div>}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <input
            value={queryFilter}
            onChange={(e) => setQueryFilter(e.target.value)}
            placeholder="Filter by name, query, source, location, or id"
            className="w-full rounded border px-3 py-2 text-sm"
          />

          <div className="mt-4 overflow-auto rounded border">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  {tableColumns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left">
                      {c}
                    </th>
                  ))}
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={tableColumns.length + 1} className="px-3 py-4">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumns.length + 1} className="px-3 py-4">
                      No search sets found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => (
                    <tr key={s.id}>
                      {tableColumns.map((c) => (
                        <td key={c} className="px-3 py-2">
                          {c.toLowerCase().includes('at')
                            ? formatDateMaybe(s[c])
                            : safeString(s[c])}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <button onClick={() => startEdit(s)}>Edit</button>{' '}
                        <button onClick={() => onRun(s.id)} disabled={runLoading}>
                          Run
                        </button>{' '}
                        <button onClick={() => onDelete(s.id)}>Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold">
            {formMode === 'create' ? 'Create' : 'Edit'} Search Set
          </h2>

          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Name"
            className="mt-2 w-full rounded border px-3 py-2"
          />

          <input
            value={formQuery}
            onChange={(e) => setFormQuery(e.target.value)}
            placeholder="Query"
            className="mt-2 w-full rounded border px-3 py-2"
          />

          <input
            value={formLocation}
            onChange={(e) => setFormLocation(e.target.value)}
            placeholder="Location"
            className="mt-2 w-full rounded border px-3 py-2"
          />

          <input
            value={formSource}
            onChange={(e) => setFormSource(e.target.value)}
            placeholder="Source"
            className="mt-2 w-full rounded border px-3 py-2"
          />

          <input
            value={formFrequency}
            onChange={(e) => setFormFrequency(e.target.value)}
            placeholder="Frequency"
            className="mt-2 w-full rounded border px-3 py-2"
          />

          <textarea
            value={formExtraJson}
            onChange={(e) => {
              setFormExtraJson(e.target.value);
              validateExtraJson(e.target.value);
            }}
            placeholder="Extra JSON"
            rows={6}
            className="mt-2 w-full rounded border px-3 py-2 font-mono text-xs"
          />

          <div className="mt-3 flex gap-2">
            {formMode === 'create' ? (
              <button onClick={onCreate}>Create</button>
            ) : (
              <button onClick={onUpdate}>Save</button>
            )}
            <button onClick={resetForm}>Clear</button>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold">Run result</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-gray-100 p-2 text-xs">
              {runResult ? JSON.stringify(runResult, null, 2) : '{}'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
