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

type Opportunity = {
  id: string;
  companyName: string;
  jobTitle: string;
  currentScore: number;
};

type OpportunityGrouped = {
  companyName: string;
  opportunities: Opportunity[];
};

type OpportunityActionCard = {
  type: string;
  opportunityId: string;
  companyName: string;
  jobTitle: string;
  message: string;
};

const CANONICAL_STAGE_OPTIONS = [
  { value: 'Targeted', label: 'Targeted' },
  { value: 'Applied', label: 'Applied' },
  { value: 'Recruiter Contact', label: 'Recruiter Contact' },
  { value: 'Interview', label: 'Interview' },
  { value: 'Offer', label: 'Offer' },
  { value: 'Closed', label: 'Closed' },
] as const;

const STAGE_MEANINGS: Record<(typeof CANONICAL_STAGE_OPTIONS)[number]['value'], string> = {
  Targeted: 'Role selected for pursuit and prep.',
  Applied: 'Application sent; waiting on response.',
  'Recruiter Contact': 'Recruiter outreach or initial screen underway.',
  Interview: 'In active interview process.',
  Offer: 'Offer received or final-stage decision pending.',
  Closed: 'No longer active (rejected, withdrawn, or archived).',
};

const VIEW_MODES = [
  { id: 'table', label: 'Table' },
  { id: 'pipeline', label: 'Pipeline' },
] as const;

type CanonicalStageValue = (typeof CANONICAL_STAGE_OPTIONS)[number]['value'];
type ViewMode = (typeof VIEW_MODES)[number]['id'];

// Legacy stage values remain stored for backward compatibility but should show the canonical label/output.
const LEGACY_STAGE_TO_CANONICAL: Record<string, CanonicalStageValue> = {
  Draft: 'Targeted',
  Prospecting: 'Applied',
  Interviewing: 'Interview',
  Rejected: 'Closed',
  Archived: 'Closed',
} as const;

function isCanonicalStage(value?: string | null): value is CanonicalStageValue {
  if (!value) return false;
  return CANONICAL_STAGE_OPTIONS.some((option) => option.value === value.trim());
}

function canonicalStageValue(value?: string | null): CanonicalStageValue | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isCanonicalStage(trimmed)) {
    return trimmed;
  }
  return LEGACY_STAGE_TO_CANONICAL[trimmed as keyof typeof LEGACY_STAGE_TO_CANONICAL] ?? null;
}

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
  const canonical = canonicalStageValue(value);
  if (canonical) return canonical;
  const trimmed = value.trim();
  return trimmed || 'Unknown';
}

const STAGE_PROGRESS_ORDER: Record<CanonicalStageValue, number> = {
  Targeted: 1,
  Applied: 2,
  'Recruiter Contact': 3,
  Interview: 4,
  Offer: 5,
  Closed: 6,
};

type ProgressCheck = {
  id: string;
  label: string;
  complete: boolean;
};

function getProgressChecks(entry: JobTrackerEntry): ProgressCheck[] {
  const score = typeof entry.cxFitScore === 'number' ? entry.cxFitScore : 0;
  const canonicalStage = canonicalStageValue(entry.stage);
  const stageOrder = canonicalStage ? STAGE_PROGRESS_ORDER[canonicalStage] : 0;

  return [
    { id: 'resume', label: 'Resume ready', complete: score >= 70 },
    { id: 'cover', label: 'Cover letter ready', complete: score >= 70 },
    { id: 'applied', label: 'Applied', complete: stageOrder >= STAGE_PROGRESS_ORDER.Applied },
    {
      id: 'prep',
      label: 'Interview prep started',
      complete: stageOrder >= STAGE_PROGRESS_ORDER['Recruiter Contact'],
    },
  ];
}

type EntrySummary = {
  company: string;
  roleTitle: string;
  stage: string;
  dateApplied: string;
  cxFitScore: string | number;
  createdAt: string;
};

function getEntrySummary(entry: JobTrackerEntry): EntrySummary {
  return {
    company: safeString(entry.company) || '-',
    roleTitle: safeString(entry.roleTitle) || '-',
    stage: stageLabel(entry.stage),
    dateApplied: formatDateDisplay(entry.dateApplied),
    cxFitScore: entry.cxFitScore != null ? entry.cxFitScore : '-',
    createdAt: formatDateDisplay(entry.createdAt),
  };
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
  const [stage, setStage] = useState<string>(CANONICAL_STAGE_OPTIONS[0].value);
  const [dateApplied, setDateApplied] = useState('');
  const [cxFitScore, setCxFitScore] = useState('75');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [opportunityActions, setOpportunityActions] = useState<OpportunityActionCard[]>([]);
  const [opportunitySummary, setOpportunitySummary] = useState({
    jobsAnalyzed: 0,
    strongTargets: 0,
    possibleTargets: 0,
    lowProbability: 0,
  });

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

  const strongestOpportunities = useMemo(() => {
    return [...entries]
      .filter((entry) => typeof entry.cxFitScore === 'number')
      .sort((a, b) => (b.cxFitScore ?? 0) - (a.cxFitScore ?? 0))
      .slice(0, 3);
  }, [entries]);

  const pipelineStageGroups = useMemo(() => {
    const groups = CANONICAL_STAGE_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      entries: [] as JobTrackerEntry[],
    }));
    const otherGroup = {
      key: 'Other',
      label: 'Other',
      entries: [] as JobTrackerEntry[],
    };

    for (const entry of filteredEntries) {
      const canonical = canonicalStageValue(entry.stage);
      if (canonical) {
        const group = groups.find((item) => item.key === canonical);
        if (group) {
          group.entries.push(entry);
        }
      } else {
        otherGroup.entries.push(entry);
      }
    }

    return otherGroup.entries.length ? [...groups, otherGroup] : groups;
  }, [filteredEntries]);

  async function loadEntries() {
    setLoading(true);
    setError('');
    try {
      const [trackerResult, groupedResult, actionsResult] = await Promise.allSettled([
        apiFetchJson<JobTrackerEntry[]>('/api/job-tracker', { method: 'GET' }),
        apiFetchJson<OpportunityGrouped[]>('/api/opportunities/grouped', { method: 'GET' }),
        apiFetchJson<OpportunityActionCard[]>('/api/opportunities/actions-needed', { method: 'GET' }),
      ]);

      if (trackerResult.status !== 'fulfilled') {
        throw trackerResult.reason;
      }

      const data = trackerResult.value;
      setEntries(Array.isArray(data) ? data : []);

      if (groupedResult.status === 'fulfilled' && Array.isArray(groupedResult.value)) {
        const opportunities = groupedResult.value.flatMap((group) =>
          Array.isArray(group.opportunities) ? group.opportunities : [],
        );
        const jobsAnalyzed = opportunities.length;
        const strongTargets = opportunities.filter((entry) => entry.currentScore >= 85).length;
        const possibleTargets = opportunities.filter(
          (entry) => entry.currentScore >= 70 && entry.currentScore < 85,
        ).length;
        const lowProbability = opportunities.filter((entry) => entry.currentScore < 70).length;
        setOpportunitySummary({
          jobsAnalyzed,
          strongTargets,
          possibleTargets,
          lowProbability,
        });
      } else {
        setOpportunitySummary({
          jobsAnalyzed: 0,
          strongTargets: 0,
          possibleTargets: 0,
          lowProbability: 0,
        });
      }

      if (actionsResult.status === 'fulfilled' && Array.isArray(actionsResult.value)) {
        setOpportunityActions(actionsResult.value.slice(0, 3));
      } else {
        setOpportunityActions([]);
      }
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
    setStage(CANONICAL_STAGE_OPTIONS[0].value);
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
    setStage(
      canonicalStageValue(entry.stage) ?? CANONICAL_STAGE_OPTIONS[0].value,
    );
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

  const entriesEmptyState = (
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
  );

  return (
    <PageShell>
      <div className="space-y-8">
        <PageHeader
          title="Opportunities"
          description="Your canonical beta destination for managing active roles and next steps."
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

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Canonical beta destination</p>
            <h2 className="text-lg font-semibold text-slate-100">Manage every opportunity in one place</h2>
            <p className="text-sm text-slate-300">
              Keep stage, fit, source, and notes current so next actions stay obvious.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {CANONICAL_STAGE_OPTIONS.map((option) => (
              <div key={option.value} className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{option.label}</p>
                <p className="mt-1 text-xs text-slate-400">{STAGE_MEANINGS[option.value]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Prioritization</p>
            <h2 className="text-lg font-semibold text-slate-100">Your strongest opportunities</h2>
            <p className="text-sm text-slate-300">
              Ranked by CX Fit Score so high-potential roles stay visible first.
            </p>
          </div>
          {strongestOpportunities.length ? (
            <div className="space-y-2">
              {strongestOpportunities.map((entry) => (
                <div
                  key={`strongest-${entry.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2"
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {safeString(entry.company) || 'Unknown company'} - {safeString(entry.roleTitle) || 'Untitled role'}
                  </p>
                  <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    Score {(entry.cxFitScore ?? 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Run compatibility scoring and add opportunities to rank them here.</p>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Opportunity signals</h2>
            <p className="text-xs text-slate-400">
              Prioritization context from analyzed roles, kept inside this same destination.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Jobs analyzed</p>
              <p className="mt-1 text-2xl font-semibold text-white">{opportunitySummary.jobsAnalyzed}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Strong targets</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-200">{opportunitySummary.strongTargets}</p>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Possible targets</p>
              <p className="mt-1 text-2xl font-semibold text-amber-200">{opportunitySummary.possibleTargets}</p>
            </div>
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Low probability</p>
              <p className="mt-1 text-2xl font-semibold text-rose-200">{opportunitySummary.lowProbability}</p>
            </div>
          </div>
          {opportunityActions.length ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Top actions needed</p>
              {opportunityActions.map((action) => (
                <div
                  key={`${action.opportunityId}-${action.type}`}
                  className="rounded-xl border border-white/10 bg-slate-900/40 p-3"
                >
                  <p className="text-sm font-semibold text-white">
                    {action.jobTitle} at {action.companyName}
                  </p>
                  <p className="text-xs text-slate-300">{action.message}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Tracked opportunities</h2>
              <p className="text-xs text-slate-400">
                Switch between table and pipeline views to update status quickly.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex flex-wrap gap-2">
                {VIEW_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                      viewMode === mode.id
                        ? 'border-white/40 bg-white/10 text-white'
                        : 'border-white/20 text-slate-400'
                    }`}
                    onClick={() => setViewMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
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
          </div>

          {viewMode === "table" ? (
            <div className="overflow-auto rounded-2xl border border-white/10 bg-slate-900/40">
              {filteredEntries.length === 0 ? (
                entriesEmptyState
              ) : (
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Date Applied</th>
                      <th className="px-3 py-2">CX Fit</th>
                      <th className="px-3 py-2">Progress</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const summary = getEntrySummary(entry);
                      const progressChecks = getProgressChecks(entry);
                      return (
                        <tr
                          key={entry.id}
                          className="border-t border-white/10 hover:bg-white/5"
                        >
                          <td className="px-3 py-2 text-slate-100">
                            {summary.company}
                          </td>
                          <td className="px-3 py-2 text-slate-100">
                            {summary.roleTitle}
                          </td>
                          <td className="px-3 py-2 text-slate-100">
                            {summary.stage}
                          </td>
                          <td className="px-3 py-2 text-slate-100">
                            {summary.dateApplied}
                          </td>
                          <td className="px-3 py-2 text-slate-100">
                            {summary.cxFitScore}
                          </td>
                          <td className="px-3 py-2">
                            <div className="space-y-1">
                              {progressChecks.map((check) => (
                                <p key={`${entry.id}-${check.id}`} className="text-xs text-slate-300">
                                  <span className="mr-1">{check.complete ? '✓' : '□'}</span>
                                  {check.label}
                                </p>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-100">
                            {summary.createdAt}
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
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEntries.length === 0 ? (
                entriesEmptyState
              ) : (
                pipelineStageGroups.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">
                        {group.label}
                      </span>
                      <span className="text-xs text-slate-400">
                        {group.entries.length} record
                        {group.entries.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {group.entries.length ? (
                      <div className="mt-4 space-y-3">
                        {group.entries.map((entry) => {
                          const summary = getEntrySummary(entry);
                          const progressChecks = getProgressChecks(entry);
                          return (
                            <div
                              key={entry.id}
                              className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"
                            >
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                                    Company
                                  </p>
                                  <p className="text-sm font-semibold text-white">
                                    {summary.company}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                                    Role
                                  </p>
                                  <p className="text-sm font-semibold text-white">
                                    {summary.roleTitle}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                                    Stage
                                  </p>
                                  <p className="text-sm font-semibold text-white">
                                    {summary.stage}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                                    CX Fit
                                  </p>
                                  <p className="text-sm font-semibold text-white">
                                    {summary.cxFitScore}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                                    Date Applied
                                  </p>
                                  <p className="text-sm font-semibold text-white">
                                    {summary.dateApplied || "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                                    Created
                                  </p>
                                  <p className="text-sm font-semibold text-white">
                                    {summary.createdAt || "-"}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                                  Progress
                                </p>
                                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                  {progressChecks.map((check) => (
                                    <p key={`${entry.id}-${check.id}`} className="text-xs text-slate-300">
                                      <span className="mr-1">{check.complete ? '✓' : '□'}</span>
                                      {check.label}
                                    </p>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 pt-3">
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
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-400">
                        No entries at this stage.
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {formMode} Entry
              </h2>
              <p className="text-xs text-slate-400">
                Add a new opportunity or update an existing one from a single form.
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
                  {CANONICAL_STAGE_OPTIONS.map((option) => (
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






