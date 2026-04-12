"use client";

import { useEffect, useRef, useState } from "react";

type RunYourAnalysisSectionProps = {
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  onJobDescriptionFocus: () => void;
  resumeFilename: string | null;
  onResumeUploadInitiated: () => void;
  onResumeFileSelected: (file: File | null) => void;
  onAnalyzeCompatibility: () => void;
  isPreviewLoading: boolean;
  jdReady: boolean;
  previewError: string | null;
};

const SAMPLE_ROLES = [
  {
    label: "Director of Customer Support",
    description:
      "Director of Customer Support role. Lead enterprise support teams, improve escalation management, own incident communications, and drive SLA improvement across global regions. Requires Zendesk, Salesforce, and cross functional leadership with product and engineering teams.",
  },
  {
    label: "Head of Customer Operations",
    description:
      "Head of Customer Operations role. Own support operations strategy, workforce planning, process design, and tooling. Improve support quality metrics, automate workflows, and lead managers across distributed teams. Requires operational rigor and customer lifecycle ownership.",
  },
  {
    label: "VP Customer Experience",
    description:
      "VP Customer Experience role. Define customer journey strategy across onboarding, support, and retention. Partner with product, sales, and marketing to improve customer outcomes. Requires executive leadership, enterprise SaaS experience, and data driven decision making.",
  },
] as const;

export function RunYourAnalysisSection({
  jobDescription,
  onJobDescriptionChange,
  onJobDescriptionFocus,
  resumeFilename,
  onResumeUploadInitiated,
  onResumeFileSelected,
  onAnalyzeCompatibility,
  isPreviewLoading,
  jdReady,
  previewError,
}: RunYourAnalysisSectionProps) {
  const [showReadyPulse, setShowReadyPulse] = useState(false);
  const previousReadyRef = useRef(jdReady);
  const runButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleUploadClick = () => {
    onResumeUploadInitiated();
    fileInputRef.current?.click();
  };

  return (
    <>
      <div id="check-compatibility" className="scroll-mt-24" />
      <section id="compatibility-form" data-testid="landing-analysis-block" className="scroll-mt-24 bg-transparent">
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-3 pb-8 md:px-10 md:pt-4 md:pb-10 lg:px-16">
          <div
            data-testid="landing-analysis-card"
            className="mx-auto max-w-4xl rounded-[22px] border border-slate-600/70 bg-slate-900/95 p-6 shadow-[0_12px_25px_rgba(2,6,19,0.5)]"
          >
          <h2 className="text-2xl font-semibold text-white lg:text-3xl">Run the analysis</h2>
            <p className="mt-2 text-sm text-slate-300">
              Upload your resume, paste the job description, and check whether this role is truly within reach.
            </p>
            <div className="mt-6 space-y-6">
              <div className="rounded-[18px] border border-slate-500/70 bg-slate-900/85 p-5 shadow-[0_10px_20px_rgba(2,6,23,0.45)]">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200/40 bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_8px_20px_rgba(15,23,42,0.45)] transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    Upload resume
                  </button>
                  <p className="text-xs text-slate-400">
                    {resumeFilename ? `Loaded: ${resumeFilename}` : "PDF or DOCX only"}
                  </p>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  We extract your experience from the file. PDF and DOCX only.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(event) => onResumeFileSelected(event.target.files?.[0] ?? null)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Paste the job description
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(event) => onJobDescriptionChange(event.target.value)}
                  onFocus={onJobDescriptionFocus}
                  placeholder="Paste the full job description, including responsibilities and requirements."
                  className="mt-2 h-[144px] w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-white/60 focus:outline-none"
                />
                <div className="mt-3">
                  <p className="text-xs text-slate-400">Use the full posting so the fit score and gap signals are precise.</p>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  ref={runButtonRef}
                  type="button"
                  onClick={onAnalyzeCompatibility}
                  disabled={!jdReady || isPreviewLoading}
                  data-testid="landing-primary-action"
                  className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition ${
                    jdReady
                      ? "bg-[var(--accent-primary)] border border-[var(--accent-primary)] text-slate-950 shadow-[0_10px_30px_rgba(15,23,42,0.45)] hover:bg-[var(--accent-primary-hover)]"
                      : "cursor-not-allowed border border-slate-700 bg-slate-900/70 text-slate-400"
                  } transform transition-transform duration-[175ms] ${showReadyPulse ? "scale-[1.03]" : "scale-100"}`}
                >
                  {isPreviewLoading ? "Analyzing..." : "Check fit"}
                </button>
                {!jdReady ? (
                  <p className="text-xs text-slate-600">Paste at least 120 characters from the job description to enable analysis.</p>
                ) : (
                  <p className="text-xs text-slate-500">Ready. Run the analysis to see your fit.</p>
                )}
              </div>
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
