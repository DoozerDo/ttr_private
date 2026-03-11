const engineCards = [
  {
    title: "Role Compatibility",
    subtitle: "Compare verified resume evidence against job requirements.",
    evaluates: [
      "Leadership scope",
      "Operational experience",
      "Domain alignment",
      "Customer complexity",
    ],
    outputs: ["Compatibility Score", "Strength signals", "Gap signals"],
  },
  {
    title: "Opportunity Discovery",
    subtitle: "Find roles where your verified background has stronger odds.",
    evaluates: [
      "Transferable leadership",
      "Operational signals",
      "Industry adjacency",
    ],
    outputs: ["Opportunity zones", "Industry compatibility", "Career expansion paths"],
  },
  {
    title: "Truth Guard",
    subtitle: "Protect career credibility.",
    evaluates: [
      "Verified experience",
      "No fabricated companies",
      "No inflated scope",
      "No invented metrics",
    ],
    outputs: ["Career safe materials", "Credible positioning"],
  },
] as const;

export function CareerIntelligenceEngineSection() {
  return (
    <section className="border-y border-slate-800/70 bg-slate-900/10">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:py-11">
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Platform Systems</p>
          <h2 className="text-3xl font-semibold text-white">Why this compatibility analysis is credible</h2>
          <p className="max-w-3xl text-sm text-slate-300">
            Target This Role evaluates your verified resume against real job expectations across three systems.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {engineCards.map((card) => (
            <article key={card.title} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="text-lg font-semibold text-white">{card.title}</h3>
              <p className="mt-1 text-sm text-slate-300">{card.subtitle}</p>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">System evaluates</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-200">
                  {card.evaluates.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">Outputs</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-200">
                  {card.outputs.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
