"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { HeroScenario } from "@/src/data/heroPreview";

const stages = [
  "Reviewing role requirements",
  "Mapping verified experience signals",
  "Running compatibility model",
] as const;

type HeroAnalysisConsoleProps = {
  role: string;
  scenario: HeroScenario;
  runId: number;
  isAuthenticated: boolean;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function HeroAnalysisConsole({ role, scenario, runId, isAuthenticated }: HeroAnalysisConsoleProps) {
  const [activeStage, setActiveStage] = useState<number>(-1);
  const [displayScore, setDisplayScore] = useState(0);
  const [showTier, setShowTier] = useState(false);
  const [showStrengths, setShowStrengths] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const [showPivot, setShowPivot] = useState(false);

  const stageStates = useMemo(
    () =>
      stages.map((stage, index) => ({
        stage,
        complete: activeStage > index,
        active: activeStage === index,
      })),
    [activeStage],
  );

  useEffect(() => {
    let disposed = false;
    const timers: number[] = [];
    let animationFrame = 0;

    setActiveStage(0);
    setDisplayScore(0);
    setShowTier(false);
    setShowStrengths(false);
    setShowGaps(false);
    setShowPivot(false);

    timers.push(
      window.setTimeout(() => {
        if (disposed) return;
        setActiveStage(1);
      }, 500),
    );
    timers.push(
      window.setTimeout(() => {
        if (disposed) return;
        setActiveStage(2);
      }, 1000),
    );

    timers.push(
      window.setTimeout(() => {
        if (disposed) return;
        const scoreDurationMs = 820;
        const start = performance.now();
        const target = clamp(scenario.score);

        const tick = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / scoreDurationMs);
          const eased = 1 - (1 - progress) * (1 - progress);
          setDisplayScore(Math.round(target * eased));
          if (progress < 1) {
            animationFrame = window.requestAnimationFrame(tick);
          } else {
            setDisplayScore(target);
            setShowTier(true);
          }
        };
        animationFrame = window.requestAnimationFrame(tick);
      }, 1250),
    );

    timers.push(
      window.setTimeout(() => {
        if (disposed) return;
        setShowStrengths(true);
      }, 2200),
    );

    timers.push(
      window.setTimeout(() => {
        if (disposed) return;
        setShowGaps(true);
      }, 2450),
    );

    if (scenario.score < 70) {
      timers.push(
        window.setTimeout(() => {
          if (disposed) return;
          setShowPivot(true);
        }, 2750),
      );
    }

    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.cancelAnimationFrame(animationFrame);
    };
  }, [runId, scenario.score]);

  return (
    <aside className="rounded-2xl border border-slate-700 bg-slate-950/75 p-5 shadow-[0_0_0_1px_rgba(148,163,184,0.1)_inset]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Role Analysis</p>
        <span className="rounded-full border border-amber-300/35 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
          Live Demo
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-sm text-slate-400">Role</p>
        <p className="mt-1 text-lg font-semibold text-white">{role || scenario.role}</p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-sm text-slate-400">Engine status</p>
        <p className="mt-1 text-sm font-medium text-slate-100">Running compatibility analysis</p>
        <div className="mt-3 space-y-2">
          {stageStates.map(({ stage, complete, active }) => {
            return (
              <div key={stage} className="flex items-center gap-2 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    complete ? "bg-emerald-400" : active ? "bg-amber-300 animate-pulse" : "bg-slate-600"
                  }`}
                />
                <span className={complete || active ? "text-slate-100" : "text-slate-500"}>{stage}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition-all duration-500">
        <p className="text-sm text-slate-400">Compatibility Score</p>
        <div className="mt-1 flex items-end gap-4">
          <p className="text-5xl font-bold leading-none text-white">{displayScore}</p>
          {showTier ? (
            <p className="pb-1 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">{scenario.tier}</p>
          ) : null}
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-300 to-rose-400 transition-all duration-700"
            style={{ width: `${displayScore}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-slate-300">
          {scenario.score >= 70 ? "You are competitive for this role." : "Compatibility is limited for this role."}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3 transition-all duration-300 ${
            showStrengths ? "translate-y-0 opacity-100" : "translate-y-1 opacity-30"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Strength Signals</p>
          <ul className="mt-2 space-y-1 text-xs text-emerald-100">
            {scenario.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div
          className={`rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 transition-all duration-300 ${
            showGaps ? "translate-y-0 opacity-100" : "translate-y-1 opacity-30"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">Gap Signals</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100">
            {scenario.gaps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {showPivot && scenario.opportunities ? (
        <div className="mt-4 rounded-xl border border-sky-400/30 bg-sky-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Stronger Opportunity Zones Detected</p>
          <p className="mt-2 text-xs text-sky-100">Your experience signals stronger alignment in these areas.</p>
          <div className="mt-3 space-y-2">
            {scenario.opportunities.map((opportunity) => (
              <div key={opportunity.industry} className="flex items-center justify-between text-sm">
                <span className="text-slate-100">{opportunity.industry}</span>
                <span className="rounded-full bg-sky-300/20 px-2 py-0.5 text-xs font-semibold text-sky-100">
                  {opportunity.score}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="#opportunity"
              className="inline-flex items-center justify-center rounded-lg border border-sky-300/50 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-200 hover:text-sky-50"
            >
              Explore Opportunity Paths
            </a>
            {isAuthenticated ? (
              <Link
                href="/baseline"
                className="inline-flex items-center justify-center rounded-lg bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Go to App
              </Link>
            ) : (
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center rounded-lg bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Create Free Account
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {isAuthenticated ? (
            <Link
              href="/baseline"
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Go to App
            </Link>
          ) : (
            <>
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
              >
                Get Started
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
              >
                Log In
              </Link>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
