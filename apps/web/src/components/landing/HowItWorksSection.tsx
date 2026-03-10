const steps = [
  {
    title: "Build your baseline",
    body: "Your verified experience becomes the foundation for truthful analysis.",
  },
  {
    title: "Analyze a role",
    body: "Compare your baseline against a job description and see your compatibility.",
  },
  {
    title: "Improve your position",
    body: "Understand strengths, gaps, and where your experience creates opportunity.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-y border-slate-800/70 bg-slate-900/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-14">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workflow</p>
          <h2 className="text-3xl font-semibold text-white">How Target This Role works</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.title} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
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
