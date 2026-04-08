import { buildDocumentStrategyPlanSummary, type DocumentStrategyPlan } from "@/lib/documentStrategyPlan";

type DocumentStrategyPlanSummaryProps = {
  plan: DocumentStrategyPlan;
};

export function DocumentStrategyPlanSummary({ plan }: DocumentStrategyPlanSummaryProps) {
  const summary = buildDocumentStrategyPlanSummary(plan);

  return (
    <section
      className="space-y-3 rounded-2xl border border-sky-300/20 bg-sky-500/8 p-4 shadow"
      data-testid="studio-document-plan-summary"
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
          Document strategy
        </p>
        <h3 className="text-base font-semibold text-slate-50">One plan, two artifacts</h3>
        <p className="text-sm text-slate-200">{plan.summaryStrategy}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Positioning</p>
          <p className="text-sm font-medium text-slate-100">{summary.positioning}</p>
          {plan.fitScore !== null ? (
            <p className="text-xs text-slate-300">
              Fit score {Math.round(plan.fitScore)} {plan.fitBand ? `- ${plan.fitBand}` : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-1 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Emphasis</p>
          <p className="text-sm text-slate-100">{summary.emphasis || "Role-relevant evidence"}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cover letter</p>
          <p className="text-sm text-slate-100">{summary.coverLetter || "Strategic fit narrative"}</p>
        </div>

        <div className="space-y-1 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Quality</p>
          <p className="text-sm text-slate-100">{summary.quality}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/35 p-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Selected evidence</p>
        {summary.evidence.length ? (
          <ul className="space-y-1 text-sm text-slate-200">
            {summary.evidence.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-300">
            The plan will keep the strongest baseline evidence in focus and leave weaker material out of the lead.
          </p>
        )}
      </div>

      {summary.suppression.length ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Suppressed</p>
          <ul className="space-y-1 text-sm text-slate-200">
            {summary.suppression.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
