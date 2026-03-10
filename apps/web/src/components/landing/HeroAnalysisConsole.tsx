"use client";

import { useEffect, useState } from "react";

const stages = [
  "Reviewing role requirements",
  "Mapping verified experience",
  "Calculating compatibility",
  "Revealing score",
] as const;

export function HeroAnalysisConsole() {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStage((prev) => (prev + 1) % stages.length);
    }, 1200);

    return () => window.clearInterval(timer);
  }, []);

  const scoreVisible = activeStage >= 2;

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
        <p className="mt-1 text-lg font-semibold text-white">Director of Customer Support</p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-sm text-slate-400">Engine status</p>
        <p className="mt-1 text-sm font-medium text-slate-100">Running compatibility analysis</p>
        <div className="mt-3 space-y-2">
          {stages.map((stage, index) => {
            const complete = index < activeStage;
            const active = index === activeStage;
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

      <div
        className={`mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition-all duration-500 ${
          scoreVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-40"
        }`}
      >
        <p className="text-sm text-slate-400">Compatibility Score</p>
        <div className="mt-1 flex items-end gap-3">
          <p className="text-4xl font-bold text-white">92</p>
          <p className="pb-1 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Strong Fit</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Strength Signals</p>
          <ul className="mt-2 space-y-1 text-xs text-emerald-100">
            <li>Global support leadership</li>
            <li>Escalation rigor</li>
            <li>Operational process ownership</li>
          </ul>
        </div>
        <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">Gap Signals</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100">
            <li>Industry context depth</li>
            <li>Platform specific domain exposure</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
