const steps = [
  {
    title: "Upload your resume baseline",
    body: "Your verified background becomes the evidence foundation for analysis.",
  },
  {
    title: "Compare against a real job description",
    body: "Run compatibility scoring against role requirements, level, and tooling expectations.",
  },
  {
    title: "Target with confidence",
    body: "Use strengths and gaps to decide where to apply and what to improve first.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-y border-slate-800/70 bg-slate-900/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:py-11">
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workflow</p>
          <h2 className="text-3xl font-semibold text-white">From resume and JD to honest compatibility</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.title} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Step {index + 1}</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
