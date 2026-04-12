"use client";

export function LandingTrustStrip() {
  return (
    <div
      data-testid="landing-trust-strip"
      className="mx-auto w-full max-w-[1200px] px-4 pt-3 md:px-10 md:pt-4 lg:px-16"
    >
      <div className="border-t border-white/8 pt-3 md:pt-4">
        <ul className="grid gap-2 text-xs font-medium tracking-[0.08em] text-slate-400 md:grid-cols-3 md:gap-4 md:text-sm">
          <li>No invented experience</li>
          <li>Evidence-based fit scoring</li>
          <li>Clear strengths, gaps, and next move</li>
        </ul>
      </div>
    </div>
  );
}
