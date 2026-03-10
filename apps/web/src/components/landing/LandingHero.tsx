"use client";

import { useMemo, useState } from "react";

import { HeroAnalysisConsole } from "@/src/components/landing/HeroAnalysisConsole";
import { defaultHeroRole, getHeroScenarioForRole } from "@/src/data/heroPreview";

type LandingHeroProps = {
  isAuthenticated: boolean;
};

const rolePlaceholders = [
  "Director of Customer Support",
  "VP Customer Experience",
  "Head of Customer Operations",
] as const;

export function LandingHero({ isAuthenticated }: LandingHeroProps) {
  const [roleInput, setRoleInput] = useState(defaultHeroRole);
  const [activeRole, setActiveRole] = useState(defaultHeroRole);
  const [runId, setRunId] = useState(0);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const scenario = useMemo(() => getHeroScenarioForRole(activeRole), [activeRole]);

  const handleAnalyzeRole = () => {
    const nextRole = roleInput.trim() || defaultHeroRole;
    setActiveRole(nextRole);
    setRunId((previous) => previous + 1);
    setPlaceholderIndex((previous) => (previous + 1) % rolePlaceholders.length);
  };

  return (
    <section id="product" className="relative overflow-hidden border-b border-slate-800/70">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-400/5 to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-[96rem] px-4 py-10 lg:px-6 lg:py-12">
        <div className="rounded-3xl border border-slate-700/90 bg-slate-950/60 p-6 shadow-[0_0_0_1px_rgba(148,163,184,0.1)_inset] lg:p-8">
          <div className="mb-6 space-y-3 lg:mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Career Intelligence</p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
              Know your chances before you apply
            </h1>
            <p className="max-w-4xl text-base leading-relaxed text-slate-300 lg:text-lg">
              Target This Role analyzes your verified experience against any job description and shows how competitive
              you are before you apply.
            </p>
          </div>

          <HeroAnalysisConsole
            roleInput={roleInput}
            onRoleInputChange={setRoleInput}
            onAnalyzeRole={handleAnalyzeRole}
            placeholder={rolePlaceholders[placeholderIndex]}
            activeRole={activeRole}
            scenario={scenario}
            runId={runId}
            isAuthenticated={isAuthenticated}
          />

          <div className="mt-6 grid gap-2 rounded-2xl border border-slate-700/90 bg-slate-900/50 p-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300 sm:grid-cols-3">
            <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center">Verified experience only</p>
            <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center">No fabricated metrics</p>
            <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center">No inflated scope</p>
          </div>
        </div>
      </div>
    </section>
  );
}
