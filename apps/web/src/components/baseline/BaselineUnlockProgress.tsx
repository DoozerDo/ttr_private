"use client";

import { FormButton } from "@/components/FormButton";

type BaselineUnlockProgressProps = {
  progressPercent: number;
  milestoneLabel: string;
  isBaselineReady: boolean;
  onContinue: () => void;
  onRunAnalysis: () => void;
};

const MILESTONES = [
  { value: 28, label: "Resume ingested" },
  { value: 45, label: "Career history confirmed" },
  { value: 65, label: "Leadership and scope clarified" },
  { value: 82, label: "Systems and operational context added" },
  { value: 100, label: "Baseline ready" },
] as const;

export function BaselineUnlockProgress({
  progressPercent,
  milestoneLabel,
  isBaselineReady,
  onContinue,
  onRunAnalysis,
}: BaselineUnlockProgressProps) {
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Baseline Strength
        </p>
        <div className="flex items-end gap-3">
          <p className="text-5xl font-semibold leading-none text-white">{boundedProgress}%</p>
          <p className="pb-1 text-sm text-slate-300">{milestoneLabel}</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
            style={{ width: `${boundedProgress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold text-slate-100">
          Complete your baseline to unlock accurate compatibility scoring.
        </p>
        <p className="text-sm text-slate-400">
          Your compatibility analysis is based on structured signals in your baseline, not keyword
          matching.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
        {MILESTONES.map((milestone) => {
          const isComplete = boundedProgress >= milestone.value;
          return (
            <div
              key={milestone.value}
              className={`rounded-xl border px-3 py-2 text-xs ${
                isComplete
                  ? "border-white/30 bg-white/10 text-slate-100"
                  : "border-white/10 bg-slate-950/40 text-slate-400"
              }`}
            >
              <p className="font-semibold">{milestone.value}%</p>
              <p>{milestone.label}</p>
            </div>
          );
        })}
      </div>

      {isBaselineReady ? (
        <div className="space-y-2 rounded-xl border border-white/20 bg-white/5 p-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
            Baseline Ready
          </p>
          <FormButton onClick={onRunAnalysis}>Run Career Compatibility Analysis</FormButton>
        </div>
      ) : (
        <FormButton onClick={onContinue}>Continue Building Baseline</FormButton>
      )}
    </section>
  );
}
