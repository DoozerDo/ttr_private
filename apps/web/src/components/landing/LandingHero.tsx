"use client";

import Link from "next/link";
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
    <section id="product" className="border-b border-slate-800/70">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Career Intelligence</p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Know your chances before you apply
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-300">
            Target This Role analyzes your verified experience against any job description and shows how competitive
            you are before you apply.
          </p>
          <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <p className="text-sm text-slate-300">Paste a role to see how the engine evaluates fit.</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={roleInput}
                onChange={(event) => setRoleInput(event.target.value)}
                placeholder={rolePlaceholders[placeholderIndex]}
                className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAnalyzeRole}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
              >
                Analyze Role
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {isAuthenticated ? (
              <Link
                href="/baseline"
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Go to App
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
                >
                  Get Started
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Log In
                </Link>
              </>
            )}
          </div>
        </div>
        <HeroAnalysisConsole role={activeRole} scenario={scenario} runId={runId} isAuthenticated={isAuthenticated} />
      </div>
    </section>
  );
}
