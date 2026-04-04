const steps = [
  {
    title: "Create your account and verify access",
    body: "Beta invites flow through signup, and access codes activate the account when required.",
  },
  {
    title: "Add your baseline and a real role",
    body: "Upload your resume, then compare it against the job you want to pursue.",
  },
  {
    title: "Move to the next right step",
    body: "Low-fit results route to recovery, and strong-fit results move into Studio.",
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
