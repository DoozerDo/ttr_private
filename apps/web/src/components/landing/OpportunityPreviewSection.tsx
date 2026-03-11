"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { FormButton } from "@/components/FormButton";
import { OpportunityRadarChart } from "@/src/components/landing/OpportunityRadarChart";
import { OpportunityResultsCards } from "@/src/components/landing/OpportunityResultsCards";
import { radarScores } from "@/src/data/opportunityPreview";

const analysisSteps = [
  "Analyzing experience signals",
  "Mapping transferable capabilities",
  "Evaluating opportunity zones",
] as const;

type OpportunityPreviewSectionProps = {
  isAuthenticated?: boolean;
};

export function OpportunityPreviewSection({ isAuthenticated = false }: OpportunityPreviewSectionProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [revealed, setRevealed] = useState(false);

  const stepStates = useMemo(
    () =>
      analysisSteps.map((step, index) => ({
        step,
        complete: activeStep > index,
        active: activeStep === index,
      })),
    [activeStep],
  );

  useEffect(() => {
    if (!isRunning || activeStep < 0) return;

    if (activeStep >= analysisSteps.length - 1) {
      const finishTimer = window.setTimeout(() => {
        setIsRunning(false);
        setRevealed(true);
      }, 900);
      return () => window.clearTimeout(finishTimer);
    }

    const stepTimer = window.setTimeout(() => {
      setActiveStep((previous) => previous + 1);
    }, 850);

    return () => window.clearTimeout(stepTimer);
  }, [activeStep, isRunning]);

  const handleRunPreview = () => {
    if (isRunning) return;
    setRevealed(false);
    setActiveStep(0);
    setIsRunning(true);
  };

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/30 p-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Opportunity Evaluation Preview
            </p>
            <h2 className="text-3xl font-semibold text-white">After compatibility, see where your profile wins next.</h2>
            <p className="text-sm leading-relaxed text-slate-300">
              This preview shows how resume-to-job analysis can expand into realistic opportunity targeting.
            </p>
          </div>

          <FormButton onClick={handleRunPreview} disabled={isRunning}>
            {isRunning ? "Running preview..." : "Run Opportunity Preview"}
          </FormButton>

          <div className="space-y-2 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            {stepStates.map(({ step, complete, active }) => (
              <div key={step} className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    complete ? "bg-emerald-400" : active ? "bg-amber-300 animate-pulse" : "bg-slate-600"
                  }`}
                />
                <span className={complete || active ? "text-slate-100" : "text-slate-400"}>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <OpportunityRadarChart scores={radarScores} revealed={revealed} />
          <OpportunityResultsCards revealed={revealed} />

          <div
            className={`rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 transition-all duration-500 ${
              revealed ? "opacity-100 translate-y-0" : "pointer-events-none opacity-40 translate-y-1"
            }`}
          >
            <p className="text-sm font-semibold text-amber-100">Unlock your full opportunity landscape</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {isAuthenticated ? (
                <Link
                  href="/baseline"
                  className="inline-flex items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                >
                  Go to App
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth/signup"
                    className="inline-flex items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                  >
                    Create Free Account
                  </Link>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center justify-center rounded-xl border border-amber-200/50 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-100 hover:text-amber-50"
                  >
                    Log In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
