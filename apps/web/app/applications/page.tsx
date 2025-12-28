'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetchJson, downloadBlob } from '../lib/api';

type AnyRecord = Record<string, unknown>;

type Application = {
  id: string;
  company?: string;
  title?: string;
  roleTitle?: string;
  stage?: string;
  status?: string;
  link?: string;
  appliedDate?: string;
  notes?: string;
  extra?: unknown;
  extraJson?: unknown;
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

function normalizeStage(input: string): string {
  const s = (input || '').trim();
  if (!s) return 'APPLIED';
  return s.toUpperCase();
}

function parseJsonOrEmpty(input: string): unknown {
  const trimmed = (input || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Extra JSON must be valid JSON.');
  }
}

function looksLikeIsoDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toIsoDateIfNeeded(s: string): string {
  const trimmed = (s || '').trim();
  if (!trimmed) return '';
  if (looksLikeIsoDateOnly(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed;
  return d.toISOString();
}

export default function ApplicationsPage() {
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);

  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const [search, setSearch] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);

  const [company, setCompany] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [stage, setStage] = useState<string>('APPLIED');
  const [link, setLink] = useState<string>('');
  const [appliedDate, setAppliedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [extraJsonText, setExtraJsonText] = useState<string>(
    '{ "cxFitScore": 94, "source": "LinkedIn" }',
  );

  const [detail, setDetail] = useState<Application | null>(null);

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return items;

    return items.filter((a) => {
      const hay = [
        a.id,
        a.company,
        a.title,
        a.roleTitle,
        a.stage,
        a.status,
        a.link,
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
      const data = await apiFetchJson<Application[]>('/api/applications', {
        method: 'GET',
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  function clearForm() {
    setEditingId(null);
    setCompany('');
    setTitle('');
    setStage('APPLIED');
    setLink('');
    setAppliedDate('');
    setNotes('');
    setExtraJsonText('{ "cxFitScore": 94, "source": "LinkedIn" }');
    setDetail(null);
    setError('');
    setNotice('');
  }

  async function loadDetail(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await apiFetchJson<Application>(`/api/applications/${id}`, {
        method: 'GET',
      });
      setDetail(data);

      setEditingId(id);
      setCompany(safeString(data.company));
      setTitle(safeString(data.title || data.roleTitle));
      setStage(normalizeStage(safeString(data.stage || data.status || 'APPLIED')));
      setLink(safeString(data.link));
      setAppliedDate(safeString(data.appliedDate));
      setNotes(safeString(data.notes));

      const extra = data.extra ?? data.extraJson ?? {};
      const text =
        extra && typeof extra === 'object'
          ? JSON.stringify(extra, null, 2)
          : safeString(extra);
      setExtraJsonText(text || '{}');

      setNotice('Loaded application into form');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load application');
    } finally {
      setBusy(false);
    }
  }

  async function createApplication() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const t = title.trim();
      if (!t) {
        setError('Title is required.');
        return;
      }

      const payload: Record<string, unknown> = {
        company: company.trim() || undefined,
        title: t,
        roleTitle: t,
        stage: normalizeStage(stage),
        status: normalizeStage(stage),
        link: link.trim() || undefined,
        appliedDate: appliedDate.trim() ? toIsoDateIfNeeded(appliedDate) : undefined,
        notes: notes.trim() || undefined,
        extra: parseJsonOrEmpty(extraJsonText),
      };

      await apiFetchJson('/api/applications', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setNotice('Application created');
      await loadList();
      clearForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create application');
    } finally {
      setBusy(false);
    }
  }

  async function updateApplication() {
    if (!editingId) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const t = title.trim();
      if (!t) {
        setError('Title is required.');
        return;
      }

      const payload: Record<string, unknown> = {
        company: company.trim() || undefined,
        title: t,
        roleTitle: t,
        stage: normalizeStage(stage),
        status: normalizeStage(stage),
        link: link.trim() || undefined,
        appliedDate: appliedDate.trim() ? toIsoDateIfNeeded(appliedDate) : undefined,
        notes: notes.trim() || undefined,
        extra: parseJsonOrEmpty(extraJsonText),
      };

      await apiFetchJson(`/api/applications/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setNotice('Application updated');
      await loadList();
      await loadDetail(editingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update application');
    } finally {
      setBusy(false);
    }
  }

  async function deleteApplication(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiFetchJson(`/api/applications/${id}`, { method: 'DELETE' });
      setNotice('Application deleted');
      await loadList();
      if (editingId === id) clearForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete application');
    } finally {
      setBusy(false);
    }
  }

  async function exportApplications() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/applications/export', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Export failed with status ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();

      let ext = 'bin';
      if (contentType.includes('text/csv')) ext = 'csv';
      else if (contentType.includes('application/json')) ext = 'json';

      downloadBlob(blob, `applications-export.${ext}`);
      setNotice('Export downloaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  const formModeLabel = editingId ? 'Update Application' : 'Create Application';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="text-sm text-gray-600">Track, update, and export your applications.</p>
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
            onClick={() => void exportApplications()}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
            disabled={loading || busy}
          >
            Export
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
                <p className="text-xs text-gray-600">
                  Use Edit to load a record into the form.
                </p>
              </div>
              <div className="w-full sm:w-[320px]">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm"
                  placeholder="Filter by company, role, stage, link, or id"
                />
              </div>
            </div>

            <div className="mt-4 overflow-auto rounded border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">id</th>
                    <th className="whitespace-nowrap px-3 py-2">company</th>
                    <th className="whitespace-nowrap px-3 py-2">title</th>
                    <th className="whitespace-nowrap px-3 py-2">stage</th>
                    <th className="whitespace-nowrap px-3 py-2">createdAt</th>
                    <th className="whitespace-nowrap px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>
                        {loading ? 'Loading...' : 'No applications found.'}
                      </td>
                    </tr>
                  )}

                  {filtered.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs">
                        {a.id}
                      </td>
                      <td className="px-3 py-2">{safeString(a.company)}</td>
                      <td className="px-3 py-2">{safeString(a.title || a.roleTitle)}</td>
                      <td className="px-3 py-2">{safeString(a.stage || a.status)}</td>
                      <td className="px-3 py-2">{safeString(a.createdAt || '')}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => void loadDetail(a.id)}
                            disabled={busy}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => void deleteApplication(a.id)}
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

            <pre className="mt-3 max-h-[260px] overflow-auto rounded bg-gray-50 p-3 text-xs">
              {detail ? JSON.stringify(detail, null, 2) : '{}'}
            </pre>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded border p-4">
            <h2 className="text-lg font-semibold">{formModeLabel}</h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Company</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company"
                  disabled={busy}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Role Title</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Role title"
                  disabled={busy}
                />
                <div className="mt-1 text-xs text-gray-500">Required.</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Stage</label>
                <select
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  disabled={busy}
                >
                  <option value="APPLIED">APPLIED</option>
                  <option value="SCREENING">SCREENING</option>
                  <option value="INTERVIEWING">INTERVIEWING</option>
                  <option value="OFFER">OFFER</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Link</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Job link"
                  disabled={busy}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Applied Date</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={appliedDate}
                  onChange={(e) => setAppliedDate(e.target.value)}
                  placeholder="2025-12-27 or ISO timestamp"
                  disabled={busy}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes"
                  rows={3}
                  disabled={busy}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Extra JSON (object)
                </label>
                <textarea
                  className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
                  value={extraJsonText}
                  onChange={(e) => setExtraJsonText(e.target.value)}
                  rows={6}
                  disabled={busy}
                />
              </div>

              <div className="flex gap-2 pt-2">
                {!editingId ? (
                  <button
                    type="button"
                    onClick={() => void createApplication()}
                    className="rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
                    disabled={busy}
                  >
                    Create
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void updateApplication()}
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
