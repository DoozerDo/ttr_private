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

  const handleSampleRoleClick = (description: string) => {
    onJobDescriptionChange(description);
    window.setTimeout(() => {
      runButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const handleUploadClick = () => {
    onResumeUploadInitiated();
    fileInputRef.current?.click();
  };

  return (
    <>
      <div id="check-compatibility" className="scroll-mt-24" />
      <section id="compatibility-form" className="scroll-mt-24 border-b border-slate-800/60 bg-slate-900/15">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl rounded-2xl bg-slate-900/55 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.3)]">
          <h2 className="text-2xl font-semibold text-white lg:text-3xl">Run your analysis</h2>
          <p className="mt-2 text-sm text-slate-300">
            After you upload and paste the role, we generate a compatibility score and clear next action.
          </p>
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70"
                >
                  Select resume
                </button>
                <p className="text-sm text-slate-200">
                  {resumeFilename ? `Ready: ${resumeFilename}` : "PDF or DOCX"}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(event) => onResumeFileSelected(event.target.files?.[0] ?? null)}
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Paste job description
              </label>
              <textarea
                value={jobDescription}
                onChange={(event) => onJobDescriptionChange(event.target.value)}
                onFocus={onJobDescriptionFocus}
                placeholder="Paste the full job description here"
                className="mt-2 h-[144px] w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              />
              <div className="mt-3">
                <p className="text-xs text-slate-400">Try a sample role (example only):</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SAMPLE_ROLES.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => handleSampleRoleClick(sample.description)}
                      className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                ref={runButtonRef}
                type="button"
                onClick={onAnalyzeCompatibility}
                disabled={!jdReady || isPreviewLoading}
                className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition ${
                  jdReady
                    ? "bg-[var(--accent-primary)] text-slate-950 hover:bg-[var(--accent-primary-hover)]"
                    : "cursor-not-allowed border border-slate-700 bg-slate-900/70 text-slate-400"
                } transform transition-transform duration-[175ms] ${showReadyPulse ? "scale-[1.03]" : "scale-100"}`}
              >
                {isPreviewLoading ? "Analyzing role..." : "Analyze this role"}
              </button>
              {!jdReady ? (
                <p className="text-xs text-slate-600">Paste more of the job description to enable analysis.</p>
              ) : (
                <p className="text-xs text-slate-500">Ready. Click Analyze to generate your score.</p>
              )}
              <p className="text-xs text-slate-600">
                No signup required for your first analysis. We process your resume for scoring only.
              </p>
            </div>
          </div>
          {previewError ? <p className="mt-3 text-xs text-rose-300">{previewError}</p> : null}
        </div>
      </div>
      </section>
    </>
  );
}
