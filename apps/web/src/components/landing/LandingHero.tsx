"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [analysisActive, setAnalysisActive] = useState(false);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const hasTrackedInputStartedRef = useRef(false);
  const hasTrackedAnalyzeClickedRef = useRef(false);

  const scenario = useMemo(() => getHeroScenarioForRole(activeRole), [activeRole]);

  const trackHeroEvent = useCallback((eventName: "hero_role_input_started" | "hero_analyze_clicked") => {
    if (typeof window === "undefined") return;
    const analyticsWindow = window as Window & {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    };

    if (Array.isArray(analyticsWindow.dataLayer)) {
      analyticsWindow.dataLayer.push({ event: eventName, surface: "landing_hero" });
    }

    if (typeof analyticsWindow.gtag === "function") {
      analyticsWindow.gtag("event", eventName, { surface: "landing_hero" });
    }
  }, []);

  const handleRoleInputChange = useCallback(
    (nextValue: string) => {
      if (!hasTrackedInputStartedRef.current && nextValue.trim().length > 0) {
        hasTrackedInputStartedRef.current = true;
        trackHeroEvent("hero_role_input_started");
      }
      setRoleInput(nextValue);
    },
    [trackHeroEvent],
  );

  const handleAnalyzeRole = useCallback(
    (roleOverride?: string) => {
      if (!hasTrackedAnalyzeClickedRef.current) {
        hasTrackedAnalyzeClickedRef.current = true;
        trackHeroEvent("hero_analyze_clicked");
      }

      const nextRole = (roleOverride ?? roleInput).trim() || defaultHeroRole;
      setRoleInput(nextRole);
      setActiveRole(nextRole);
      setRunId((previous) => previous + 1);
      setPlaceholderIndex((previous) => (previous + 1) % rolePlaceholders.length);

      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        setAnalysisActive(true);
        window.setTimeout(() => {
          consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
        window.setTimeout(() => {
          setAnalysisActive(false);
        }, 2200);
      }
    },
    [roleInput, trackHeroEvent],
  );

  useEffect(() => {
    if (!analysisActive) {
      document.body.style.overflow = "";
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [analysisActive]);

  const handleAnalyzeAnotherRole = useCallback(() => {
    setRoleInput("");
    setPlaceholderIndex((previous) => (previous + 1) % rolePlaceholders.length);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const handleExampleChipClick = useCallback(
    (role: string) => {
      handleAnalyzeRole(role);
    },
    [handleAnalyzeRole],
  );

  return (
    <section id="product" className="relative overflow-hidden border-b border-slate-800/70">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-slate-400/5 to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-[96rem] px-4 py-8 lg:px-6 lg:py-10">
        <div className="rounded-3xl border border-slate-700/90 bg-slate-950/65 p-6 shadow-[0_0_0_1px_rgba(148,163,184,0.12)_inset] lg:p-8">
          <div className={`mb-5 space-y-2.5 transition-opacity duration-200 lg:mb-7 ${analysisActive ? "opacity-60" : "opacity-100"}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Career Intelligence</p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
              Know your chances before you apply
            </h1>
            <p className="max-w-4xl text-base leading-relaxed text-slate-300 lg:text-[1.05rem]">
              Target This Role compares verified experience to role requirements so you can see competitiveness before
              you apply.
            </p>
          </div>

          <div ref={consoleRef} className={`transition-all duration-200 ${analysisActive ? "ring-1 ring-slate-500/60 ring-offset-0" : ""}`}>
            <HeroAnalysisConsole
              roleInput={roleInput}
              onRoleInputChange={handleRoleInputChange}
              onAnalyzeRole={handleAnalyzeRole}
              onExampleChipClick={handleExampleChipClick}
              onAnalyzeAnotherRole={handleAnalyzeAnotherRole}
              placeholder={rolePlaceholders[placeholderIndex]}
              activeRole={activeRole}
              scenario={scenario}
              runId={runId}
              isAuthenticated={isAuthenticated}
            />
          </div>

          <div className={`mt-5 grid gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/45 p-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300 transition-opacity duration-200 sm:grid-cols-3 ${analysisActive ? "opacity-55" : "opacity-100"}`}>
            <p className="rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2 text-center">Verified experience only</p>
            <p className="rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2 text-center">No fabricated metrics</p>
            <p className="rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2 text-center">No inflated scope</p>
          </div>
        </div>
      </div>
    </section>
  );
}
