const principles = [
  "No fabricated experience",
  "No invented companies",
  "No inflated scope",
  "No fake metrics",
] as const;

export function TruthFirstSection() {
  return (
    <section id="truth-first" className="border-y border-slate-800/70 bg-slate-950/35">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-14 md:px-10 lg:px-16">
        <div className="max-w-4xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Truth Engine</p>
          <h2 className="text-2xl font-semibold text-white lg:text-[1.75rem]">Analysis that protects your career</h2>
          <p className="text-base leading-relaxed text-slate-300">
            Target This Role protects your credibility by grounding analysis in verified experience.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((principle) => (
            <article key={principle} className="rounded-2xl bg-slate-900/55 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.24)]">
              <p className="text-sm font-semibold text-slate-100">{principle}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
