"use client";

import { type StudioNextMove as StudioNextMoveModel } from "@/src/lib/studio/nextMove";

type StudioNextMoveProps = {
  move: StudioNextMoveModel;
  className?: string;
};

export function StudioNextMove({ move, className }: StudioNextMoveProps) {
  return (
    <section className={className ?? "space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"}>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-100">{move.title}</p>
        <p className="text-sm text-slate-300">{move.description}</p>
        {move.context ? <p className="text-xs text-slate-400">{move.context}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          onClick={move.primaryAction.action}
        >
          {move.primaryAction.label}
        </button>
        {move.secondaryAction ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/20 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            onClick={move.secondaryAction.action}
          >
            {move.secondaryAction.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}
