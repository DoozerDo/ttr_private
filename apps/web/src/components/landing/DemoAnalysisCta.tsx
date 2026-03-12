"use client";

export function DemoAnalysisCta() {
  const handleRunOwnAnalysis = () => {
    const formSection = document.getElementById("compatibility-form");
    formSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="border-b border-slate-800/70 bg-slate-900/25">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 md:px-10 lg:px-16">
        <div className="rounded-xl border border-slate-600/80 bg-slate-900/70 px-4 py-4">
          <p className="text-sm leading-relaxed text-slate-200">Example analysis based on anonymized member data.</p>
          <p className="mt-1.5 text-sm text-slate-300">
            Run your own analysis to see your compatibility score and opportunity map.
          </p>
          <button
            type="button"
            onClick={handleRunOwnAnalysis}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
          >
            Run your own analysis
          </button>
        </div>
      </div>
    </section>
  );
}
