import Link from "next/link";

import {
  getAuditReminderStatus,
  getDaysSinceLastAudit,
  getHygieneInsight,
  type PersistedFileStalenessAuditSnapshot,
} from "@/src/lib/fileStalenessAudit.shared";

type Props = {
  snapshot: PersistedFileStalenessAuditSnapshot | null;
};

export function HygieneStatusModule({ snapshot }: Props) {
  const daysSinceLastRun = getDaysSinceLastAudit(snapshot?.lastAuditRunAt ?? null);
  const reminderStatus = getAuditReminderStatus(daysSinceLastRun);
  const summary = snapshot?.summary ?? {
    active: 0,
    dormant: 0,
    stale: 0,
    cold: 0,
    totalScanned: 0,
    totalExcluded: 0,
  };
  const insight = getHygieneInsight(summary);

  const badgeLabel =
    reminderStatus === "healthy"
      ? "Healthy"
      : reminderStatus === "due_soon"
        ? "Due soon"
        : reminderStatus === "overdue"
          ? "Overdue"
          : "First run";

  const tone =
    reminderStatus === "overdue"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
      : reminderStatus === "due_soon"
        ? "border-slate-400/30 bg-slate-400/10 text-slate-100"
        : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Hygiene Status</p>
            <h2 className="text-xl font-semibold text-slate-50">File Staleness</h2>
          </div>
          <p className="text-sm text-slate-300">
            {snapshot
              ? "Monthly hygiene check for repo staleness and cleanup candidates."
              : "No audit run yet. Run the first audit to establish a repo hygiene baseline."}
          </p>
          <p className="text-sm text-slate-300">Monthly hygiene check: review stale and cold files.</p>
        </div>
        <Link
          href="/admin/file-staleness-audit"
          className="rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Run Audit
        </Link>
      </div>

      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm ${tone}`}>
        <span className="font-semibold uppercase tracking-[0.2em]">{badgeLabel}</span>
        <span>Last run: {snapshot?.lastAuditRunAt ? new Date(snapshot.lastAuditRunAt).toLocaleString() : "not yet run"}</span>
        <span>
          {daysSinceLastRun === null ? "First run pending" : `${daysSinceLastRun} days since last run`}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Cold files", summary.cold],
          ["Likely cleanup candidates", snapshot?.likelyCleanupCandidates ?? 0],
          ["Total scanned", summary.totalScanned],
          ["Total excluded", summary.totalExcluded],
        ].map(([label, value]) => (
          <article key={label as string} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">{value as number}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">{insight.label}</p>
        <p className="mt-1">{insight.detail}</p>
      </div>
    </section>
  );
}
