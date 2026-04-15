"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RunYourAnalysisSectionProps = {
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  onJobDescriptionFocus: () => void;
  resumeFilename: string | null;
  onResumeUploadInitiated: () => void;
  onResumeFileSelected: (file: File | null) => void;
  onAnalyzeCompatibility: () => void | Promise<void>;
  onUnlockFullAnalysis: () => void;
  isPreviewLoading: boolean;
  jdReady: boolean;
  canRequestScore: boolean;
  previewError: string | null;
  previewScore: number | null;
  previewScoreBucket: string | null;
  debugState?: {
    lastStep:
      | "idle"
      | "file_selected"
      | "upload_started"
      | "upload_succeeded"
      | "upload_failed"
      | "preview_started"
      | "preview_succeeded"
      | "preview_failed"
      | "blocked_by_auth_bootstrap";
    resumeFilename: string | null;
    uploadRequestStartedAt: string | null;
    uploadRequestFinishedAt: string | null;
    previewRequestStartedAt: string | null;
    previewRequestFinishedAt: string | null;
    authBootstrapAttempted: boolean;
    authBootstrapFailed: boolean;
    lastError: { code: string; message: string } | null;
  };
};

function isPublicDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debugCheckFit") === "1";
  } catch {
    return false;
  }
}

function resolveFitLabelFromBand(band: string | null): string | null {
  if (!band) return null;
  if (band === "TOP") return "Strong fit";
  if (band === "MID") return "Moderate fit";
  if (band === "LOW") return "Stretch fit";
  if (band === "90_plus") return "Strong fit";
  if (band === "80s" || band === "70s") return "Moderate fit";
  if (band === "60s" || band === "under_60") return "Stretch fit";
  return null;
}

export function RunYourAnalysisSection({
  jobDescription,
  onJobDescriptionChange,
  onJobDescriptionFocus,
  resumeFilename,
  onResumeUploadInitiated,
  onResumeFileSelected,
  onAnalyzeCompatibility,
  onUnlockFullAnalysis,
  isPreviewLoading,
  jdReady,
  canRequestScore,
  previewError,
  previewScore,
  previewScoreBucket,
  debugState,
}: RunYourAnalysisSectionProps) {
  const [showReadyPulse, setShowReadyPulse] = useState(false);
  const [hasClickedCheckFit, setHasClickedCheckFit] = useState(false);
  const [inputsExpanded, setInputsExpanded] = useState(true);
  const previousReadyRef = useRef(jdReady);
  const runButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jobTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputsContentRef = useRef<HTMLDivElement | null>(null);
  const [inputsMaxHeight, setInputsMaxHeight] = useState<number | null>(null);

  const hasResult = typeof previewScore === "number";
  const fitLabel = useMemo(() => resolveFitLabelFromBand(previewScoreBucket), [previewScoreBucket]);
  const showDebug = useMemo(() => isPublicDebugEnabled(), []);

  const supportingLine = useMemo(() => {
    if (!fitLabel) return null;
    if (fitLabel === "Strong fit") return "You’re competitive for this role — but not guaranteed.";
    if (fitLabel === "Moderate fit") return "You’re close, but there are gaps that could hold you back.";
    return "This role is a reach based on your current experience.";
  }, [fitLabel]);

  const flowState = useMemo(() => {
    if (hasResult) return "gated";
    if (isPreviewLoading) return "scoring";
    if (canRequestScore) return "input_ready";
    return "idle";
  }, [canRequestScore, hasResult, isPreviewLoading]);

  const [revealStage, setRevealStage] = useState<"hidden" | "revealing" | "shown">("hidden");

  useEffect(() => {
    const wasReady = previousReadyRef.current;
    if (!wasReady && jdReady) {
      setShowReadyPulse(true);
      const timer = window.setTimeout(() => setShowReadyPulse(false), 175);
      previousReadyRef.current = jdReady;
      return () => window.clearTimeout(timer);
    }
    previousReadyRef.current = jdReady;
  }, [jdReady]);

  useEffect(() => {
    if (!hasResult) {
      setRevealStage("hidden");
      return;
    }
    setRevealStage("revealing");
    const timer = window.setTimeout(() => setRevealStage("shown"), 220);
    return () => window.clearTimeout(timer);
  }, [hasResult]);

  useEffect(() => {
    if (!hasResult || revealStage !== "shown") return;
    try {
      window.dispatchEvent(new CustomEvent("ttr:landing-score-revealed", { detail: { revealed: true } }));
    } catch {
      // no-op
    }
  }, [hasResult, revealStage]);

  useEffect(() => {
    if (!hasResult) {
      setInputsExpanded(true);
      return;
    }
    setInputsExpanded(false);
  }, [hasResult]);

  useEffect(() => {
    const el = inputsContentRef.current;
    if (!el) return;
    setInputsMaxHeight(el.scrollHeight);
  }, [inputsExpanded, resumeFilename, jobDescription.length, jdReady, hasResult]);

  const handleUploadClick = () => {
    onResumeUploadInitiated();
    fileInputRef.current?.click();
  };

  const resetTextareaScrollTop = () => {
    const el = jobTextareaRef.current;
    if (!el) return;
    window.requestAnimationFrame(() => {
      try {
        el.scrollTop = 0;
      } catch {
        // no-op
      }
    });
  };

  const handleAnalyzeClick = async () => {
    setHasClickedCheckFit(true);
    if (!canRequestScore) return;
    try {
      await onAnalyzeCompatibility();
    } catch (error) {
      console.error("[landing-checkfit] analyze click failed", error);
    }
  };

  return (
    <>
      <div id="check-compatibility" className="scroll-mt-24" />
      <section id="compatibility-form" data-testid="landing-analysis-block" className="scroll-mt-24 bg-transparent">
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-3 pb-8 md:px-10 md:pt-4 md:pb-10 lg:px-16">
          <div data-testid="landing-analysis-card" className="mx-auto max-w-4xl rounded-[24px] border border-slate-600/60 bg-slate-900/90 p-6 shadow-[0_18px_40px_rgba(2,6,19,0.55)] md:p-7">
            <h2 className="text-2xl font-semibold text-white lg:text-3xl">Run the analysis</h2>
            <p className="mt-2 text-sm text-slate-300">Upload your resume and paste the job description.</p>
            <span className="sr-only" data-testid="landing-flow-state">{flowState}</span>

            <div className="mt-6 space-y-6">
              {hasResult ? (
                <div className="space-y-4" data-testid="landing-result-state">
                  <div
                    data-testid="landing-preview-score"
                    className={`relative overflow-hidden rounded-[28px] border border-white/12 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(99,102,241,0.28)_0%,rgba(255,255,255,0.03)_55%,rgba(255,255,255,0.02)_100%)] px-6 py-6 text-slate-100 shadow-[0_22px_70px_rgba(2,6,23,0.62)] backdrop-blur transition-all duration-300 ${revealStage === "shown" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
                  >
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                      <div className="absolute -top-24 left-1/2 h-48 w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
                      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-transparent" />
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-300/80">Fit score</div>
                    <div className="mt-3 flex items-end gap-3">
                      <div className={`text-6xl font-semibold tracking-tight text-white transition-[transform,opacity] duration-300 ${revealStage === "shown" ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"}`} data-testid="landing-score-number">{previewScore}</div>
                      <div className="pb-2 text-sm font-medium text-slate-300">/ 100</div>
                    </div>
                    <div className="mt-3 text-xl font-semibold text-white" data-testid="landing-fit-label">{fitLabel ?? "Fit signal"}</div>
                    <div className="mt-1 text-sm text-slate-300" data-testid="landing-supporting-line">{supportingLine ?? ""}</div>
                    <div className="mt-3 text-sm font-semibold text-white/90" data-testid="landing-partial-indicator">This score doesn’t explain why you might still get rejected.</div>
                  </div>

                  {revealStage === "shown" ? (
                    <p data-testid="landing-personalization-hook" className="px-1 text-sm text-slate-300">
                      Based on this role, there are a few signals you’re likely missing.
                    </p>
                  ) : null}

                  <div
                    data-testid="landing-tension-bridge"
                    className={`overflow-hidden rounded-2xl border border-white/8 bg-slate-950/25 px-5 py-4 shadow-[0_10px_25px_rgba(2,6,23,0.28)] transition-[opacity,max-height,transform] duration-300 ${revealStage === "shown" ? "max-h-48 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div aria-hidden="true" className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-200">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M10.29 3.86 2.82 17a2 2 0 0 0 1.71 3h14.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-base font-semibold text-white">But your score doesn’t tell the whole story.</p>
                        <p className="mt-1 text-sm text-slate-300">Candidates with similar scores often don’t get interviews.</p>
                      </div>
                    </div>
                  </div>

                  <div data-testid="landing-gated-insights" className="rounded-[22px] border border-white/12 bg-white/[0.02] px-5 py-5 shadow-[0_14px_40px_rgba(2,6,23,0.45)]">
                    <p className="text-xs text-slate-400" data-testid="landing-legitimacy-line">We analyzed your resume against this job’s requirements.</p>
                    <div className="mt-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-white">See what’s actually holding you back</div>
                        <div className="mt-1 text-sm text-slate-300">Sign up to reveal the blockers.</div>
                      </div>
                      <div aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-slate-200">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M6.5 10h11A2.5 2.5 0 0 1 20 12.5v6A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-6A2.5 2.5 0 0 1 6.5 10Z" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3" aria-hidden="true">
                      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300/80 blur-[0.6px]">Missing signals hiring managers look for</div>
                        <div className="mt-2 h-2 w-64 rounded bg-white/10" />
                        <div className="mt-2 h-2 w-44 rounded bg-white/10" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-slate-950/55 to-slate-950/85" />
                        <div className="pointer-events-none absolute -left-24 top-0 h-full w-24 -skew-x-12 bg-white/6 blur-lg animate-pulse" />
                      </div>
                      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300/80 blur-[0.6px]">Where your experience doesn’t match the role</div>
                        <div className="mt-2 h-2 w-56 rounded bg-white/10" />
                        <div className="mt-2 h-2 w-52 rounded bg-white/10" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-slate-950/55 to-slate-950/85" />
                        <div className="pointer-events-none absolute -left-24 top-0 h-full w-24 -skew-x-12 bg-white/6 blur-lg animate-pulse" />
                      </div>
                      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300/80 blur-[0.6px]">Why you might be filtered out</div>
                        <div className="mt-2 h-2 w-72 rounded bg-white/10" />
                        <div className="mt-2 h-2 w-36 rounded bg-white/10" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-slate-950/55 to-slate-950/85" />
                        <div className="pointer-events-none absolute -left-24 top-0 h-full w-24 -skew-x-12 bg-white/6 blur-lg animate-pulse" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button type="button" onClick={onUnlockFullAnalysis} aria-label="Show me what’s missing" data-testid="landing-primary-action" className="inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(15,23,42,0.45)] transition hover:bg-slate-100">
                      Show me what’s missing
                    </button>
                    <p className="text-center text-xs text-slate-300" data-testid="landing-primary-action-subline">See exactly what’s holding you back</p>
                  </div>
                </div>
              ) : null}

              <details
                data-testid="landing-inputs"
                open={inputsExpanded}
                onToggle={(event) => setInputsExpanded((event.currentTarget as HTMLDetailsElement).open)}
                className={hasResult ? "rounded-2xl border border-white/8 bg-white/[0.01] px-5 py-4 transition" : ""}
              >
                {hasResult ? <summary className="cursor-pointer select-none text-sm font-semibold text-slate-200">Edit inputs</summary> : null}
                <div
                  ref={inputsContentRef}
                  style={hasResult ? { maxHeight: inputsExpanded ? inputsMaxHeight ?? undefined : 0 } : undefined}
                  className={hasResult ? `mt-4 overflow-hidden transition-[max-height,opacity,transform] duration-300 ${inputsExpanded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}` : ""}
                >
                  <div className="space-y-6">
                  <div className="rounded-[18px] border border-slate-600/50 bg-slate-950/35 p-5 shadow-[0_10px_24px_rgba(2,6,23,0.35)]">
                    <div className="flex flex-wrap items-center gap-4">
                      <button type="button" onClick={handleUploadClick} data-testid="landing-upload-resume-button" className="inline-flex items-center justify-center rounded-lg border border-slate-200/40 bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_26px_rgba(15,23,42,0.45)] transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
                        Upload resume
                      </button>
                      {resumeFilename ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                          <span className="font-semibold">Resume loaded</span>
                          <span className="text-emerald-200/90">{resumeFilename}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">PDF or DOCX only</p>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">We extract text from your PDF/DOCX to score against the role.</p>
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" data-testid="landing-resume-input" className="hidden" onChange={(event) => onResumeFileSelected(event.target.files?.[0] ?? null)} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Paste the job description</label>
                    <textarea ref={jobTextareaRef} value={jobDescription} onChange={(event) => onJobDescriptionChange(event.target.value)} onPaste={resetTextareaScrollTop} onFocus={onJobDescriptionFocus} placeholder="Paste the full job description, including responsibilities and requirements." data-testid="landing-job-description-input" className="mt-2 h-[168px] w-full resize-none rounded-xl border border-slate-700/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] focus:border-white/60 focus:outline-none" />
                  </div>

                  {!hasResult ? (
                    <div className="space-y-2">
                      <button
                        ref={runButtonRef}
                        type="button"
                        onClick={handleAnalyzeClick}
                        aria-disabled={!canRequestScore}
                        aria-label="Get your fit score"
                        data-testid="landing-primary-action"
                        className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition ${
                          canRequestScore
                            ? "bg-[var(--accent-primary)] border border-[var(--accent-primary)] text-slate-950 shadow-[0_10px_30px_rgba(15,23,42,0.45)] hover:bg-[var(--accent-primary-hover)]"
                            : "cursor-not-allowed border border-slate-700 bg-slate-900/70 text-slate-400"
                        } transform transition-transform duration-[175ms] ${showReadyPulse ? "scale-[1.03]" : "scale-100"}`}
                      >
                        {isPreviewLoading ? "Analyzing..." : "Get your fit score"}
                      </button>
                    </div>
                  ) : null}
                  </div>
                </div>
              </details>

              {showDebug ? (
                <details className="rounded-xl border border-amber-300/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-amber-200">
                  <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">Debug diagnostics</summary>
                  <div className="mt-2">
                    <div className="font-semibold tracking-[0.14em] uppercase">CHECKFIT_DEBUG_V2</div>
                    <div>jdReady: {String(jdReady)}</div>
                    <div>isPreviewLoading: {String(isPreviewLoading)}</div>
                    <div>hasResumeFilename: {String(Boolean(resumeFilename))}</div>
                    <div>jobDescriptionLength: {jobDescription.length}</div>
                    <div>hasClickedCheckFit: {String(hasClickedCheckFit)}</div>
                    <div>lastStep: {debugState?.lastStep ?? "idle"}</div>
                    {debugState ? (
                      <>
                        <div>selectedFilename: {debugState.resumeFilename ?? "(none)"}</div>
                        <div>uploadStartedAt: {debugState.uploadRequestStartedAt ?? "(none)"}</div>
                        <div>uploadFinishedAt: {debugState.uploadRequestFinishedAt ?? "(none)"}</div>
                        <div>previewStartedAt: {debugState.previewRequestStartedAt ?? "(none)"}</div>
                        <div>previewFinishedAt: {debugState.previewRequestFinishedAt ?? "(none)"}</div>
                        <div>authBootstrapAttempted: {String(debugState.authBootstrapAttempted)}</div>
                        <div>authBootstrapFailed: {String(debugState.authBootstrapFailed)}</div>
                        <div>lastError: {debugState.lastError ? `${debugState.lastError.code}: ${debugState.lastError.message}` : "(none)"}</div>
                      </>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {!resumeFilename ? (
                <p className="text-xs text-slate-500">Upload your resume to enable scoring.</p>
              ) : !jdReady ? (
                <p className="text-xs text-slate-500">Paste at least 120 characters of the job description.</p>
              ) : !hasResult ? (
                <p className="text-xs text-slate-400">Ready.</p>
              ) : null}
            </div>

            <div className="mt-3 min-h-5">
              {previewError ? <p className="text-xs text-rose-300">{previewError}</p> : <p className="text-xs text-slate-500"> </p>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
