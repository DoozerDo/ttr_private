"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
  jdReady: boolean;
};

type VerdictState = "idle" | "estimating" | "animating" | "settled";

const signalModelRows = [
  "Leadership Scope",
  "Operational Rigor",
  "Domain Alignment",
  "Customer Complexity",
] as const;

const detectedSignalMatchers: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Director level", patterns: [/\bdirector\b/i] },
  { label: "VP level", patterns: [/\bvp\b/i, /\bvice president\b/i] },
  { label: "Head of function", patterns: [/\bhead of\b/i] },
  { label: "Senior level", patterns: [/\bsenior\b/i] },
  { label: "Lead scope", patterns: [/\blead\b/i] },
  { label: "Manager ownership", patterns: [/\bmanager\b/i] },
  { label: "Salesforce", patterns: [/\bsalesforce\b/i] },
  { label: "Zendesk", patterns: [/\bzendesk\b/i] },
  { label: "ServiceNow", patterns: [/\bservicenow\b/i] },
  { label: "Jira", patterns: [/\bjira\b/i] },
  { label: "SQL", patterns: [/\bsql\b/i] },
  { label: "Tableau", patterns: [/\btableau\b/i] },
  { label: "Power BI", patterns: [/\bpower\s*bi\b/i] },
  { label: "Enterprise SaaS", patterns: [/\benterprise\b/i, /\bsaas\b/i] },
  { label: "Fintech", patterns: [/\bfintech\b/i, /\bfinancial\b/i] },
  { label: "Healthcare domain", patterns: [/\bhealthcare\b/i, /\bhealth\s?tech\b/i] },
  { label: "Global support", patterns: [/\bglobal support\b/i, /\bglobal\b/i] },
  { label: "Escalation management", patterns: [/\bescalation\b/i] },
  { label: "Incident operations", patterns: [/\bincident\b/i] },
  { label: "SLA ownership", patterns: [/\bsla\b/i] },
  { label: "Support operations", patterns: [/\bsupport operations?\b/i] },
  { label: "Customer support leadership", patterns: [/\bcustomer support\b/i, /\bleadership\b/i] },
  { label: "Cross-functional operations", patterns: [/\bcross-functional\b/i, /\bcross functional\b/i] },
  { label: "High-volume support", patterns: [/\bhigh[-\s]volume\b/i, /\bscale\b/i] },
];

const structureCueMatchers: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Responsibilities detected",
    patterns: [/\bresponsibilities\b/i, /\bwhat you'll do\b/i, /\byou will\b/i],
  },
  {
    label: "Requirements detected",
    patterns: [/\brequirements\b/i, /\bqualifications\b/i, /\bpreferred\b/i],
  },
  {
    label: "Seniority detected",
    patterns: [/\bsenior\b/i, /\bmanager\b/i, /\bdirector\b/i, /\bhead of\b/i],
  },
];

function detectSignalsFromJobDescription(text: string): string[] {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const detected: string[] = [];
  for (const matcher of detectedSignalMatchers) {
    if (matcher.patterns.every((pattern) => pattern.test(normalized))) {
      detected.push(matcher.label);
    }
    if (detected.length >= 5) {
      break;
    }
  }

  return Array.from(new Set(detected)).slice(0, 5);
}

function detectStructureCues(text: string): string[] {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return structureCueMatchers
    .filter((matcher) => matcher.patterns.some((pattern) => pattern.test(normalized)))
    .map((matcher) => matcher.label)
    .slice(0, 3);
}

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
  jdReady,
}: HeroAnalysisConsoleProps) {
  const [displayScore, setDisplayScore] = useState(clamp(scenario.score));
  const displayScoreRef = useRef(displayScore);
  const [verdictState, setVerdictState] = useState<VerdictState>("idle");
  const [showSecondaryUi, setShowSecondaryUi] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [showReadyPulse, setShowReadyPulse] = useState(false);
  const [showSignalModel, setShowSignalModel] = useState(false);
  const previousJdReadyRef = useRef(jdReady);
  const trimmedJobDescription = jobDescription.trim();
  const intakeState: "empty" | "partial" | "ready" =
    trimmedJobDescription.length === 0
      ? "empty"
      : trimmedJobDescription.length <= 120
        ? "partial"
        : "ready";
  const intakeHelperText =
    intakeState === "empty"
      ? "Include responsibilities, requirements, and preferred qualifications for the best result."
      : intakeState === "partial"
        ? "Add more of the job description for a more accurate result."
        : "Job description looks ready to analyze.";
  const structureCues = useMemo(
    () => detectStructureCues(trimmedJobDescription),
    [trimmedJobDescription],
  );
  const detectedSignals = useMemo(
    () => detectSignalsFromJobDescription(jobDescription),
    [jobDescription],
  );

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
    const wasReady = previousJdReadyRef.current;
    if (!wasReady && jdReady) {
      setShowReadyPulse(true);
      const timer = window.setTimeout(() => setShowReadyPulse(false), 175);
      previousJdReadyRef.current = jdReady;
      return () => window.clearTimeout(timer);
    }
    previousJdReadyRef.current = jdReady;
  }, [jdReady]);

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
    setShowSignalModel(true);
    setVerdictState("animating");

    const modelStageMs = 300;
    const startedAt = performance.now() + modelStageMs;
    const durationMs = 600;
    const holdMs = 150;
    let rafId = 0;
    let modelTimer = 0;
    let settleTimer = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
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

    modelTimer = window.setTimeout(() => {
      setShowSignalModel(false);
      rafId = window.requestAnimationFrame(tick);
    }, modelStageMs);
    return () => {
      window.clearTimeout(modelTimer);
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
    };
  }, [prefersReducedMotion, scenario.score]);

  const rightPanelTitle = "Signals";
  const scoreFocalClass =
    verdictState === "settled" ? "scale-[1.01] opacity-100" : "scale-100 opacity-100";
  const hasMeaningfulInteraction = jdReady || hasUserTriggeredAnalysis;

  return (
    <div data-run-id={runId} className="grid items-start gap-3 lg:items-stretch lg:grid-cols-[1.2fr_1.6fr_1.2fr]">
      <section className="flex h-full flex-col rounded-2xl border border-slate-700/90 bg-slate-900/60 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.08)_inset]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Job Compatibility Flow</p>

        <div className="mt-2.5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">Step 1  Paste a job description</p>
          <textarea
            value={jobDescription}
            onChange={(event) => onJobDescriptionChange(event.target.value)}
            onFocus={onJobDescriptionFocus}
            placeholder={placeholder}
            className="h-[128px] w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-400">{intakeHelperText}</p>

          {trimmedJobDescription.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {structureCues.map((cue) => (
                <span
                  key={cue}
                  className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-[10px] font-medium text-slate-300"
                >
                  {cue}
                </span>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Detected from job description</p>
            <div className="mt-2 flex min-h-7 flex-wrap gap-1.5">
              {detectedSignals.length > 0 ? (
                detectedSignals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-[10px] font-medium text-slate-300"
                  >
                    {signal}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500">Paste a job description to detect live signals.</span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400">Live Compatibility Score Preview updates as you type.</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">Step 2  Upload your resume</p>
          <p className="text-xs text-slate-300">Upload your resume to personalize this score.</p>

          <label className="flex cursor-pointer flex-col gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 p-2.5 text-xs text-slate-300 transition hover:border-slate-500">
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
          <p className="text-[11px] leading-relaxed text-slate-400">
            Your resume is processed only to generate this score. It is never stored unless you create an account.
          </p>

          <button
            type="button"
            onClick={() => onAnalyzeCompatibility()}
            disabled={isPreviewLoading || !jdReady}
            className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition ${
              jdReady
                ? "bg-[var(--accent-primary)] text-slate-950 hover:bg-[var(--accent-primary-hover)]"
                : "cursor-not-allowed border border-slate-700 bg-slate-900/70 text-slate-400"
            } transform transition-transform duration-[175ms] ${showReadyPulse ? "scale-[1.03]" : "scale-100"}`}
          >
            <span className="mr-2 hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-700 lg:inline">
              Step 3
            </span>
            {isPreviewLoading
              ? "Analyzing..."
              : jdReady
                ? "See Compatibility Score ->"
                : "Paste a job description to begin"}
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
          <p className="text-xs text-slate-500">Preview model</p>
        </div>

        {hasMeaningfulInteraction ? (
          <>
            {showSignalModel ? (
              <div className="mt-4 rounded-lg border border-slate-700/80 bg-slate-950/70 p-3 transition-opacity duration-150">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Resolving signal model</p>
                <div className="mt-2 space-y-1.5">
                  {signalModelRows.map((row, index) => (
                    <div key={row}>
                      <div className="flex items-center justify-between text-[10px] text-slate-300">
                        <span>{row}</span>
                      </div>
                      <div className="mt-1 h-1 w-full rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-sky-300/75 transition-all duration-300"
                          style={{ width: `${84 - index * 11}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="relative mt-5">
              <div
                className={`pointer-events-none absolute inset-0 rounded-xl bg-slate-200/5 transition-opacity ${
                  verdictState === "estimating" || verdictState === "animating" ? "animate-pulse opacity-100" : "opacity-0"
                }`}
              />
              <p
                className={`text-5xl font-bold leading-none text-white transition-all duration-200 lg:text-6xl ${scoreFocalClass}`}
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
              {hasUserTriggeredAnalysis ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Demo result using a sample baseline profile. Upload a resume to run a real comparison.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
            <p className="text-lg font-semibold text-slate-100">Your score appears here</p>
            <p className="mt-2 text-sm text-slate-400">Paste a job description to begin.</p>
            <p className="mt-1 text-xs text-slate-500">Upload your resume to personalize the result.</p>
            <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800">
              <div className="h-full w-0 rounded-full bg-slate-600" />
            </div>
          </div>
        )}
      </section>

      <section
        className={`relative flex h-full flex-col rounded-2xl border border-slate-700/90 bg-slate-900/60 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.08)_inset] transition-all duration-200 ${
          showSecondaryUi ? "translate-y-0 opacity-100 delay-150" : "translate-y-1 opacity-70"
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">{rightPanelTitle}</p>
        {!hasMeaningfulInteraction ? (
          <div className="mt-2.5 rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
            <p className="text-sm text-slate-300">Signals appear after analysis.</p>
            <p className="mt-1 text-xs text-slate-500">Paste the full job description, then run analysis.</p>
          </div>
        ) : scenario.score >= 70 ? (
          <>
            <div className="mt-2.5 rounded-xl border border-emerald-300/28 bg-emerald-400/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Strengths</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-emerald-100">
                {scenario.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="mt-2.5 rounded-xl border border-amber-300/28 bg-amber-300/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">Gaps</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-amber-100">
                {scenario.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a
                href="#product"
                className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
              >
                See Compatibility Score
              </a>
              <button
                type="button"
                onClick={onAnalyzeAnotherComparison}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
              >
                Analyze Another Role
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2.5 text-[11px] text-sky-100">Next step opportunities based on this result.</p>
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
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a
                href="#opportunity"
                className="inline-flex items-center justify-center rounded-lg bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Explore Opportunity Paths
              </a>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={onAnalyzeAnotherComparison}
                  className="inline-flex items-center justify-center rounded-lg border border-sky-300/60 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-200 hover:text-sky-50"
                >
                  Analyze Another Role
                </button>
              ) : (
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center justify-center rounded-lg border border-sky-300/60 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-200 hover:text-sky-50"
                >
                  Create Free Account
                </Link>
              )}
            </div>
          </>
        )}

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

    </div>
  );
}


