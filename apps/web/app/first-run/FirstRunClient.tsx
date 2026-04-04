"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { normalizeAnalysisResult, saveLastAnalysis } from "../(app)/lib/session";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";

export function FirstRunClient() {
  const router = useRouter();
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const progressMessage = useMemo(
    () => ["Analyzing your experience...", "Comparing against role requirements..."][progressIndex] ?? "",
    [progressIndex],
  );

  const canSubmit = jobDescription.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    setProgressIndex(0);
    trackEvent("compatibility_analysis_started", {
      source: "app",
      jobDescriptionLength: jobDescription.trim().length,
      hasResume: resumeText.trim().length > 0,
      analysisNumber: 1,
    });

    const timer = window.setInterval(() => {
      setProgressIndex((current) => Math.min(current + 1, 1));
    }, 1400);

    try {
      const response = await fetch("/api/preview/compatibility-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(resumeText.trim() ? { resumeText: resumeText.trim() } : {}),
          jobDescriptionText: jobDescription.trim(),
          mode: "final-preview",
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to analyze this role right now.");
      }

      const payload = (await response.json().catch(() => null)) as { score?: unknown } | null;
      const score = typeof payload?.score === "number" ? payload.score : null;
      if (score === null) {
        throw new Error("Unable to analyze this role right now.");
      }

      const analysis = normalizeAnalysisResult({
        score,
        scoring_v2: { score },
        strengths: [],
        gaps: [],
        summary: "First-run analysis completed.",
      });

      saveLastAnalysis({
        savedAt: new Date().toISOString(),
        analysis,
        fitScore: score,
        jobSource: { type: "pasted" },
      });

      trackEvent("compatibility_analysis_completed", {
        source: "landing",
        score,
        scoreBucket: resolveScoreBucket(score),
      });

      await router.replace("/results");
      await router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to analyze this role right now.");
    } finally {
      clearInterval(timer);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#050816_0%,_#070b14_60%,_#050816_100%)] px-4 py-5 text-slate-100 md:px-6 md:py-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <section className="space-y-2 pt-1 md:pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Target This Role</p>
          <h1 className="text-3xl font-semibold tracking-tighter text-white md:text-4xl">Let&apos;s check a role.</h1>
          <p className="max-w-xl text-[0.98rem] leading-7 text-slate-200 md:text-base">
            Upload your resume and paste a job description to see where you actually stand.
          </p>
          <p className="text-sm text-slate-400">This takes about a minute and gives you a real answer.</p>
        </section>

        <section className="rounded-[24px] border border-slate-700/80 bg-slate-950/80 p-4 shadow-[0_18px_50px_rgba(2,6,23,0.28)] md:p-5">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Resume upload
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-slate-950">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (!file) return;
                      setResumeFilename(file.name);
                      setResumeText((await file.text().catch(() => "")).trim());
                    }}
                  />
                  Select resume
                </label>
                <p className="text-sm text-slate-200">{resumeFilename ? resumeFilename : "PDF or DOCX"}</p>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Job description
              </label>
              <textarea
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the full job description here"
                className="mt-2 h-48 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              />
            </div>

            <p className="text-sm text-slate-400">Grounded in your actual experience. Built to show where you match and where you do not.</p>

            {isSubmitting ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-200">
                <p>{progressMessage}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full w-1/2 rounded-full bg-[var(--accent-primary)] transition-transform duration-300"
                    style={{ transform: progressIndex > 0 ? "translateX(100%)" : "translateX(0)" }}
                  />
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent-primary)] px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Checking..." : "Check this role"}
            </button>
          </div>
        </section>

        {error ? <p className="px-1 text-sm text-rose-300">{error}</p> : null}
      </div>
    </main>
  );
}
