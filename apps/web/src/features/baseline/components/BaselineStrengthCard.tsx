"use client";

import { FormButton } from "@/components/FormButton";
import {
  BASELINE_MILESTONES,
  BASELINE_READINESS_LABELS,
  BASELINE_USABLE_MIN_PERCENT,
} from "@/src/features/baseline/constants";
import { buildBaselineStrength } from "@/src/features/baseline/utils/baselineStrength";

type BaselineStrengthCardProps = {
  progressPercent: number;
  onContinue: () => void;
  onRunAnalysis?: () => void;
};

export function BaselineStrengthCard({
  progressPercent,
  onContinue,
  onRunAnalysis,
}: BaselineStrengthCardProps) {
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));
  const strength = buildBaselineStrength(boundedProgress);
  const readinessLabel = BASELINE_READINESS_LABELS[strength.readiness];
  const canRunAnalysis = boundedProgress >= BASELINE_USABLE_MIN_PERCENT;

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Baseline Strength
        </p>
        <div className="flex items-end gap-3">
          <p className="text-5xl font-semibold leading-none text-white">{boundedProgress}%</p>
          <div className="pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
              {`${strength.readiness} BASELINE`}
            </p>
            <p className="text-sm text-slate-300">{readinessLabel}</p>
          </div>
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
          Your baseline is the foundation used for scoring and downstream generation.
        </p>
        <p className="text-sm text-slate-400">
          Completing more areas improves readiness and unlocks analysis.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
        {BASELINE_MILESTONES.map((milestone) => {
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
              <p className="font-semibold">{milestone.valueLabel}</p>
              <p>{milestone.label}</p>
            </div>
          );
        })}
      </div>

      {canRunAnalysis && onRunAnalysis ? (
        <FormButton onClick={onRunAnalysis}>Run Career Compatibility Analysis</FormButton>
      ) : (
        <FormButton onClick={onContinue}>Continue Building Baseline</FormButton>
      )}
    </section>
  );
}
