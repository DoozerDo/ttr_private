"use client";

import { useEffect, useState } from "react";

export function DemoAnalysisPreviewSection() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const handler = () => setHidden(true);
    window.addEventListener("ttr:landing-score-revealed", handler);
    return () => window.removeEventListener("ttr:landing-score-revealed", handler);
  }, []);

  if (hidden) {
    return null;
  }

  return (
    <section
      id="result-structure"
      data-testid="result-structure"
      className="mx-auto w-full max-w-[1200px] px-4 pb-1 pt-5 md:px-10 md:pt-6 lg:px-16"
    >
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
          Positioning
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-[1.85rem]">
          Most tools try to make you look qualified. This tells you if you actually are.
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-300 md:text-[0.98rem]">
          A compliance-gated analysis that shows where you are strongest and what to do next.
        </p>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-200">
          <li>Where you match</li>
          <li>What&apos;s missing and how much it matters</li>
          <li>Whether to apply or fix the gaps first</li>
        </ul>
      </div>
    </section>
  );
}
