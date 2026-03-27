"use client";

export function LandingHero() {
  return (
    <section id="product" className="relative overflow-hidden border-b border-slate-800/70">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-4 pb-6 pt-10 md:px-10 md:pb-8 md:pt-12 lg:px-16">
        <div className="max-w-[900px]">
          <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl lg:text-[38px]">
            Upload your resume, paste the job description, and run your first analysis.
          </h1>
          <p className="mt-2.5 max-w-[760px] text-base leading-relaxed text-slate-300 lg:text-lg">
            We compare your resume evidence to role requirements, then show your score and next step.
          </p>
          <p className="mt-3 text-sm text-slate-400 md:text-base">
            We do not claim experience you cannot defend. You stay in control of what gets used.
          </p>
        </div>
      </div>
    </section>
  );
}
