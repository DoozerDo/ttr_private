"use client";

export function DemoAnalysisPreviewSection() {
  return (
    <section id="result-structure" data-testid="result-structure" className="border-b border-slate-800/40">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-6 md:px-10 lg:px-16">
        <div className="mb-4 max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
            What your result will show
          </p>
          <p className="text-sm leading-7 text-slate-400">
            A fast read on what is working, what is missing, and whether the role is worth
            pursuing now.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Strengths", "The experience and signals that support the role."],
            ["Gaps", "What&apos;s missing, how much it matters, and where the gap is biggest."],
            ["Decision", "Whether it&apos;s worth applying now or better to fix the gaps first."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
