"use client";

import { FormButton } from "@/components/FormButton";
import { BASELINE_READINESS_LABELS, BASELINE_USABLE_MIN_PERCENT } from "@/src/features/baseline/constants";
import { buildBaselineStrength } from "@/src/features/baseline/utils/baselineStrength";

type BaselineStrengthCardProps = {
  progressPercent: number;
  analysisStatus: "NOT_ANALYZED" | "ANALYZING" | "READY";
  isIncomplete: boolean;
  onContinue: () => void;
  onRunAnalysis?: () => void;
};

export function BaselineStrengthCard({
  progressPercent,
  analysisStatus,
  isIncomplete,
  onContinue,
  onRunAnalysis,
}: BaselineStrengthCardProps) {
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));
  const strength = buildBaselineStrength(boundedProgress);
  const readinessLabel = BASELINE_READINESS_LABELS[strength.readiness];
  const shouldAnalyze = analysisStatus === "NOT_ANALYZED" || analysisStatus === "READY";
  const nextStepLabel = shouldAnalyze
    ? "Next step: analyze this role."
    : "Next step: continue building baseline.";

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Baseline state</p>
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
          {analysisStatus === "NOT_ANALYZED"
            ? "Your baseline is active, but it has not been analyzed yet."
            : isIncomplete
              ? "Your baseline still needs a few signals before it is ready."
              : "Your baseline is ready for role analysis."}
        </p>
        <p className="text-sm text-slate-400">
          {analysisStatus === "NOT_ANALYZED"
            ? "The baseline exists, so the next step is to analyze it against a role."
            : isIncomplete
              ? "Add the missing baseline evidence before you analyze a role."
              : "The baseline is ready to compare against a specific role."}
        </p>
        <p className="text-sm font-medium text-slate-200">{nextStepLabel}</p>
      </div>

      {shouldAnalyze && onRunAnalysis ? (
        <FormButton onClick={onRunAnalysis}>Analyze this role</FormButton>
      ) : (
        <FormButton onClick={onContinue}>Continue building baseline</FormButton>
      )}
    </section>
  );
}
