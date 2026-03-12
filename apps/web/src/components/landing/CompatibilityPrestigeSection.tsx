const tiers = [
  {
    label: "Strong Target",
    score: "85+",
    interpretation: "Role is aligned. Apply with confidence after a final pass.",
  },
  {
    label: "Competitive",
    score: "70 to 84",
    interpretation: "Good potential. Tighten your strongest supporting evidence first.",
  },
  {
    label: "Needs Work",
    score: "Below 70",
    interpretation: "Build missing evidence before prioritizing this role.",
  },
] as const;

export function CompatibilityPrestigeSection() {
  return (
    <section id="score-framework" className="mx-auto w-full max-w-[1200px] px-4 py-24 md:px-10 lg:px-16">
      <div className="mb-3 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Score Framework</p>
        <h2 className="text-2xl font-semibold text-white">Use the score to decide your next move</h2>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {tiers.map((tier) => (
          <article key={tier.label} className="rounded-xl border border-slate-700/80 bg-slate-900/35 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{tier.score}</p>
            <p className="mt-1.5 text-base font-semibold text-white">{tier.label}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{tier.interpretation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
