'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetchJson } from '../lib/api';

type AnyRecord = Record<string, unknown>;

type SearchSet = {
  id: string;
  name?: string;
  query?: string;
  location?: string;
  remoteOk?: boolean;
  sources?: string[];
  createdAt?: string;
  updatedAt?: string;
} & AnyRecord;

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

function parseCsvList(input: string): string[] {
  const s = (input || '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function SearchSetsPage() {
  const [items, setItems] = useState<SearchSet[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);

  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const [search, setSearch] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [remoteOk, setRemoteOk] = useState<boolean>(true);
  const [sourcesCsv, setSourcesCsv] = useState<string>('linkedin, greenhouse');

  const [detail, setDetail] = useState<SearchSet | null>(null);
  const [runResult, setRunResult] = useState<unknown>(null);

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return items;

    return items.filter((s) => {
      const hay = [
        s.id,
        s.name,
        s.query,
        s.location,
        ...(Array.isArray(s.sources) ? s.sources : []),
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
    setName('');
    setQuery('');
    setLocation('');
    setRemoteOk(true);
    setSourcesCsv('linkedin, greenhouse');
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
      setName(safeString(data.name));
      setQuery(safeString(data.query));
      setLocation(safeString(data.location));
      setRemoteOk(Boolean(data.remoteOk));
      setSourcesCsv(Array.isArray(data.sources) ? data.sources.join(', ') : safeString(data.sources));

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
      const n = name.trim();
      if (!n) {
        setError('Name is required.');
        return;
      }

      const payload: Record<string, unknown> = {
        name: n,
        query: query.trim() || undefined,
        location: location.trim() || undefined,
        remoteOk,
        sources: parseCsvList(sourcesCsv),
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
      const n = name.trim();
      if (!n) {
        setError('Name is required.');
        return;
      }

      const payload: Record<string, unknown> = {
        name: n,
        query: query.trim() || undefined,
        location: location.trim() || undefined,
        remoteOk,
        sources: parseCsvList(sourcesCsv),
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
      const data = await apiFetchJson<unknown>(`/api/search-sets/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setRunResult(data);
      setNotice('Search set run completed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run search set');
    } finally {
      setBusy(false);
    }
  }

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
                  placeholder="Filter by name, query, location, sources, or id"
                />
              </div>
            </div>

            <div className="mt-4 overflow-auto rounded border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">id</th>
                    <th className="whitespace-nowrap px-3 py-2">name</th>
                    <th className="whitespace-nowrap px-3 py-2">query</th>
                    <th className="whitespace-nowrap px-3 py-2">location</th>
                    <th className="whitespace-nowrap px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                        {loading ? 'Loading...' : 'No search sets found.'}
                      </td>
                    </tr>
                  )}

                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs">
                        {s.id}
                      </td>
                      <td className="px-3 py-2">{safeString(s.name)}</td>
                      <td className="px-3 py-2">{safeString(s.query)}</td>
                      <td className="px-3 py-2">{safeString(s.location)}</td>
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

            <h3 className="mt-4 text-sm font-semibold">Run result</h3>
            <pre className="mt-2 max-h-[260px] overflow-auto rounded bg-gray-50 p-3 text-xs">
              {runResult ? JSON.stringify(runResult, null, 2) : '{}'}
            </pre>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded border p-4">
            <h2 className="text-lg font-semibold">{formModeLabel}</h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Search set name"
                  disabled={busy}
                />
                <div className="mt-1 text-xs text-gray-500">Required.</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Query</label>
                <textarea
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Role keywords"
                  rows={3}
                  disabled={busy}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Seattle, WA"
                  disabled={busy}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="remoteOk"
                  type="checkbox"
                  checked={remoteOk}
                  onChange={(e) => setRemoteOk(e.target.checked)}
                  disabled={busy}
                />
                <label htmlFor="remoteOk" className="text-sm text-gray-700">
                  Remote OK
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Sources (comma separated)
                </label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={sourcesCsv}
                  onChange={(e) => setSourcesCsv(e.target.value)}
                  placeholder="linkedin, greenhouse, lever"
                  disabled={busy}
                />
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
