const principles = [
  "No fabricated experience",
  "No invented companies",
  "No inflated scope",
  "No fake metrics",
] as const;

export function TruthFirstSection() {
  return (
    <section className="border-y border-slate-800/70 bg-slate-950/35">
      <div className="mx-auto w-full max-w-7xl px-4 py-14">
        <div className="max-w-4xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Truth First</p>
          <h2 className="text-3xl font-semibold text-white">AI that protects your career</h2>
          <p className="text-base leading-relaxed text-slate-300">
            Most AI career tools optimize for output volume. Target This Role is built to protect career credibility
            by grounding analysis and materials in verified experience.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((principle) => (
            <article key={principle} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
              <p className="text-sm font-semibold text-slate-100">{principle}</p>
            </article>
          ))}
        </div>

        <p className="mt-6 text-sm font-medium text-slate-200">
          Your reputation matters more than artificial polish.
        </p>
      </div>
    </section>
  );
}
