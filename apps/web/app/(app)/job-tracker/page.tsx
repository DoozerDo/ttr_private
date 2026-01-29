'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetchJson, downloadBlob } from '../lib/api';
import { Alert } from '@/components/Alert';
import { EmptyState } from '@/components/EmptyState';
import { FormButton } from '@/components/FormButton';
import { PageHeader } from '@/components/PageHeader';
import { PageShell } from '@/components/PageShell';
import { TextInput } from '@/components/TextInput';

type JobTrackerEntry = {
  id: string;
  company?: string | null;
  roleTitle?: string | null;
  stage?: string | null;
  dateApplied?: string | null;
  cxFitScore?: number | null;
  notes?: string | null;
  sourceUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const STAGE_OPTIONS = [
  { value: 'Prospecting', label: 'Prospecting' },
  { value: 'Applied', label: 'Applied' },
  { value: 'Interviewing', label: 'Interviewing' },
  { value: 'Offer', label: 'Offer' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Archived', label: 'Archived' },
] as const;

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function stageLabel(value: string | undefined | null) {
  if (!value) return 'Unknown';
  const match = STAGE_OPTIONS.find((option) => option.value === value);
  if (match) return match.label;
  return value;
}

export default function JobTrackerPage() {
  const [entries, setEntries] = useState<JobTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [company, setCompany] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [stage, setStage] = useState<string>(STAGE_OPTIONS[1].value);
  const [dateApplied, setDateApplied] = useState('');
  const [cxFitScore, setCxFitScore] = useState('75');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [search, setSearch] = useState('');

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.id,
        entry.company,
        entry.roleTitle,
        entry.stage,
        entry.notes,
        entry.sourceUrl,
      ]
        .map((value) => safeString(value))
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, search]);

  async function loadEntries() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetchJson<JobTrackerEntry[]>('/api/job-tracker', {
        method: 'GET',
      });
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load entries');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  function clearForm() {
    setEditingId(null);
    setCompany('');
    setRoleTitle('');
    setStage(STAGE_OPTIONS[1].value);
    setDateApplied('');
    setCxFitScore('75');
    setNotes('');
    setSourceUrl('');
    setError('');
    setNotice('');
  }

  function loadIntoForm(entry: JobTrackerEntry) {
    setEditingId(entry.id);
    setCompany(safeString(entry.company));
    setRoleTitle(safeString(entry.roleTitle));
    setStage(entry.stage ?? STAGE_OPTIONS[1].value);
    setDateApplied(entry.dateApplied ?? '');
    setCxFitScore(
      entry.cxFitScore != null ? entry.cxFitScore.toString() : '75',
    );
    setNotes(entry.notes ?? '');
    setSourceUrl(entry.sourceUrl ?? '');
    setError('');
    setNotice('Loaded entry into form');
  }

  async function submitEntry() {
    setBusy(true);
    setError('');
    setNotice('');

    const score = Number(cxFitScore);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      setError('CX Fit Score must be a number between 0 and 100.');
      setBusy(false);
      return;
    }

    const payload = {
      company: company.trim(),
      roleTitle: roleTitle.trim(),
      stage: stage.trim(),
      dateApplied: dateApplied.trim() || undefined,
      cxFitScore: score,
      notes: notes.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
    };

    try {
      if (editingId) {
        await apiFetchJson(`/api/job-tracker/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice('Entry updated');
      } else {
        await apiFetchJson('/api/job-tracker', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice('Entry created');
      }
      await loadEntries();
      clearForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save entry');
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entryId: string) {
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm('Delete this entry? This cannot be undone.')
        : true;
    if (!confirmed) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiFetchJson(`/api/job-tracker/${entryId}`, {
        method: 'DELETE',
      });
      setNotice('Entry deleted');
      await loadEntries();
      if (editingId === entryId) {
        clearForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete entry');
    } finally {
      setBusy(false);
    }
  }

  async function exportEntries() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/job-tracker/export.csv', {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Export failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const contentType = response.headers.get('content-type') || '';
      let ext = 'csv';
      if (contentType.includes('json')) {
        ext = 'json';
      }
      downloadBlob(blob, `job-tracker-export.${ext}`);
      setNotice('Export downloaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export');
    } finally {
      setBusy(false);
    }
  }

  const formMode = editingId ? 'Update' : 'Create';

  return (
    <PageShell>
      <div className="space-y-8">
        <PageHeader
          title="Job Tracker"
          description="Log your progress, review details, and export your history."
          rightSlot={
            <div className="flex flex-wrap gap-2">
              <FormButton
                variant="ghost"
                disabled={loading || busy}
                onClick={() => void loadEntries()}
              >
                Refresh
              </FormButton>
              <FormButton
                variant="ghost"
                disabled={busy}
                onClick={() => void exportEntries()}
              >
                Export CSV
              </FormButton>
              <FormButton
                variant="secondary"
                disabled={busy}
                onClick={() => clearForm()}
              >
                New Entry
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

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Entries</h2>
              <p className="text-xs text-slate-400">
                Sharing the same data as the API list. Click Edit to load a row.
              </p>
            </div>
            <div className="w-full max-w-xs">
              <TextInput
                value={search}
                placeholder="Filter by company, stage, or notes"
                onChange={(event) => setSearch(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="overflow-auto rounded-2xl border border-white/10 bg-slate-900/40">
            {filteredEntries.length === 0 ? (
              <EmptyState
                title={loading ? 'Loading entries' : 'No entries yet'}
                body={
                  loading
                    ? 'Fetching job history...'
                    : 'Create your first entry to see it here.'
                }
                cta={
                  !loading ? (
                    <FormButton variant="secondary" onClick={() => clearForm()}>
                      Add first entry
                    </FormButton>
                  ) : undefined
                }
                className="border-none bg-transparent px-4 py-10 text-slate-400"
              />
            ) : (
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Date Applied</th>
                    <th className="px-3 py-2">CX Fit</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-t border-white/10 hover:bg-white/5"
                    >
                      <td className="px-3 py-2 text-slate-100">
                        {safeString(entry.company) || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-100">
                        {safeString(entry.roleTitle) || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-100">
                        {stageLabel(entry.stage)}
                      </td>
                      <td className="px-3 py-2 text-slate-100">
                        {formatDateDisplay(entry.dateApplied)}
                      </td>
                      <td className="px-3 py-2 text-slate-100">
                        {entry.cxFitScore != null ? entry.cxFitScore : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-100">
                        {formatDateDisplay(entry.createdAt)}
                      </td>
                      <td className="flex flex-wrap gap-2 px-3 py-2">
                        <FormButton
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          onClick={() => loadIntoForm(entry)}
                          disabled={busy}
                        >
                          Edit
                        </FormButton>
                        <FormButton
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          onClick={() => void deleteEntry(entry.id)}
                          disabled={busy}
                        >
                          Delete
                        </FormButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {formMode} Entry
              </h2>
              <p className="text-xs text-slate-400">
                Stage and notes can be refined without touching the rest of the
                record.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
              {filteredEntries.length} records
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Company
                </label>
                <TextInput
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Company name"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Role title
                </label>
                <TextInput
                  value={roleTitle}
                  onChange={(event) => setRoleTitle(event.target.value)}
                  placeholder="Role title"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Stage
                </label>
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value)}
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
                <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Date applied
                </label>
                <input
                  type="date"
                  value={dateApplied}
                  onChange={(event) => setDateApplied(event.target.value)}
                  disabled={busy}
                  className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  CX Fit Score
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={cxFitScore}
                  onChange={(event) => setCxFitScore(event.target.value)}
                  disabled={busy}
                  className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  0 = low fit, 100 = high fit.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Source URL
                </label>
                <TextInput
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://..."
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  disabled={busy}
                  className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <FormButton disabled={busy} onClick={() => void submitEntry()}>
                  {formMode}
                </FormButton>
                <FormButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => clearForm()}
                >
                  Clear
                </FormButton>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
