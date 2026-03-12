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

      <div className="relative mx-auto w-full max-w-[1200px] px-4 pb-12 pt-12 md:px-10 lg:px-16">
        <div className="max-w-[860px]">
          <h1 className="text-3xl font-semibold leading-tight text-white lg:text-4xl xl:text-[2.5rem]">
            Know that you qualify before you apply.
          </h1>
          <p className="mt-3 max-w-[760px] text-base leading-relaxed text-slate-300 lg:text-lg">
            Target This Role compares your resume to real job descriptions and shows whether you actually qualify.
          </p>
        </div>
      </div>
    </section>
  );
}
