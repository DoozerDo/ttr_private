const decisionPanels = [
  {
    title: "Target This Role",
    body: "Apply when your verified experience aligns with the role level, scope, and operating context.",
  },
  {
    title: "Strengthen First",
    body: "Focus on the highest-impact gaps before applying so your resume evidence supports a stronger outcome.",
  },
  {
    title: "Skip This Role",
    body: "Avoid low-probability paths when the role demands are materially outside your current verified background.",
  },
] as const;

export function DecisionIntelligenceSection() {
  return (
    <section className="border-y border-slate-800/70 bg-slate-900/20">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-24 md:px-10 lg:px-16">
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Decision Intelligence</p>
          <h2 className="text-3xl font-semibold text-white">Stop guessing which jobs you qualify for</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {decisionPanels.map((panel) => (
            <article key={panel.title} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="text-xl font-semibold text-white">{panel.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{panel.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
