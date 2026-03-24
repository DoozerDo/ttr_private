import Link from "next/link";

export default function AdminPage() {
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
          Bug reporting status
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
      </section>
    </div>
  );
}
