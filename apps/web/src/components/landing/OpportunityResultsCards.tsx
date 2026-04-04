import { opportunities, signals } from "@/src/data/opportunityPreview";

type OpportunityResultsCardsProps = {
  revealed: boolean;
};

function OpportunityList({
  title,
  entries,
  toneClassName,
}: {
  title: string;
  entries: { industry: string; score: number }[];
  toneClassName: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{title}</h4>
      <div className="mt-3 space-y-2">
        {entries.map((entry) => (
          <div key={entry.industry} className="flex items-center justify-between text-sm">
            <span className="text-slate-200">{entry.industry}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClassName}`}>
              {entry.score}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

export function OpportunityResultsCards({ revealed }: OpportunityResultsCardsProps) {
  return (
    <div
      className={`grid gap-4 transition-all duration-500 sm:grid-cols-2 ${
        revealed ? "opacity-100 translate-y-0" : "pointer-events-none opacity-30 translate-y-1"
      }`}
    >
      <article className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 sm:col-span-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Signals Detected</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {signals.map((signal) => (
            <span
              key={signal}
              className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200"
            >
              {signal}
            </span>
          ))}
        </div>
      </article>

      <OpportunityList
        title="Strong Opportunity Zones"
        entries={opportunities.strong}
        toneClassName="bg-emerald-500/20 text-emerald-200"
      />
      <OpportunityList
        title="Emerging Opportunities"
        entries={opportunities.emerging}
        toneClassName="bg-amber-500/20 text-amber-200"
      />
      <article className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 sm:col-span-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Lower Alignment</h4>
        <div className="mt-3 space-y-2">
          {opportunities.low.map((entry) => (
            <div key={entry.industry} className="flex items-center justify-between text-sm">
              <span className="text-slate-200">{entry.industry}</span>
              <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200">
                {entry.score}
              </span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
