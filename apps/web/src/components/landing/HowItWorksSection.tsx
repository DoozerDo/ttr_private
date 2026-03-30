const steps = [
  {
    title: "Upload your resume (we use this as your baseline)",
    body: "Your verified background becomes the evidence foundation for analysis.",
  },
  {
    title: "Compare against a real job description",
    body: "Run compatibility scoring against role requirements, level, and tooling expectations.",
  },
  {
    title: "Decide where to apply with confidence",
    body: "Review the outcome and move forward with roles that fit your verified experience.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-y border-slate-800/70 bg-slate-900/20">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-14 md:px-10 lg:px-16">
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workflow</p>
          <h2 className="text-2xl font-semibold text-white lg:text-[1.75rem]">How it works</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.title} className="rounded-2xl bg-slate-900/55 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.24)]">
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
