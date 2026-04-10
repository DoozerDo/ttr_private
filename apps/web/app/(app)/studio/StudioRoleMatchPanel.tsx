"use client";

import type {
  RoleMatchFinalAdjustment,
  RoleMatchFinalPass,
  RoleMatchFinalPassPriorityCoverage,
  RoleMatchFinalPassRisk,
} from "@shared/roleMatchFinalPass";

type Props = {
  finalPass: RoleMatchFinalPass;
  isApplying?: boolean;
  onApplyAdjustment: (adjustment: RoleMatchFinalAdjustment) => void;
  stylePolishNote?: string | null;
};

function readinessCopy(readiness: RoleMatchFinalPass["overallMatchReadiness"]) {
  if (readiness === "ready") {
    return {
      title: "Ready to export",
      body: "Your documents strongly reflect the role's top priorities.",
      tone: "border-emerald-300/25 bg-emerald-500/10 text-emerald-50",
    };
  }
  if (readiness === "needs_tightening") {
    return {
      title: "Good, but one final tightening is recommended",
      body: "The documents are strong, but a small role-specific adjustment would improve the scan.",
      tone: "border-amber-300/25 bg-amber-500/10 text-amber-50",
    };
  }
  return {
    title: "Final role alignment still needs work",
    body: "The draft is not yet clearly tuned to this specific job.",
    tone: "border-rose-300/25 bg-rose-500/10 text-rose-50",
  };
}

function severityLabel(severity: RoleMatchFinalPassRisk["severity"]): string {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

function coverageLabel(entry: RoleMatchFinalPassPriorityCoverage): string {
  if (entry.strength === "strong") return "Strong";
  if (entry.strength === "partial") return "Partial";
  return "Missing";
}

export function StudioRoleMatchPanel({ finalPass, isApplying, onApplyAdjustment, stylePolishNote }: Props) {
  const copy = readinessCopy(finalPass.overallMatchReadiness);
  const hasAdjustment = finalPass.recommendedFinalAdjustments.length > 0;
  const primaryAdjustment = finalPass.recommendedFinalAdjustments[0] ?? null;

  return (
    <section
      className="space-y-4 rounded-2xl border border-sky-300/20 bg-sky-500/10 p-4 shadow-sm"
      data-testid="studio-role-match-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/80">
            Final role check
          </p>
          <h2 className="text-lg font-semibold text-slate-50">{copy.title}</h2>
          <p className="text-sm text-slate-300">{copy.body}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Match readiness</p>
          <p className="text-2xl font-semibold capitalize text-slate-50">
            {finalPass.overallMatchReadiness.replace("_", " ")}
          </p>
        </div>
      </div>

      {stylePolishNote ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200">
          {stylePolishNote}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Priority coverage</p>
        <div className="mt-3 space-y-2">
          {finalPass.priorityCoverage.slice(0, 3).map((priority) => (
            <div
              key={priority.priority}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-50">{priority.priority}</p>
                <p className="text-xs text-slate-400">
                  Evidence source: {priority.evidenceSource ?? "not yet visible"}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                {coverageLabel(priority)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {finalPass.recruiterScanRisks.length ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Recruiter scan risks</p>
          <ul className="mt-3 space-y-2">
            {finalPass.recruiterScanRisks.slice(0, 3).map((risk) => (
              <li key={risk.type} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-50">{risk.explanation}</p>
                  <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                    {severityLabel(risk.severity)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Keyword alignment</p>
          <p className="mt-1 text-sm text-slate-200">
            {finalPass.keywordAlignment.strongMatches.length} strong,{" "}
            {finalPass.keywordAlignment.partialMatches.length} partial
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Missing concepts</p>
          <p className="mt-1 text-sm text-slate-200">
            {finalPass.keywordAlignment.missingButImportant.length > 0
              ? finalPass.keywordAlignment.missingButImportant.slice(0, 2).join(", ")
              : "None that need immediate attention"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Stuffing check</p>
          <p className="mt-1 text-sm text-slate-200">
            {finalPass.keywordAlignment.stuffedOrExcessive.length > 0
              ? "Potential stuffing detected"
              : "No keyword stuffing signal"}
          </p>
        </div>
      </div>

      {hasAdjustment ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Recommended final adjustment</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-50">{primaryAdjustment?.label}</p>
              <p className="text-sm text-slate-300">
                {primaryAdjustment?.type === "summary_tighten"
                  ? "Tighten the top-line framing so the role reads faster."
                  : primaryAdjustment?.type === "bullet_reorder"
                    ? "Surface the strongest proof earlier in the resume."
                    : primaryAdjustment?.type === "keyword_tighten"
                      ? "Bring the role's core language into view where the evidence already supports it."
                      : "Make the cover letter sound specific to this role, not just generally enthusiastic."}
              </p>
            </div>
            {primaryAdjustment ? (
              <button
                type="button"
                disabled={Boolean(isApplying)}
                onClick={() => onApplyAdjustment(primaryAdjustment)}
                className="inline-flex items-center justify-center rounded-xl bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="final-role-adjustment-button"
              >
                Apply final adjustment
              </button>
            ) : null}
          </div>

          {finalPass.recommendedFinalAdjustments.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {finalPass.recommendedFinalAdjustments.slice(1, 3).map((adjustment) => (
                <button
                  key={adjustment.type}
                  type="button"
                  disabled={Boolean(isApplying)}
                  onClick={() => onApplyAdjustment(adjustment)}
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {adjustment.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
          Ready to export. Your documents strongly reflect the role's top priorities.
        </div>
      )}
    </section>
  );
}

