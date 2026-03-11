const snapshotPanels = [
  {
    title: "Compatibility Score",
    body: "78",
    note: "Resume-to-job verdict preview",
  },
  {
    title: "Signals Preview",
    strengths: ["Customer operations leadership", "Escalation management"],
    gaps: ["Enterprise scale ownership", "Global support leadership"],
  },
  {
    title: "Opportunity Decision",
    decisions: ["Target this role", "Strengthen platform operations experience", "Re-run analysis"],
  },
] as const;

export function OpportunitySnapshotSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-9 lg:py-10">
      <div className="mb-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Product Snapshot</p>
        <h2 className="text-3xl font-semibold text-white">What happens after the score</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{snapshotPanels[0].title}</p>
          <p className="mt-2 text-6xl font-bold leading-none text-white">{snapshotPanels[0].body}</p>
          <p className="mt-2 text-sm text-slate-300">{snapshotPanels[0].note}</p>
        </article>

        <article className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{snapshotPanels[1].title}</p>
          <div className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Strength Signals</p>
            <ul className="mt-2 space-y-1 text-sm text-emerald-100">
              {snapshotPanels[1].strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="mt-2 rounded-xl border border-amber-300/25 bg-amber-500/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">Gap Signals</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-100">
              {snapshotPanels[1].gaps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{snapshotPanels[2].title}</p>
          <ul className="mt-3 space-y-2">
            {snapshotPanels[2].decisions.map((item) => (
              <li key={item} className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
