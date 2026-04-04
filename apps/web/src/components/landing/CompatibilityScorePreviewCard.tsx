"use client";

import { useEffect, useRef, useState } from "react";

import type { HeroScenario } from "@/src/data/heroPreview";

type CompatibilityScorePreviewCardProps = {
  scenario: HeroScenario;
  hasUserTriggeredAnalysis: boolean;
  runId: number;
};

const demoStrengths = [
  "Enterprise support leadership",
  "Incident response ownership",
  "SaaS operations scale",
] as const;

const demoGaps = ["Platform engineering exposure"] as const;

export function CompatibilityScorePreviewCard({
  scenario,
  hasUserTriggeredAnalysis,
  runId,
}: CompatibilityScorePreviewCardProps) {
  const targetScore = hasUserTriggeredAnalysis ? scenario.score : 92;
  const targetTier = hasUserTriggeredAnalysis ? scenario.tier : "Strong Target";
  const strengths = hasUserTriggeredAnalysis ? scenario.strengths : Array.from(demoStrengths);
  const gaps = hasUserTriggeredAnalysis ? scenario.gaps : Array.from(demoGaps);

  const [displayScore, setDisplayScore] = useState(targetScore);
  const scoreRef = useRef(targetScore);

  useEffect(() => {
    scoreRef.current = displayScore;
  }, [displayScore]);

  useEffect(() => {
    const start = scoreRef.current;
    const end = targetScore;
    if (start === end) return;

    const startedAt = performance.now();
    const durationMs = 550;
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayScore(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        setDisplayScore(end);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [runId, targetScore]);

  return (
    <article className="rounded-2xl bg-slate-900/70 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Compatibility Score</p>
      <p className="mt-3 text-5xl font-bold leading-none text-white lg:text-6xl">{displayScore}</p>
      <p className="mt-3 inline-flex rounded-md bg-slate-800/80 px-2.5 py-1 text-sm font-semibold text-slate-100">
        {targetTier}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Strengths</p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-100">
            {strengths.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-amber-500/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">Gaps</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-100">
            {gaps.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">Demo result using a sample baseline profile.</p>
    </article>
  );
}
