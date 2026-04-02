"use client";

import { useEffect, useMemo, useState } from "react";

type FitVerdictRevealProps = {
  score: number | null;
  classification: string;
  analysisLoaded: boolean;
};

const ANALYSIS_LINES = [
  "Analyzing leadership scope",
  "Comparing operational experience",
  "Evaluating systems alignment",
  "Assessing domain context",
] as const;

const ANALYSIS_STEP_MS = 250;
const REVEAL_TOTAL_MS = ANALYSIS_LINES.length * ANALYSIS_STEP_MS;
const SCORE_ANIMATION_MS = 900;

function formatScore(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}`;
  return rounded.toFixed(1);
}

export function FitVerdictReveal({
  score,
  classification,
  analysisLoaded,
}: FitVerdictRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [analysisLineIndex, setAnalysisLineIndex] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (!analysisLoaded || score === null) {
      setIsRevealed(false);
      setAnalysisLineIndex(0);
      setAnimatedScore(0);
      return;
    }

    let cancelled = false;
    setIsRevealed(false);
    setAnalysisLineIndex(0);
    setAnimatedScore(0);

    const timers: Array<ReturnType<typeof setTimeout>> = [];

    ANALYSIS_LINES.forEach((_, index) => {
      const timer = setTimeout(() => {
        if (cancelled) return;
        setAnalysisLineIndex(index);
      }, index * ANALYSIS_STEP_MS);
      timers.push(timer);
    });

    const revealTimer = setTimeout(() => {
      if (cancelled) return;
      setIsRevealed(true);

      const startAt = performance.now();
      const tick = (frameTime: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (frameTime - startAt) / SCORE_ANIMATION_MS);
        setAnimatedScore(score * progress);
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          setAnimatedScore(score);
        }
      };
      requestAnimationFrame(tick);
    }, REVEAL_TOTAL_MS);
    timers.push(revealTimer);

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [analysisLoaded, score]);

  const scoreAnnouncement = useMemo(() => {
    if (!isRevealed || score === null) return "";
    return `Compatibility score ${formatScore(score)}.`;
  }, [isRevealed, score]);

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
      {!isRevealed ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-400">Fit Verdict</p>
          <p className="text-sm text-slate-300">Preparing compatibility report…</p>
          <p
            className="text-base text-slate-200 transition-opacity duration-200"
            key={analysisLineIndex}
          >
            {ANALYSIS_LINES[analysisLineIndex]}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-400">Fit Verdict</p>
          <p className="text-3xl font-semibold text-slate-100">{classification}</p>
          <p className="text-4xl font-bold text-white">
            {score === null ? "Pending" : `${formatScore(animatedScore)} Compatibility Score`}
          </p>
          <p className="text-sm text-slate-400">
            This evaluation is based on structured signals in your baseline, not keyword matching.
          </p>
          <span className="sr-only" aria-live="polite">
            {scoreAnnouncement}
          </span>
        </div>
      )}
    </section>
  );
}
