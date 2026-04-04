const outcomeCards = [
  {
    title: "Strengths",
    body: "Where your experience aligns with the role.",
  },
  {
    title: "Gaps",
    body: "Areas where the role requires capabilities not reflected in your background.",
  },
  {
    title: "Opportunity Zones",
    body: "Industries and roles where your experience is strongest.",
  },
] as const;

export function OpportunitySnapshotSection() {
  return (
    <section id="outcome-preview" className="border-y border-slate-800/70 bg-slate-900/20">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-16 md:px-10 lg:px-16">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Outcome Preview</p>
          <h2 className="text-2xl font-semibold text-white lg:text-[1.75rem]">What the analysis reveals</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {outcomeCards.map((card) => (
            <article key={card.title} className="rounded-2xl bg-slate-900/60 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.24)]">
              <h3 className="text-xl font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
