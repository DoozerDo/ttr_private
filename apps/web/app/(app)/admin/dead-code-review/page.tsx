import Link from "next/link";

import { runHygieneAudit } from "@/src/lib/hygieneAudit";

function summarize(items: { strength: string; reasons: string[] }[]) {
  return {
    total: items.length,
    strong: items.filter((item) => item.strength === "Strong review candidate").length,
  };
}

export default async function DeadCodeReviewPage() {
  const audit = await runHygieneAudit(process.cwd());
  const summary = summarize(audit.deadCode.candidates);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Administrator</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Dead Code Review</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">
          Heuristic review only. This surfaces likely dead code candidates for monthly inspection, not deletion.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total candidates</p>
          <p className="mt-2 text-3xl font-semibold">{summary.total}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Strong candidates</p>
          <p className="mt-2 text-3xl font-semibold">{summary.strong}</p>
        </article>
      </section>
      <Link href="/admin" className="text-sm text-indigo-300 underline">Back to Admin</Link>
    </div>
  );
}
