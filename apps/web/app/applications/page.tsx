// apps/web/app/applications/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

type AnyRecord = Record<string, unknown>;

type Application = {
  id: string;
} & AnyRecord;

type ApiError = {
  message?: string;
  error?: string;
  statusCode?: number;
};

const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'REJECTED'] as const;
type Stage = (typeof STAGES)[number];

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

function normalizeStage(input: string): Stage | '' {
  const raw = input.trim();
  if (!raw) return '';

  const up = raw.toUpperCase();

  if ((STAGES as readonly string[]).includes(up)) return up as Stage;

  // Common friendly inputs
  if (up === 'APPLY' || up === 'APPLIED') return 'APPLIED';
  if (up === 'SCREEN' || up === 'SCREENING') return 'SCREENING';
  if (up === 'INTERVIEW' || up === 'INTERVIEWING') return 'INTERVIEWING';
  if (up === 'OFFER' || up === 'OFFERED') return 'OFFER';
  if (up === 'REJECT' || up === 'REJECTED') return 'REJECTED';

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
    // @ts-expect-error callers should not use apiFetch for non-json
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildPatchFromForm(form: {
  company: string;
  roleTitle: string;
  stage: string;
  link: string;
  appliedDate: string;
  notes: string;
  extraJson: string;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (form.company.trim()) patch.company = form.company.trim();

  if (form.roleTitle.trim()) {
    const rt = form.roleTitle.trim();
    // Compatibility with differing schemas
    patch.title = rt;
    patch.roleTitle = rt;
  }

  const normalizedStage = normalizeStage(form.stage);
  if (normalizedStage) {
    patch.stage = normalizedStage;
    patch.status = normalizedStage;
  }

  if (form.link.trim()) {
    const l = form.link.trim();
    patch.link = l;
    patch.url = l;
  }

  if (form.appliedDate.trim()) {
    patch.appliedAt = form.appliedDate.trim();
  }

  if (form.notes.trim()) patch.notes = form.notes.trim();

  if (form.extraJson.trim()) {
    try {
      const extra = JSON.parse(form.extraJson);
      if (isRecord(extra)) {
        for (const [k, v] of Object.entries(extra)) {
          if (k === 'id') continue;
          patch[k] = v;
        }
      }
    } catch {
      // ignore invalid JSON, UI validates separately
    }
  }

  return patch;
}

export default function ApplicationsPage() {
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const [query, setQuery] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('');

  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formCompany, setFormCompany] = useState<string>('');
  const [formRoleTitle, setFormRoleTitle] = useState<string>('');
  const [formStage, setFormStage] = useState<Stage>('APPLIED');
  const [formLink, setFormLink] = useState<string>('');
  const [formAppliedDate, setFormAppliedDate] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formExtraJson, setFormExtraJson] = useState<string>('');
  const [formJsonError, setFormJsonError] = useState<string>('');

  const selected = useMemo(() => {
    return items.find((x) => x.id === selectedId) || null;
  }, [items, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((a) => {
      const company = pickFirst(a, ['company', 'companyName', 'employer']);
      const role = pickFirst(a, ['roleTitle', 'title', 'role', 'position']);
      const stage = pickFirst(a, ['stage', 'status', 'state']);
      const link = pickFirst(a, ['link', 'url', 'jobUrl']);
      const hay = `${a.id} ${company} ${role} ${stage} ${link}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const tableColumns = useMemo(() => {
    const common = [
      'company',
      'companyName',
      'roleTitle',
      'title',
      'stage',
      'status',
      'appliedAt',
      'createdAt',
      'updatedAt',
      'link',
      'url',
    ];

    const present = new Set<string>();
    for (const it of items) {
      for (const k of Object.keys(it)) present.add(k);
    }

    const cols: string[] = ['id'];
    for (const k of common) {
      if (present.has(k) && !cols.includes(k)) cols.push(k);
    }

    if (cols.length === 1) {
      for (const k of Array.from(present)) {
        if (k === 'id') continue;
        cols.push(k);
        if (cols.length >= 6) break;
      }
    }

    return cols;
  }, [items]);

  async function refresh() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await apiFetch<Application[]>('/api/applications', {
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
    void refresh();
  }, []);

  function resetForm() {
    setSelectedId('');
    setFormMode('create');
    setFormCompany('');
    setFormRoleTitle('');
    setFormStage('APPLIED');
    setFormLink('');
    setFormAppliedDate('');
    setFormNotes('');
    setFormExtraJson('');
    setFormJsonError('');
    setNotice('');
    setError('');
  }

  function validateExtraJson(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setFormJsonError('');
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!isRecord(parsed)) {
        setFormJsonError('Extra JSON must be an object');
        return;
      }
      setFormJsonError('');
    } catch {
      setFormJsonError('Extra JSON is not valid JSON');
    }
  }

  function startEdit(app: Application) {
    setNotice('');
    setError('');
    setFormMode('edit');
    setSelectedId(app.id);

    setFormCompany(pickFirst(app, ['company', 'companyName', 'employer']));
    setFormRoleTitle(pickFirst(app, ['roleTitle', 'title', 'role', 'position']));

    const stageRaw = pickFirst(app, ['stage', 'status', 'state']);
    const normalized = normalizeStage(stageRaw) || 'APPLIED';
    setFormStage(normalized);

    setFormLink(pickFirst(app, ['link', 'url', 'jobUrl']));

    const applied = pickFirst(app, ['appliedAt', 'appliedOn', 'dateApplied']);
    setFormAppliedDate(applied);

    setFormNotes(pickFirst(app, ['notes', 'note']));

    const extras: Record<string, unknown> = {};
    const knownKeys = new Set([
      'id',
      'company',
      'companyName',
      'employer',
      'roleTitle',
      'title',
      'role',
      'position',
      'stage',
      'status',
      'state',
      'link',
      'url',
      'jobUrl',
      'appliedAt',
      'appliedOn',
      'dateApplied',
      'notes',
      'note',
    ]);
    for (const [k, v] of Object.entries(app)) {
      if (knownKeys.has(k)) continue;
      extras[k] = v;
    }
    setFormExtraJson(
      Object.keys(extras).length ? JSON.stringify(extras, null, 2) : '',
    );
    validateExtraJson(
      Object.keys(extras).length ? JSON.stringify(extras) : '',
    );
  }

  async function onCreate() {
    setNotice('');
    setError('');

    if (!formRoleTitle.trim()) {
      setError('Role Title is required.');
      return;
    }

    validateExtraJson(formExtraJson);
    if (formJsonError) return;

    const body = buildPatchFromForm({
      company: formCompany,
      roleTitle: formRoleTitle,
      stage: formStage,
      link: formLink,
      appliedDate: formAppliedDate,
      notes: formNotes,
      extraJson: formExtraJson,
    });

    try {
      await apiFetch<Application>('/api/applications', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNotice('Application created');
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function onUpdate() {
    if (!selectedId) return;

    setNotice('');
    setError('');

    if (!formRoleTitle.trim()) {
      setError('Role Title is required.');
      return;
    }

    validateExtraJson(formExtraJson);
    if (formJsonError) return;

    const patch = buildPatchFromForm({
      company: formCompany,
      roleTitle: formRoleTitle,
      stage: formStage,
      link: formLink,
      appliedDate: formAppliedDate,
      notes: formNotes,
      extraJson: formExtraJson,
    });

    try {
      await apiFetch<Application>(`/api/applications/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setNotice('Application updated');
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function onDelete(id: string) {
    setNotice('');
    setError('');
    try {
      await apiFetch<void>(`/api/applications/${id}`, {
        method: 'DELETE',
      });
      setNotice('Application deleted');
      if (selectedId === id) resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function onExport() {
    setNotice('');
    setError('');
    try {
      const res = await fetch('/api/applications/export', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        let msg = `Export failed with status ${res.status}`;
        try {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const j = (await res.json()) as ApiError;
            msg = j.message || j.error || msg;
          } else {
            const t = await res.text();
            if (t) msg = t;
          }
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();

      const ext = contentType.includes('text/csv')
        ? 'csv'
        : contentType.includes('application/vnd.openxmlformats-officedocument')
          ? 'xlsx'
          : 'bin';
      downloadBlob(blob, `applications-export.${ext}`);
      setNotice('Export downloaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="text-sm text-gray-600">
            Track, update, and export your applications.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void onExport()}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Export
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
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
          <div className="flex items-center justify-between gap-2">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by company, role, stage, link, or id"
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  {tableColumns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-3 py-2">
                      {c}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length + 1}
                      className="px-3 py-6 text-center text-gray-600"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length + 1}
                      className="px-3 py-6 text-center text-gray-600"
                    >
                      No applications found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((app) => {
                    const isSelected = selectedId === app.id;
                    return (
                      <tr
                        key={app.id}
                        className={
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }
                      >
                        {tableColumns.map((c) => {
                          const v = app[c];
                          const isDate =
                            c.toLowerCase().includes('date') ||
                            c.toLowerCase().includes('at');
                          return (
                            <td
                              key={`${app.id}:${c}`}
                              className="max-w-[240px] truncate px-3 py-2"
                              title={safeString(v)}
                            >
                              {isDate ? formatDateMaybe(v) : safeString(v)}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(app)}
                              className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDelete(app.id)}
                              className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            Tip: Use Edit to load any record into the form. The Extra JSON field
            lets you update additional properties without changing the UI.
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded border p-4">
            <h2 className="text-lg font-semibold">
              {formMode === 'create' ? 'Create' : 'Edit'} Application
            </h2>

            {formMode === 'edit' && selected && (
              <div className="mt-2 rounded border bg-gray-50 px-3 py-2 text-xs text-gray-700">
                Editing id: <span className="font-mono">{selected.id}</span>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company
                </label>
                <input
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  placeholder="Company"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Role Title
                </label>
                <input
                  value={formRoleTitle}
                  onChange={(e) => setFormRoleTitle(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  placeholder="Role title"
                />
                <div className="mt-1 text-xs text-gray-500">
                  Required. Sent as title and roleTitle.
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Stage
                </label>
                <select
                  value={formStage}
                  onChange={(e) => setFormStage(e.target.value as Stage)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-gray-500">
                  Sent to API as stage and status (enum safe).
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Link
                </label>
                <input
                  value={formLink}
                  onChange={(e) => setFormLink(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  placeholder="Job link"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Applied Date
                </label>
                <input
                  value={formAppliedDate}
                  onChange={(e) => setFormAppliedDate(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  placeholder="2025-12-27 or ISO timestamp"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Notes"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Extra JSON (object)
                </label>
                <textarea
                  value={formExtraJson}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormExtraJson(v);
                    validateExtraJson(v);
                  }}
                  className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
                  rows={8}
                  placeholder='{"cxFitScore": 94, "source": "LinkedIn"}'
                />
                {formJsonError && (
                  <div className="mt-1 text-xs text-red-700">{formJsonError}</div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {formMode === 'create' ? (
                  <button
                    type="button"
                    onClick={() => void onCreate()}
                    className="rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90"
                    disabled={!!formJsonError}
                  >
                    Create
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onUpdate()}
                    className="rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90"
                    disabled={!selectedId || !!formJsonError}
                  >
                    Save
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded border p-4">
            <h3 className="text-sm font-semibold text-gray-800">Record detail</h3>
            <div className="mt-2 text-xs text-gray-600">
              Select a row and click Edit to inspect and update.
            </div>
            <pre className="mt-3 max-h-[320px] overflow-auto rounded bg-gray-50 p-3 text-xs">
              {selected ? JSON.stringify(selected, null, 2) : '{}'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
