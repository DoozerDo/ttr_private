const tiers = [
  {
    label: "Elite Fit",
    score: "95 to 100",
    interpretation: "You match the role with high confidence and clear hiring momentum.",
  },
  {
    label: "Strong Fit",
    score: "85 to 94",
    interpretation: "You are highly competitive with only minor role specific gaps.",
  },
  {
    label: "Competitive",
    score: "70 to 84",
    interpretation: "You have strong potential and should target role aligned evidence.",
  },
  {
    label: "Emerging Fit",
    score: "55 to 69",
    interpretation: "You are in range but need stronger alignment before applying broadly.",
  },
  {
    label: "Misaligned",
    score: "Below 55",
    interpretation: "Current role requirements and your verified signals are materially apart.",
  },
] as const;

export function CompatibilityPrestigeSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-14">
      <div className="mb-6 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Score Framework</p>
        <h2 className="text-3xl font-semibold text-white">Your Compatibility Score tells you where you stand</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {tiers.map((tier) => (
          <article key={tier.label} className="rounded-2xl border border-slate-700 bg-slate-900/40 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{tier.score}</p>
            <p className="mt-2 text-lg font-semibold text-white">{tier.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{tier.interpretation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
