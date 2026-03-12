"use client";

import { useEffect, useRef, useState } from "react";

import { OpportunityRadarChart } from "@/src/components/landing/OpportunityRadarChart";
import { getHeroScenarioForComparison } from "@/src/data/heroPreview";
import { radarScores } from "@/src/data/opportunityPreview";

const demoScenario = getHeroScenarioForComparison({
  jobDescription:
    "VP Customer Experience role. Define customer journey strategy across onboarding, support, and retention.",
  hasResume: true,
  scoreOverride: 82,
});

function getInterpretation(score: number) {
  if (score >= 85) {
    return "You appear strongly aligned for this role based on this sample profile and job comparison.";
  }

  if (score >= 70) {
    return "You appear to be a plausible candidate for this role, with visible strengths and a few notable gaps.";
  }

  return "This sample profile shows partial alignment. Adjacent roles may offer stronger near-term fit.";
}

export function DemoAnalysisPreviewSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasTriggered, setHasTriggered] = useState(false);
  const [displayScore, setDisplayScore] = useState(0);
  const [showRadar, setShowRadar] = useState(false);
  const [showStrongest, setShowStrongest] = useState(false);
  const [showSignalCards, setShowSignalCards] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || hasTriggered) return;
        setHasTriggered(true);
      },
      { threshold: 0.3 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasTriggered]);

  useEffect(() => {
    if (!hasTriggered) return;

    let rafId = 0;
    const scoreStart = performance.now();
    const scoreDurationMs = 650;

    const stepScore = (now: number) => {
      const progress = Math.min(1, (now - scoreStart) / scoreDurationMs);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayScore(Math.round(demoScenario.score * eased));
      if (progress < 1) {
        rafId = window.requestAnimationFrame(stepScore);
      } else {
        setDisplayScore(demoScenario.score);
      }
    };

    rafId = window.requestAnimationFrame(stepScore);
    const radarTimer = window.setTimeout(() => setShowRadar(true), 700);
    const strongestTimer = window.setTimeout(() => setShowStrongest(true), 1200);
    const cardsTimer = window.setTimeout(() => setShowSignalCards(true), 1550);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(radarTimer);
      window.clearTimeout(strongestTimer);
      window.clearTimeout(cardsTimer);
    };
  }, [hasTriggered]);

  return (
    <section id="demo-analysis-preview" ref={sectionRef} className="border-b border-slate-800/70 bg-slate-900/35">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-10 lg:px-16">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white lg:text-[1.75rem]">
            See a compatibility analysis in action
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <article className="rounded-2xl bg-slate-900/70 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Compatibility Score</p>
            <p className="mt-3 text-5xl font-bold leading-none text-white lg:text-6xl">{displayScore}</p>
            <p className="mt-3 inline-flex rounded-md bg-slate-800/80 px-2.5 py-1 text-sm font-semibold text-slate-100">
              {demoScenario.tier}
            </p>
            <p className="mt-4 text-base leading-relaxed text-slate-300">{getInterpretation(demoScenario.score)}</p>

            <div
              className={`mt-5 grid gap-3 transition-all duration-400 md:grid-cols-2 ${
                showSignalCards ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Strengths</p>
                <ul className="mt-2 space-y-1 text-sm text-emerald-100">
                  {demoScenario.strengths.slice(0, 3).map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-amber-500/10 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">Gaps</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-100">
                  {demoScenario.gaps.slice(0, 3).map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Opportunity Radar</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                See where this background appears most competitive across adjacent role areas.
              </p>
            </div>
            <OpportunityRadarChart
              scores={radarScores}
              revealed={showRadar}
              strongestHighlightVisible={showStrongest}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
