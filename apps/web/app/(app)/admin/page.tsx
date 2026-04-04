import Link from "next/link";

import {
  getFileStalenessHygieneStatus,
  readPersistedFileStalenessAuditSnapshot,
} from "@/src/lib/fileStalenessAudit";
import { runHygieneAudit } from "@/src/lib/hygieneAudit";

export default async function AdminPage() {
  const snapshot = await readPersistedFileStalenessAuditSnapshot();
  const hygieneStatus = getFileStalenessHygieneStatus(snapshot);
  const hygieneAudit = await runHygieneAudit(process.cwd());
  const deadSummary = hygieneAudit.deadCode.summary;
  const routeSummary = hygieneAudit.routes.summary;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">
          Administrator
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
          Admin console
        </h1>
      <p className="mt-2 text-sm text-slate-300">
          Central place for managing users, jobs, and baselines.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Hygiene Status</p>
              <h2 className="text-xl font-semibold text-slate-50">Repository hygiene</h2>
            </div>
            <p className="text-sm text-slate-300">Monthly operational review across staleness, dead code, and route drift.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">File Staleness</p>
            <p className="mt-2 text-sm text-slate-300">{hygieneStatus.daysSinceLastRun === null ? "First run pending" : `${hygieneStatus.daysSinceLastRun} days since last run`}</p>
            <p className="mt-2 text-2xl font-semibold">{snapshot?.summary.cold ?? 0} cold files</p>
            <p className="text-sm text-slate-300">{snapshot?.likelyCleanupCandidates ?? 0} likely cleanup candidates</p>
            <p className="mt-2 text-sm text-slate-300">{hygieneStatus.insight.label}: {hygieneStatus.insight.detail}</p>
            <Link href="/admin/file-staleness-audit" className="mt-3 inline-flex rounded-[var(--button-radius)] bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Run File Audit</Link>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Dead Code Candidates</p>
            <p className="mt-2 text-2xl font-semibold">{deadSummary.totalCandidates}</p>
            <p className="text-sm text-slate-300">{deadSummary.strongCandidates} strong candidates</p>
            <p className="mt-2 text-sm text-slate-300">{deadSummary.strongCandidates > 10 ? "Code drift detected" : deadSummary.totalCandidates ? "Moderate drift" : "Code surface looks clean"}</p>
            <Link href="/admin/dead-code-review" className="mt-3 inline-flex rounded-[var(--button-radius)] border border-white/10 px-3 py-2 text-sm font-semibold text-slate-100">Review Dead Code</Link>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Unused Route Candidates</p>
            <p className="mt-2 text-2xl font-semibold">{routeSummary.totalCandidates}</p>
            <p className="text-sm text-slate-300">{routeSummary.strongCandidates} strong candidates</p>
            <p className="mt-2 text-sm text-slate-300">{routeSummary.strongCandidates > 0 ? "Route drift detected" : "Route surface looks clean"}</p>
            <Link href="/admin/route-drift-review" className="mt-3 inline-flex rounded-[var(--button-radius)] border border-white/10 px-3 py-2 text-sm font-semibold text-slate-100">Review Routes</Link>
          </article>
        </div>
      </section>

      <section className="grid gap-4">
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/metrics"
        >
          View Beta Metrics
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/users"
        >
          Manage Users
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/jobs"
        >
          View Jobs
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/baselines"
        >
          View Baselines
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/access-codes"
        >
          Manage Access Codes
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/bug-reporting"
        >
          Open Beta Triage
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/error-health"
        >
          Error Health
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/beta-friction-dashboard"
        >
          Beta Friction Dashboard
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/funnel-diagnostics"
        >
          Funnel Diagnostics
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/product-signal"
        >
          Product Signal
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/file-staleness-audit"
        >
          File Staleness Audit
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/dead-code-review"
        >
          Dead Code Review
        </Link>
        <Link
          className="block rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-base font-medium text-slate-50 transition hover:border-slate-600 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          href="/admin/route-drift-review"
        >
          Route Drift Review
        </Link>
      </section>
    </div>
  );
}
