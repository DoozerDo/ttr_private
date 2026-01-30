"use client";

type RailStepStatus = "complete" | "current" | "future" | "blocked";

type BaselineProgressRailProps = {
  hasBaselineSelected: boolean;
  hasJobSelected: boolean;
  isScoring: boolean;
  isCompletionMoment: boolean;
  isComplianceBlocked?: boolean;
};

type RailStep = {
  label: string;
  status: RailStepStatus;
  helper?: string;
};

export function BaselineProgressRail({
  hasBaselineSelected,
  hasJobSelected,
  isScoring,
  isCompletionMoment,
  isComplianceBlocked = false,
}: BaselineProgressRailProps) {
  const matchStatus: RailStepStatus = !hasBaselineSelected || !hasJobSelected
    ? "future"
    : isComplianceBlocked
      ? "blocked"
      : "current";

  const steps: RailStep[] = [
    {
      label: "Baseline",
      status: hasBaselineSelected ? "complete" : "current",
    },
    {
      label: "Job",
      status: hasBaselineSelected ? (hasJobSelected ? "complete" : "current") : "future",
    },
    {
      label: "Match",
      status: matchStatus,
      helper: isComplianceBlocked ? "Blocked" : isScoring ? "Scoring" : undefined,
    },
    {
      label: "Results",
      status: isCompletionMoment ? "current" : "future",
    },
  ];

  return (
    <aside className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-xl shadow-black/40">
      <p className="mb-3 text-[11px] uppercase tracking-[0.4em] text-slate-400">
        Targeting steps
      </p>
      <div className="space-y-3 text-sm text-slate-200">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={[
                  "h-3 w-3 rounded-full",
                  step.status === "current"
                    ? "border border-white/40 bg-white/10"
                    : step.status === "complete"
                      ? "bg-amber-400"
                      : step.status === "blocked"
                        ? "bg-amber-500/80"
                        : "border border-white/10 bg-transparent",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <span className="text-xs font-semibold tracking-[0.25em] text-slate-300">
                {step.label}
              </span>
            </div>
            {step.helper ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                {step.helper}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
