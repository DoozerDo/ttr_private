const engineCards = [
  {
    title: "What gets evaluated",
    subtitle: "The system checks your background against role expectations.",
    evaluates: ["Responsibilities match", "Required experience", "Seniority alignment"],
    outputs: ["Clear compatibility verdict"],
  },
  {
    title: "What you get back",
    subtitle: "Results are built to support a practical decision.",
    evaluates: ["Compatibility score", "Strength signals", "Gap signals"],
    outputs: ["Apply now or improve first"],
  },
  {
    title: "Why the result is trustworthy",
    subtitle: "Scoring is constrained by verified experience.",
    evaluates: ["No fabricated companies", "No inflated scope", "No invented metrics"],
    outputs: ["Credible career decisions"],
  },
] as const;

export function CareerIntelligenceEngineSection() {
  return (
    <section className="border-y border-slate-800/70 bg-slate-900/10">
      <div className="mx-auto w-full max-w-7xl px-4 py-7 lg:py-8">
        <div className="mb-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Why Trust This</p>
          <h2 className="text-2xl font-semibold text-white">Built for real career decisions</h2>
          <p className="max-w-3xl text-sm text-slate-300">
            Target This Role compares what the job needs against what your verified experience supports.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {engineCards.map((card) => (
            <article key={card.title} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <h3 className="text-base font-semibold text-white">{card.title}</h3>
              <p className="mt-1 text-xs text-slate-300">{card.subtitle}</p>

              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">System evaluates</p>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-200">
                  {card.evaluates.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">Outputs</p>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-200">
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
