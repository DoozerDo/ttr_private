"use client";

import { useMemo, useState } from "react";

import type {
  FileStalenessAuditResult,
  FileStalenessBucket,
  FileStalenessRecord,
  PersistedFileStalenessAuditSnapshot,
} from "@/src/lib/fileStalenessAudit.shared";
import {
  buildFileStalenessAuditSummaryText,
  getCandidateReason,
  getCandidateTag,
  getAuditReminderStatus,
  getLikelyCleanupCandidates,
  getUniqueExtensions,
  matchesAuditQuery,
} from "@/src/lib/fileStalenessAudit.shared";

type SortMode = "oldest" | "newest" | "path";
type ResultBucket = FileStalenessBucket | "all";
type Props = {
  persistedSnapshot: PersistedFileStalenessAuditSnapshot | null;
};

type AuditPayload = {
  result: FileStalenessAuditResult;
  snapshot: PersistedFileStalenessAuditSnapshot;
};

const SNAPSHOT_KEY = "ttr.admin.file-staleness-audit.snapshot";

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "not yet run";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatSize(sizeBytes: number | null) {
  if (sizeBytes === null) return "n/a";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function bucketLabel(bucket: FileStalenessBucket) {
  return bucket === "ACTIVE" ? "Active" : bucket === "DORMANT" ? "Dormant" : bucket === "STALE" ? "Stale" : "Cold";
}

function countByBucket(records: FileStalenessRecord[], bucket: FileStalenessBucket) {
  return records.filter((record) => record.bucket === bucket);
}

function buildFilterSummary(filters: { bucket: ResultBucket; extension: string; query: string }) {
  const parts = [
    filters.bucket === "all" ? "All buckets" : bucketLabel(filters.bucket),
    filters.extension === "all" ? "All extensions" : filters.extension,
    filters.query.trim() ? `Search: ${filters.query.trim()}` : "Search: none",
  ];
  return parts.join(" • ");
}

function canReadClipboard() {
  return typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText);
}

export function FileStalenessAuditClient({ persistedSnapshot }: Props) {
  const [result, setResult] = useState<FileStalenessAuditResult | null>(null);
  const [snapshot, setSnapshot] = useState<PersistedFileStalenessAuditSnapshot | null>(persistedSnapshot);
  const [query, setQuery] = useState("");
  const [extension, setExtension] = useState("all");
  const [bucket, setBucket] = useState<ResultBucket>("STALE");
  const [sortMode, setSortMode] = useState<SortMode>("oldest");
  const [isRunning, setIsRunning] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const storedSnapshot = useMemo(() => {
    if (typeof window === "undefined") return snapshot;
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_KEY);
      return raw ? (JSON.parse(raw) as PersistedFileStalenessAuditSnapshot) : snapshot;
    } catch {
      return snapshot;
    }
  }, [snapshot]);

  const currentSnapshot = snapshot ?? storedSnapshot;
  const lastAuditRunAt = currentSnapshot?.lastAuditRunAt ?? null;
  const daysSinceLastAudit = useMemo(() => {
    if (!lastAuditRunAt) return null;
    const diff = Date.now() - new Date(lastAuditRunAt).getTime();
    if (!Number.isFinite(diff)) return null;
    return Math.max(0, Math.floor(diff / 86_400_000));
  }, [lastAuditRunAt]);

  const status = getAuditReminderStatus(daysSinceLastAudit);

  const summary = result?.summary ?? currentSnapshot?.summary ?? {
    active: 0,
    dormant: 0,
    stale: 0,
    cold: 0,
    totalScanned: 0,
    totalExcluded: 0,
  };

  const records = result?.records ?? [];
  const extensions = useMemo(() => ["all", ...getUniqueExtensions(records)], [records]);

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => (bucket === "all" ? true : record.bucket === bucket))
      .filter((record) => (extension === "all" ? true : record.extension === extension))
      .filter((record) => matchesAuditQuery(record, query))
      .sort((left, right) => {
        if (sortMode === "path") return left.relativePath.localeCompare(right.relativePath);
        if (sortMode === "newest") return new Date(right.lastModifiedAt).getTime() - new Date(left.lastModifiedAt).getTime();
        return new Date(left.lastModifiedAt).getTime() - new Date(right.lastModifiedAt).getTime();
      });
  }, [bucket, extension, query, records, sortMode]);

  const likelyCleanupCandidates = useMemo(() => getLikelyCleanupCandidates(records), [records]);
  const candidateRows = likelyCleanupCandidates
    .filter((record) => (bucket === "all" ? true : record.bucket === bucket))
    .filter((record) => (extension === "all" ? true : record.extension === extension))
    .filter((record) => matchesAuditQuery(record, query))
    .sort((left, right) => {
      if (sortMode === "path") return left.relativePath.localeCompare(right.relativePath);
      if (sortMode === "newest") return new Date(right.lastModifiedAt).getTime() - new Date(left.lastModifiedAt).getTime();
      return new Date(left.lastModifiedAt).getTime() - new Date(right.lastModifiedAt).getTime();
    });

  const dormantRows = countByBucket(filteredRecords, "DORMANT");
  const staleRows = countByBucket(filteredRecords, "STALE");
  const coldRows = countByBucket(filteredRecords, "COLD");
  const activeRows = countByBucket(filteredRecords, "ACTIVE");

  const loadSnapshotFromServer = async () => {
    setIsRunning(true);
    setCopyStatus(null);
    try {
      const response = await fetch("/api/admin/file-staleness-audit", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Unable to run audit (${response.status})`);
      }
      const payload = (await response.json()) as AuditPayload;
      setResult(payload.result);
      setSnapshot(payload.snapshot);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload.snapshot));
      }
    } finally {
      setIsRunning(false);
    }
  };

  const copySummary = async () => {
    const summaryText = buildFileStalenessAuditSummaryText({
      scannedAt: lastAuditRunAt ?? new Date().toISOString(),
      summary,
      candidatesCount: likelyCleanupCandidates.length,
    });
    if (!canReadClipboard()) {
      setCopyStatus("Clipboard unavailable");
      return;
    }
    await navigator.clipboard.writeText(summaryText);
    setCopyStatus("Summary copied");
  };

  const reminderTone =
    status === "overdue"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
      : status === "due_soon"
        ? "border-slate-400/30 bg-slate-400/10 text-slate-100"
        : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";

  const activeFiltersSummary = buildFilterSummary({ bucket, extension, query });

  const renderRows = (rows: FileStalenessRecord[], emptyText: string) =>
    rows.length ? (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
            <tr>
              <th className="px-4 py-3">Path</th>
              <th className="px-4 py-3">Modified</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.relativePath} className="border-t border-white/10">
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <p className="font-medium text-slate-100">{record.relativePath}</p>
                    {getCandidateTag(record) ? (
                      <p className="text-xs uppercase tracking-[0.2em] text-amber-200">
                        {getCandidateTag(record)}
                      </p>
                    ) : null}
                    {getCandidateTag(record) ? (
                      <p className="text-xs text-slate-400">Why flagged: {getCandidateReason(record)}</p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">{new Date(record.lastModifiedAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-300">{record.ageDays} days</td>
                <td className="px-4 py-3 text-slate-300">{record.kind === "env" ? "env" : record.extension}</td>
                <td className="px-4 py-3 text-slate-300">{formatSize(record.sizeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-sm text-slate-400">{emptyText}</p>
    );

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border px-4 py-3 text-sm ${reminderTone}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold uppercase tracking-[0.25em]">Monthly hygiene check</span>
          <span>Review stale and cold files.</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <span>Last audit run: {formatTimestamp(lastAuditRunAt)}</span>
          <span>{daysSinceLastAudit !== null ? `${daysSinceLastAudit} days since last audit` : "First run not recorded"}</span>
          <span className="rounded-full border border-current/20 px-2 py-0.5 uppercase tracking-[0.2em]">
            {status === "healthy" ? "Healthy" : status === "due_soon" ? "Due soon" : status === "overdue" ? "Overdue" : "First run"}
          </span>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void loadSnapshotFromServer()}
          disabled={isRunning}
          className="rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {isRunning ? "Running audit..." : result ? "Run audit again" : "Run audit"}
        </button>
        <button
          type="button"
          onClick={() => void copySummary()}
          className="rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
        >
          Copy summary
        </button>
        {copyStatus ? <span className="text-sm text-slate-400">{copyStatus}</span> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Active", summary.active],
          ["Dormant", summary.dormant],
          ["Stale", summary.stale],
          ["Cold", summary.cold],
          ["Total scanned", summary.totalScanned],
          ["Total excluded", summary.totalExcluded],
        ].map(([label, value]) => (
          <article key={label as string} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">{value as number}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">Filter summary</p>
        <p className="mt-1">{activeFiltersSummary}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          Result count: {filteredRecords.length} matching files
        </p>
      </section>

      <section className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 md:grid-cols-4">
        <label className="space-y-2 text-sm text-slate-300">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-slate-100"
            placeholder="Path or filename"
          />
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>Extension</span>
          <select
            value={extension}
            onChange={(event) => setExtension(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-slate-100"
          >
            {extensions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>Age bucket</span>
          <select
            value={bucket}
            onChange={(event) => setBucket(event.target.value as ResultBucket)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-slate-100"
          >
            <option value="STALE">Stale</option>
            <option value="COLD">Cold</option>
            <option value="DORMANT">Dormant</option>
            <option value="ACTIVE">Active</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>Sort</span>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-slate-100"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="path">Path</option>
          </select>
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-50">Likely cleanup candidates</h2>
        <p className="text-sm text-slate-400">
          Review candidates only. These are older files in places that often deserve a monthly hygiene pass.
        </p>
        {renderRows(candidateRows, "No likely cleanup candidates right now.")}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-50">Cold files over 90 days</h2>
        {renderRows(coldRows, "No cold files match these filters.")}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-50">Stale files 61 to 90 days</h2>
        {renderRows(staleRows, "No stale files match these filters.")}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-50">Dormant files 31 to 60 days</h2>
        {renderRows(dormantRows, "No dormant files match these filters.")}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-50">Active files</h2>
        {activeRows.length ? (
          <p className="text-sm text-slate-300">{activeRows.length} active files currently in scope.</p>
        ) : (
          <p className="text-sm text-slate-400">No active files match these filters.</p>
        )}
      </section>
    </div>
  );
}
