"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { HeroScenario } from "@/src/data/heroPreview";

const stages = [
  "Reviewing role requirements",
  "Mapping verified experience signals",
  "Running compatibility model",
] as const;

const sampleRoles = [
  "Director of Customer Support",
  "VP Customer Experience",
  "Head of Customer Operations",
] as const;

type HeroAnalysisConsoleProps = {
  roleInput: string;
  onRoleInputChange: (nextValue: string) => void;
  onAnalyzeRole: () => void;
  placeholder: string;
  activeRole: string;
  scenario: HeroScenario;
  runId: number;
  isAuthenticated: boolean;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function statusTone(score: number) {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-amber-200";
  return "text-sky-200";
}

export function HeroAnalysisConsole({
  roleInput,
  onRoleInputChange,
  onAnalyzeRole,
  placeholder,
  activeRole,
  scenario,
  runId,
  isAuthenticated,
}: HeroAnalysisConsoleProps) {
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

  const rightPanelTitle =
    scenario.score >= 70 ? "Outcome Signals" : "Stronger Opportunity Zones Detected";

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

    timers.push(window.setTimeout(() => !disposed && setActiveStage(1), 520));
    timers.push(window.setTimeout(() => !disposed && setActiveStage(2), 1020));

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
      }, 1260),
    );

    timers.push(window.setTimeout(() => !disposed && setShowStrengths(true), 2200));
    timers.push(window.setTimeout(() => !disposed && setShowGaps(true), 2460));

    if (scenario.score < 70) {
      timers.push(window.setTimeout(() => !disposed && setShowPivot(true), 2780));
    }

    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.cancelAnimationFrame(animationFrame);
    };
  }, [runId, scenario.score]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Role Input</p>
        <p className="mt-2 text-sm text-slate-300">Paste a role to see how the engine evaluates fit.</p>
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={roleInput}
            onChange={(event) => onRoleInputChange(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onAnalyzeRole}
            className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
          >
            Analyze Role
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {sampleRoles.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => onRoleInputChange(role)}
              className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              {role}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/80 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Analysis Sequence</p>
          <div className="mt-2 space-y-1.5">
            {stageStates.map(({ stage, complete, active }) => (
              <div key={stage} className="flex items-center gap-2 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    complete ? "bg-emerald-400" : active ? "bg-amber-300 animate-pulse" : "bg-slate-600"
                  }`}
                />
                <span className={complete || active ? "text-slate-100" : "text-slate-500"}>{stage}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 shadow-[0_0_0_1px_rgba(148,163,184,0.1)_inset]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Compatibility Score</p>
          <p className="text-xs text-slate-500">Role {activeRole || scenario.role}</p>
        </div>
        <div className="mt-4">
          <p className="text-7xl font-bold leading-none text-white md:text-8xl">{displayScore}</p>
          {showTier ? (
            <p
              className={`mt-2 inline-flex rounded-md border border-slate-700 px-2 py-1 text-sm font-semibold uppercase tracking-[0.18em] ${statusTone(
                scenario.score,
              )}`}
            >
              {scenario.tier}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Evaluating</p>
          )}
        </div>
        <div className="mt-4 h-1.5 w-full rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-300 to-sky-300 transition-all duration-700"
            style={{ width: `${displayScore}%` }}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{rightPanelTitle}</p>
        {scenario.score >= 70 ? (
          <>
            <div
              className={`mt-3 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-3 transition-all duration-300 ${
                showStrengths ? "translate-y-0 opacity-100" : "translate-y-1 opacity-35"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Strength Signals</p>
              <ul className="mt-2 space-y-1 text-xs text-emerald-100">
                {scenario.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div
              className={`mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 transition-all duration-300 ${
                showGaps ? "translate-y-0 opacity-100" : "translate-y-1 opacity-35"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100">Gap Signals</p>
              <ul className="mt-2 space-y-1 text-xs text-amber-100">
                {scenario.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Signal Snapshot</p>
              <div className="mt-2 space-y-2">
                {scenario.strengths.slice(0, 3).map((signal, index) => {
                  const widths = [86, 78, 71];
                  return (
                    <div key={signal}>
                      <p className="text-[11px] text-slate-300">{signal}</p>
                      <div className="mt-1 h-1 w-full rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${widths[index]}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
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
          </>
        ) : (
          <>
            <p className="mt-3 text-xs text-sky-100">Your experience signals stronger alignment in these areas.</p>
            <div
              className={`mt-3 space-y-2 transition-all duration-300 ${
                showPivot ? "translate-y-0 opacity-100" : "translate-y-1 opacity-35"
              }`}
            >
              {scenario.opportunities?.map((opportunity) => (
                <div key={opportunity.industry} className="rounded-lg border border-sky-300/30 bg-sky-500/10 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-100">{opportunity.industry}</span>
                    <span className="rounded-full bg-sky-300/20 px-2 py-0.5 text-xs font-semibold text-sky-100">
                      {opportunity.score}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-sky-300/80" style={{ width: `${opportunity.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="#opportunity"
                className="inline-flex items-center justify-center rounded-lg border border-sky-300/60 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-200 hover:text-sky-50"
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
          </>
        )}
      </section>
    </div>
  );
}
