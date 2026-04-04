"use client";

export function DemoAnalysisPreviewSection() {
  return (
    <section id="result-structure" className="border-b border-slate-800/70 bg-slate-900/35">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-7 md:px-10 lg:px-16">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white lg:text-[1.75rem]">What your result will show</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl bg-slate-900/70 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Strengths</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              The experience and signals that support the role.
            </p>
          </article>

          <article className="rounded-2xl bg-slate-900/70 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Gaps</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              What&apos;s missing, how much it matters, and where the gap is biggest.
            </p>
          </article>

          <article className="rounded-2xl bg-slate-900/70 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Decision</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Whether it&apos;s worth applying now or better to fix the gaps first.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
