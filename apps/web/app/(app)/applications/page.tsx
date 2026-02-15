'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetchJson, downloadBlob } from '../lib/api';
import { Alert } from '@/components/Alert';
import { EmptyState } from '@/components/EmptyState';
import { FormButton } from '@/components/FormButton';
import { PageHeader } from '@/components/PageHeader';
import { PageShell } from '@/components/PageShell';
import { TextInput } from '@/components/TextInput';

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

const STAGE_OPTIONS = [
  { value: 'SAVED', label: 'Saved' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'SCREENING', label: 'Screening' },
  { value: 'INTERVIEWING', label: 'Interviewing' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
] as const;

type StageValue = (typeof STAGE_OPTIONS)[number]['value'];

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

function normalizeStage(input: string, fallback: StageValue = 'APPLIED'): StageValue {
  const s = (input || '').trim().toUpperCase();
  const found = STAGE_OPTIONS.find((option) => option.value === s);
  return found ? found.value : fallback;
}

function stageLabel(stage: string | undefined): string {
  if (!stage) return 'Unknown';
  const found = STAGE_OPTIONS.find((option) => option.value === stage);
  if (found) return found.label;
  const pretty = stage.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase());
  return pretty || 'Unknown';
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

function formatDateDisplay(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
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
  const [stage, setStage] = useState<StageValue>('APPLIED');
  const [link, setLink] = useState<string>('');
  const [appliedDate, setAppliedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [extraJsonText, setExtraJsonText] = useState<string>(
    '{ "cxFitScore": 94, "source": "LinkedIn" }',
  );

  const [detail, setDetail] = useState<Application | null>(null);
  const [stageUpdatingId, setStageUpdatingId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);

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

  const stageFromApplication = (app: Application): StageValue =>
    normalizeStage(safeString(app.stage || app.status || ''), 'SAVED');

  const applicationsByStage = useMemo(() => {
    const buckets = STAGE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      applications: [] as Application[],
    }));
    const bucketMap = new Map<StageValue, (typeof buckets)[number]>(
      buckets.map((bucket) => [bucket.value, bucket]),
    );

    filtered.forEach((app) => {
      const normalized = stageFromApplication(app);
      const target = bucketMap.get(normalized) ?? buckets[0];
      target.applications.push(app);
    });

    return buckets;
  }, [filtered]);

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

  const loadDetail = useCallback(async (id: string) => {
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
      setStage(stageFromApplication(data));
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
  }, []);

  useEffect(() => {
    if (!focusId) {
      setFocusedEntryId(null);
      return;
    }
    if (!items.length) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }
    const target = document.querySelector(`[data-entry-id="${focusId}"]`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedEntryId(focusId);
    const timer =
      typeof window !== 'undefined'
        ? window.setTimeout(() => setFocusedEntryId(null), 3000)
        : null;
    void loadDetail(focusId);
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [focusId, items, loadDetail]);

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

  async function updateApplicationStage(id: string, nextStage: StageValue) {
    setStageUpdatingId(id);
    setError('');
    setNotice('');
    try {
      await apiFetchJson(`/api/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: normalizeStage(nextStage, nextStage) }),
      });

      await loadList();
      if (editingId === id) {
        await loadDetail(id);
      }
      setNotice('Stage updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update stage');
    } finally {
      setStageUpdatingId(null);
    }
  }

  async function deleteApplication(id: string) {
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm("Deleting this application cannot be undone. Continue?")
        : true;
    if (!confirmed) {
      return;
    }
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
    <PageShell>
      <div className="space-y-8">
        <PageHeader
          title="Applications"
          description="Track, update, and export your applications."
          rightSlot={
            <div className="flex flex-wrap gap-2">
              <FormButton variant="ghost" onClick={() => void loadList()} disabled={loading || busy}>
                Refresh
              </FormButton>
              <FormButton variant="ghost" onClick={() => void exportApplications()} disabled={loading || busy}>
                Export
              </FormButton>
              <FormButton variant="secondary" onClick={() => clearForm()} disabled={busy}>
                New
              </FormButton>
            </div>
          }
        />

        {(error || notice) && (
          <div className="space-y-3">
            {error ? <Alert intent="error" title="Error">{error}</Alert> : null}
            {notice ? <Alert intent="success">{notice}</Alert> : null}
          </div>
        )}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/40">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Pipeline</h2>
              <p className="text-xs text-slate-400">
                Applications grouped by stage. Use the dropdown to move items between stages.
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Showing <span className="font-mono">{filtered.length}</span> of{' '}
              <span className="font-mono">{items.length}</span> records
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-[920px] gap-4">
              {applicationsByStage.map((bucket) => (
                <div
                  key={bucket.value}
                  className="flex w-64 flex-shrink-0 flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3 shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">{bucket.label}</div>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">
                      {bucket.applications.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3">
                    {bucket.applications.length === 0 ? (
                      <EmptyState
                        title={loading ? 'Loading...' : 'Empty stage'}
                        body={
                          loading ? 'Fetching pipeline...' : 'No applications in this stage yet.'
                        }
                        className="max-w-full border-dashed border-white/20 bg-transparent p-3 text-xs text-slate-400 shadow-none"
                      />
                    ) : (
                      bucket.applications.map((app) => {
                        const appStage = stageFromApplication(app);
                        return (
                          <div
                            key={app.id}
                            data-entry-id={app.id}
                            className={`rounded-2xl border border-white/10 bg-white/5 p-3 text-sm shadow transition ${
                              focusedEntryId === app.id
                                ? 'ring-2 ring-amber-400/80 shadow-lg'
                                : ''
                            }`}
                          >
                            <div className="font-semibold text-slate-900">
                              {safeString(app.title || app.roleTitle) || 'Untitled role'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {safeString(app.company) || 'Unknown company'}
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                              <span>Applied</span>
                              <span className="font-mono">
                                {formatDateDisplay(safeString(app.appliedDate)) || '?'}
                              </span>
                            </div>
                            <div className="mt-3">
                              <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                                Stage
                              </label>
                              <select
                                className="mt-1 w-full rounded-2xl border border-white/20 bg-slate-900/60 px-2 py-1 text-xs text-slate-100"
                                value={appStage}
                                onChange={(e) =>
                                  void updateApplicationStage(
                                    app.id,
                                    normalizeStage(e.target.value, appStage),
                                  )
                                }
                                disabled={stageUpdatingId === app.id || busy}
                              >
                                {STAGE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <FormButton
                                variant="ghost"
                                className="px-2 py-1 text-[11px]"
                                onClick={() => void loadDetail(app.id)}
                                disabled={busy}
                              >
                                Load in form
                              </FormButton>
                              <FormButton
                                variant="ghost"
                                className="px-2 py-1 text-[11px]"
                                onClick={() => void deleteApplication(app.id)}
                                disabled={busy}
                              >
                                Delete
                              </FormButton>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">List</h2>
                  <p className="text-xs text-slate-400">Use Edit to load a record into the form.</p>
                </div>
                <div className="w-full max-w-xs">
                  <TextInput
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filter by company, role, stage, link, or id"
                  />
                </div>
              </div>

              <div className="overflow-auto rounded-2xl border border-white/10 bg-slate-900/50">
                {filtered.length === 0 ? (
                  <EmptyState
                    title={loading ? 'Loading applications' : 'No applications found'}
                    body={
                      loading
                        ? 'Fetching records...'
                        : 'Create a record to have it appear in this list.'
                    }
                    cta={
                      !loading ? (
                        <FormButton variant="secondary" onClick={() => clearForm()}>
                          Add application
                        </FormButton>
                      ) : undefined
                    }
                    className="max-w-full border border-white/20 bg-transparent px-4 py-8 shadow-none text-slate-400"
                  />
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2">id</th>
                        <th className="whitespace-nowrap px-3 py-2">company</th>
                        <th className="whitespace-nowrap px-3 py-2">title</th>
                        <th className="whitespace-nowrap px-3 py-2">stage</th>
                        <th className="whitespace-nowrap px-3 py-2">createdAt</th>
                        <th className="whitespace-nowrap px-3 py-2">actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((application) => (
                        <tr
                          key={application.id}
                          data-entry-id={application.id}
                          className={`border-t border-white/10 transition ${
                            focusedEntryId === application.id
                              ? 'ring-1 ring-amber-400/70 bg-white/5 shadow-lg'
                              : ''
                          }`}
                        >
                          <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs text-slate-400">
                            {application.id}
                          </td>
                          <td className="px-3 py-2 text-slate-100">{safeString(application.company)}</td>
                          <td className="px-3 py-2 text-slate-100">
                            {safeString(application.title || application.roleTitle)}
                          </td>
                          <td className="px-3 py-2 text-slate-100">
                            {stageLabel(stageFromApplication(application))}
                          </td>
                          <td className="px-3 py-2 text-slate-100">{safeString(application.createdAt || '')}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <FormButton
                                variant="ghost"
                                className="px-2 py-1 text-xs"
                                onClick={() => void loadDetail(application.id)}
                                disabled={busy}
                              >
                                Edit
                              </FormButton>
                              <FormButton
                                variant="ghost"
                                className="px-2 py-1 text-xs"
                                onClick={() => void deleteApplication(application.id)}
                                disabled={busy}
                              >
                                Delete
                              </FormButton>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <h2 className="text-lg font-semibold text-slate-100">Record detail</h2>
              <p className="text-xs text-slate-400">Select a row and click Edit.</p>
              <pre className="mt-3 max-h-[260px] overflow-auto rounded-2xl border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-200">
                {detail ? JSON.stringify(detail, null, 2) : '{}'}
              </pre>
            </section>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <h2 className="text-lg font-semibold text-slate-100">{formModeLabel}</h2>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Company</label>
                  <TextInput
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="Company"
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Role Title
                  </label>
                  <TextInput
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Role title"
                    disabled={busy}
                  />
                  <p className="text-[11px] text-slate-400">Required.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Stage</label>
                  <select
                    value={stage}
                    onChange={(event) => setStage(normalizeStage(event.target.value, stage))}
                    disabled={busy}
                    className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                  >
                    {STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Link</label>
                  <TextInput
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="Job link"
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Applied Date</label>
                  <TextInput
                    value={appliedDate}
                    onChange={(event) => setAppliedDate(event.target.value)}
                    placeholder="2025-12-27 or ISO timestamp"
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Notes"
                    rows={3}
                    disabled={busy}
                    className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 outline-none focus:border-amber-400 focus:bg-white/10"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Extra JSON (object)
                  </label>
                  <textarea
                    value={extraJsonText}
                    onChange={(event) => setExtraJsonText(event.target.value)}
                    rows={6}
                    disabled={busy}
                    className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-4 py-2 text-xs font-mono text-slate-100 outline-none focus:border-amber-400 focus:bg-white/10"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <FormButton
                    onClick={() => void (editingId ? updateApplication() : createApplication())}
                    disabled={busy}
                  >
                    {editingId ? 'Save' : 'Create'}
                  </FormButton>
                  <FormButton variant="secondary" onClick={() => clearForm()} disabled={busy}>
                    Clear
                  </FormButton>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <h2 className="text-lg font-semibold text-slate-100">Status</h2>
              <div className="mt-2 space-y-2 text-sm text-slate-300">
                <div>
                  Records: <span className="font-mono">{items.length}</span>
                </div>
                <div>
                  Filtered: <span className="font-mono">{filtered.length}</span>
                </div>
                <div>
                  Mode: <span className="font-mono">{editingId ? 'edit' : 'create'}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                If you are not logged in, API calls will redirect to login.
              </p>
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
