"use client";

import type {
  DocumentStrategyPlan,
  RefinementPreset,
} from "@/lib/documentStrategyPlan";
import { REFINEMENT_PRESETS } from "@/lib/documentStrategyPlan";

type Props = {
  plan: DocumentStrategyPlan;
  refinementCount: number;
  statusMessage?: string | null;
  isApplying?: boolean;
  onApplyRefinement: (preset: RefinementPreset) => void;
  onUndo: () => void;
  onReset: () => void;
};

export function StudioRefinementPanel({
  plan,
  refinementCount,
  statusMessage,
  isApplying,
  onApplyRefinement,
  onUndo,
  onReset,
}: Props) {
  const hasHistory = refinementCount > 0;

  return (
    <section
      className="space-y-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4 shadow-sm"
      data-testid="studio-refinement-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
            Guided refinement
          </p>
          <h2 className="text-lg font-semibold text-slate-50">Refine this output</h2>
          <p className="text-sm text-slate-300">
            Make targeted adjustments without losing the current strategy or baseline truth.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Version stack</p>
          <p className="text-2xl font-semibold text-slate-50">{refinementCount}</p>
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REFINEMENT_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            disabled={Boolean(isApplying)}
            onClick={() => onApplyRefinement(preset)}
            className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-left transition hover:border-cyan-200/30 hover:bg-slate-950/60 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`refinement-option-${preset.key}`}
          >
            <p className="text-sm font-semibold text-slate-50">{preset.label}</p>
            <p className="mt-1 text-sm text-slate-300">{preset.description}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">
              {preset.target === "both" ? "Resume + Cover Letter" : preset.target.replace("_", " ")}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!hasHistory || Boolean(isApplying)}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Undo last refinement
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasHistory || Boolean(isApplying)}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Revert to original
        </button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Positioning</p>
          <p className="mt-1 text-sm font-semibold text-slate-50">{plan.positioningFrame}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Resume emphasis</p>
          <p className="mt-1 text-sm text-slate-200">{plan.resumeEmphasis.slice(0, 3).join(", ")}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Cover letter</p>
          <p className="mt-1 text-sm text-slate-200">{plan.qualityPass.coverLetterDelta[0] ?? plan.coverLetterThemes[0] ?? "Additive fit narrative"}</p>
        </div>
      </div>
    </section>
  );
}
