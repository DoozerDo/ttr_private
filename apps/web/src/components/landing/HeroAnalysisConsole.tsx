"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { HeroScenario } from "@/src/data/heroPreview";

const sampleJobDescriptions = [
  "Director of Customer Support role focused on SLA reliability, team leadership, and Zendesk plus Salesforce platform ownership.",
  "VP Customer Experience role leading journey strategy, cross-functional service design, and support operations scaling.",
  "Head of Customer Operations role improving escalation management, process rigor, and incident response quality.",
] as const;

type HeroAnalysisConsoleProps = {
  resumeFilename: string | null;
  onResumeUploadInitiated: () => void;
  onResumeFileSelected: (file: File | null) => void;
  jobDescription: string;
  onJobDescriptionChange: (nextValue: string) => void;
  onJobDescriptionFocus: () => void;
  onAnalyzeCompatibility: (jobDescriptionOverride?: string) => void;
  onExampleJobDescriptionClick: (jobDescription: string) => void;
  onAnalyzeAnotherComparison: () => void;
  placeholder: string;
  scenario: HeroScenario;
  runId: number;
  isAuthenticated: boolean;
  hasUserTriggeredAnalysis: boolean;
  isPreviewLoading: boolean;
  isScoring: boolean;
};

type VerdictState = "idle" | "estimating" | "animating" | "settled";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function statusTone(score: number) {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-amber-200";
  return "text-sky-200";
}

export function HeroAnalysisConsole({
  resumeFilename,
  onResumeUploadInitiated,
  onResumeFileSelected,
  jobDescription,
  onJobDescriptionChange,
  onJobDescriptionFocus,
  onAnalyzeCompatibility,
  onExampleJobDescriptionClick,
  onAnalyzeAnotherComparison,
  placeholder,
  scenario,
  runId,
  isAuthenticated,
  hasUserTriggeredAnalysis,
  isPreviewLoading,
  isScoring,
}: HeroAnalysisConsoleProps) {
  const [displayScore, setDisplayScore] = useState(clamp(scenario.score));
  const displayScoreRef = useRef(displayScore);
  const [verdictState, setVerdictState] = useState<VerdictState>("idle");
  const [showSecondaryUi, setShowSecondaryUi] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setShowHint(false);
      window.setTimeout(() => {
        setHintIndex((previous) => (previous + 1) % sampleJobDescriptions.length);
        setShowHint(true);
      }, 220);
    }, 3400);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isScoring) {
      setVerdictState("estimating");
    }
  }, [isScoring]);

  useEffect(() => {
    displayScoreRef.current = displayScore;
  }, [displayScore]);

  useEffect(() => {
    const target = clamp(scenario.score);
    const start = displayScoreRef.current;
    if (start === target) {
      return;
    }

    if (prefersReducedMotion) {
      setDisplayScore(target);
      setVerdictState("settled");
      setShowSecondaryUi(true);
      return;
    }

    setShowSecondaryUi(false);
    setVerdictState("animating");

    const startedAt = performance.now();
    const durationMs = 600;
    const holdMs = 150;
    let rafId = 0;
    let settleTimer = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayScore(Math.round(start + (target - start) * eased));
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      setDisplayScore(target);
      setVerdictState("settled");
      settleTimer = window.setTimeout(() => {
        setShowSecondaryUi(true);
        setVerdictState("idle");
      }, holdMs);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
    };
  }, [prefersReducedMotion, scenario.score]);

  const rightPanelTitle = scenario.score >= 70 ? "Strength and Gap Signals" : "Opportunity Signals";
  const scoreFocalClass =
    verdictState === "settled" ? "scale-[1.01] opacity-100" : "scale-100 opacity-100";

  return (
    <div data-run-id={runId} className="grid items-start gap-3 lg:items-stretch lg:grid-cols-[1.2fr_1.6fr_1.2fr]">
      <section className="flex h-full flex-col rounded-2xl border border-slate-700/90 bg-slate-900/60 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.08)_inset]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Job-First Intake</p>
        <p className="mt-1.5 text-sm text-slate-300">Paste a job description to generate a live compatibility preview.</p>

        <div className="mt-2.5 space-y-2">
          <textarea
            value={jobDescription}
            onChange={(event) => onJobDescriptionChange(event.target.value)}
            onFocus={onJobDescriptionFocus}
            placeholder={placeholder}
            className="h-[128px] w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-400">Live Compatibility Score Preview updates as you type.</p>

          <div className="rounded-lg border border-slate-700/90 bg-slate-950/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Personalize Next</p>
            <p className="mt-1 text-xs text-slate-300">Upload your resume to personalize this score.</p>
            <label className="mt-2 flex cursor-pointer flex-col gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 p-2.5 text-xs text-slate-300 transition hover:border-slate-500">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Resume Upload</span>
              <span className="truncate text-sm text-slate-100">{resumeFilename ?? "Choose resume file (PDF or DOCX)"}</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onClick={onResumeUploadInitiated}
                onChange={(event) => onResumeFileSelected(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Your resume is processed only to generate this score. It is never stored unless you create an account.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onAnalyzeCompatibility()}
            disabled={isPreviewLoading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPreviewLoading ? "Analyzing..." : "Analyze Compatibility"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onJobDescriptionChange(sampleJobDescriptions[hintIndex])}
          className={`mt-2 text-left text-xs text-slate-400 transition-opacity duration-200 hover:text-slate-200 ${showHint ? "opacity-100" : "opacity-0"}`}
        >
          Try sample JD: {["Support Director", "VP CX", "Head of Ops"][hintIndex]}
        </button>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {sampleJobDescriptions.map((jobDescriptionText, index) => (
            <button
              key={`sample-job-${index}`}
              type="button"
              onClick={() => onExampleJobDescriptionClick(jobDescriptionText)}
              className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              {["Support Director", "VP CX", "Head of Ops"][index]}
            </button>
          ))}
        </div>
      </section>

      <section className="flex h-full flex-col rounded-2xl border border-slate-600/95 bg-slate-900/78 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.16)_inset]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Compatibility Score</p>
          <p className="text-xs text-slate-500">{scenario.jobTitle}</p>
        </div>

        <div className="relative mt-5">
          <div
            className={`pointer-events-none absolute inset-0 rounded-xl bg-slate-200/5 transition-opacity ${
              verdictState === "estimating" || verdictState === "animating" ? "animate-pulse opacity-100" : "opacity-0"
            }`}
          />
          <p
            className={`text-7xl font-bold leading-none text-white transition-all duration-200 md:text-8xl lg:text-9xl ${scoreFocalClass}`}
          >
            {displayScore}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            {verdictState === "estimating" || verdictState === "animating" ? "Evaluating" : "Verdict"}
          </p>
        </div>

        <div
          className={`mt-4 transition-all duration-200 ${
            showSecondaryUi ? "translate-y-0 opacity-100 delay-100" : "translate-y-1 opacity-0"
          }`}
        >
          <p
            className={`inline-flex rounded-md border border-slate-700 px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.18em] ${statusTone(
              scenario.score,
            )}`}
          >
            {scenario.tier}
          </p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-300 to-sky-300 transition-all ${
                prefersReducedMotion ? "duration-150" : "duration-300"
              }`}
              style={{ width: `${displayScore}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {resumeFilename ? "Personalized using uploaded resume evidence." : "Upload your resume to personalize this score."}
          </p>
        </div>
      </section>

      <section
        className={`relative flex h-full flex-col rounded-2xl border border-slate-700/90 bg-slate-900/60 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.08)_inset] transition-all duration-200 ${
          showSecondaryUi ? "translate-y-0 opacity-100 delay-150" : "translate-y-1 opacity-70"
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">{rightPanelTitle}</p>
        {scenario.score >= 70 ? (
          <>
            <div className="mt-2.5 rounded-xl border border-emerald-300/28 bg-emerald-400/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Strength Signals</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-emerald-100">
                {scenario.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="mt-2.5 rounded-xl border border-amber-300/28 bg-amber-300/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">Gap Signals</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-amber-100">
                {scenario.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2.5 text-[11px] text-sky-100">Your experience aligns more strongly in these areas.</p>
            <div className="mt-2.5 space-y-2">
              {scenario.opportunities?.map((opportunity) => (
                <div key={opportunity.industry} className="rounded-lg border border-sky-300/30 bg-sky-500/10 px-3 py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-100">{opportunity.industry}</span>
                    <span className="rounded-full bg-sky-300/20 px-2 py-0.5 text-[11px] font-semibold text-sky-100">
                      {opportunity.score}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-sky-300/80" style={{ width: `${opportunity.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {isAuthenticated ? (
            <Link
              href="/baseline"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
            >
              Go to App
            </Link>
          ) : (
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
            >
              Create Free Account
            </Link>
          )}
          <button
            type="button"
            onClick={onAnalyzeAnotherComparison}
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
          >
            Analyze Another Comparison
          </button>
        </div>

        {!isAuthenticated ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl border border-slate-600/60 bg-slate-950/72 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">Signals Locked</p>
            <p className="mt-2 px-5 text-center text-sm text-slate-200">
              Create a free account to unlock strengths and gap signals from your full analysis.
            </p>
            <Link
              href="/auth/signup"
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
            >
              Create Free Account
            </Link>
          </div>
        ) : null}
      </section>

      {hasUserTriggeredAnalysis ? (
        <div className="lg:col-span-3 rounded-xl border border-slate-700/70 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
          Preview score reflects landing-mode comparison. Uploading a resume personalizes the verdict before account creation.
        </div>
      ) : null}
    </div>
  );
}
