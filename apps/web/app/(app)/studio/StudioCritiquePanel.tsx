"use client";

import {
  REFINEMENT_PRESETS,
  type RefinementPreset,
} from "@/lib/documentStrategyPlan";

import {
  getCritiqueIssueLabel,
  resolveCritiqueBestNextPreset,
  resolveCritiqueIssuePreset,
  type DocumentCritique,
  type DocumentCritiqueIssue,
} from "@/lib/documentCritique";
import type { DocumentReadinessState } from "@shared/documentReadinessState";

type Props = {
  critique: DocumentCritique;
  documentReadinessState: DocumentReadinessState;
  isApplying?: boolean;
  onApplyRecommendation: (
    preset: RefinementPreset,
    issueType: DocumentCritiqueIssue["type"],
    placement: "best_next" | "issue",
  ) => void;
};

function resolveButtonLabel(issue: DocumentCritiqueIssue): string {
  const preset = resolveCritiqueIssuePreset(issue);
  return preset?.label ?? getCritiqueIssueLabel(issue.type);
}

function renderIssueSeverity(severity: DocumentCritiqueIssue["severity"]): string {
  if (severity === "high") return "High priority";
  if (severity === "medium") return "Medium priority";
  return "Lower priority";
}

function renderAssessmentLabel(critique: DocumentCritique, readiness: DocumentReadinessState): string {
  if (readiness === "ready") return "ready";
  if (readiness === "generated_unusable") return "generated_unusable";
  if (readiness === "failed") return "failed";
  if (readiness === "missing") return "missing";
  return critique.overallAssessment;
}

export function StudioCritiquePanel({ critique, documentReadinessState, isApplying, onApplyRecommendation }: Props) {
  const bestPreset = resolveCritiqueBestNextPreset(critique);
  const hasStrongSignal =
    documentReadinessState === "ready" &&
    critique.overallAssessment === "strong" &&
    critique.topIssues.every((issue) => issue.severity === "low");
  const assessmentLabel = renderAssessmentLabel(critique, documentReadinessState);

  return (
    <section
      className="space-y-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 shadow-sm"
      data-testid="studio-critique-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100/80">
            Document critique
          </p>
          <h2 className="text-lg font-semibold text-slate-50">What to improve next</h2>
          <p className="text-sm text-slate-300">
            A structured read on the highest-value weaknesses in the current resume and cover letter.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Assessment</p>
          <p className="text-2xl font-semibold text-slate-50 capitalize">{assessmentLabel}</p>
        </div>
      </div>

      {hasStrongSignal ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50">
          Your documents are in strong shape. Additional refinement is optional.
        </div>
      ) : null}

      {bestPreset ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4" data-testid="critique-best-next-action-block">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Best next move</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-50">{bestPreset.label}</p>
              <p className="text-sm text-slate-300">
                {critique.topIssues[0]?.explanation ?? "This is the highest-value adjustment for the current draft."}
              </p>
            </div>
            <button
              type="button"
              disabled={Boolean(isApplying)}
              onClick={() => onApplyRecommendation(bestPreset, critique.topIssues[0]?.type ?? "summary_generic", "best_next")}
              className="inline-flex items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="critique-best-next-action"
            >
              Apply recommendation
            </button>
          </div>
        </div>
      ) : null}

      {critique.topIssues.length ? (
        <div className="space-y-3">
          {critique.topIssues.map((issue) => {
            const preset = resolveCritiqueIssuePreset(issue);
            return (
              <article
                key={issue.type}
                className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"
                data-testid={`critique-issue-${issue.type}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-50">{getCritiqueIssueLabel(issue.type)}</p>
                    <p className="text-sm text-slate-300">{issue.explanation}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                    {renderIssueSeverity(issue.severity)}
                  </span>
                </div>

                {preset ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={Boolean(isApplying)}
                      onClick={() => onApplyRecommendation(preset, issue.type, "issue")}
                      className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid={`critique-issue-action-${issue.type}`}
                    >
                      {resolveButtonLabel(issue)}
                    </button>
                    <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      {preset.target === "both" ? "Resume + cover letter" : preset.target.replace("_", " ")}
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
          No high-value weaknesses stand out right now.
        </div>
      )}

      <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Best recommendation</p>
          <p className="mt-1 text-sm font-semibold text-slate-50">
            {critique.recommendedNextAction?.label ?? "Optional refinement"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Issue count</p>
          <p className="mt-1 text-sm text-slate-200">{critique.topIssues.length} prioritized issue(s)</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Available moves</p>
          <p className="mt-1 text-sm text-slate-200">
            {REFINEMENT_PRESETS.length} guided refinement options remain available.
          </p>
        </div>
      </div>
    </section>
  );
}

