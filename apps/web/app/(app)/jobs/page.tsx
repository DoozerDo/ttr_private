import Link from "next/link";

export default function JobsPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Jobs</p>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-slate-100">Jobs</h1>
          <p className="text-sm text-slate-300">
            Track roles you care about and add them to your session workspace.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 text-sm text-slate-200">
        <p className="mb-3 text-base text-slate-100">
          We surface saved jobs here so you can keep your cover letters, resumes, and follow-ups
          tied to the right opportunities.
        </p>
        <Link
          href="/jobs/new"
          className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/20"
        >
          Add or import a job
        </Link>
      </section>
    </div>
  );
}
