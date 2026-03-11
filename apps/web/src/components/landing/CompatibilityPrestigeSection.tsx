const tiers = [
  {
    label: "Elite Fit",
    score: "95 to 100",
    interpretation: "Your verified resume evidence strongly matches the role requirements and level.",
  },
  {
    label: "Strong Fit",
    score: "85 to 94",
    interpretation: "You are competitive with only minor resume-to-role gaps to address.",
  },
  {
    label: "Competitive",
    score: "70 to 84",
    interpretation: "You have credible alignment and should target the strongest supporting evidence.",
  },
  {
    label: "Emerging Fit",
    score: "55 to 69",
    interpretation: "You are in range but need clearer alignment before applying broadly.",
  },
  {
    label: "Misaligned",
    score: "Below 55",
    interpretation: "Current role requirements and your verified background are materially apart.",
  },
] as const;

export function CompatibilityPrestigeSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 lg:py-11">
      <div className="mb-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Score Framework</p>
        <h2 className="text-3xl font-semibold text-white">Resume-to-job compatibility with clear decision signals</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {tiers.map((tier) => (
          <article key={tier.label} className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{tier.score}</p>
            <p className="mt-2 text-lg font-semibold text-white">{tier.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{tier.interpretation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
