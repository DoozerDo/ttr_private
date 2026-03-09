"use client";

import { useEffect, useState } from "react";

type ImprovementOpportunity = {
  categoryKey: string;
  categoryLabel: string;
  currentSignal: string;
  roleExpectation: string;
  estimatedScore: number;
  delta: number;
  explanation: string;
};

type FitImprovementResponse = {
  improvementOpportunities: ImprovementOpportunity[];
};

type FitImprovementOpportunitiesProps = {
  assessmentId: string | null;
};

export function FitImprovementOpportunities({ assessmentId }: FitImprovementOpportunitiesProps) {
  const [loading, setLoading] = useState(false);
  const [opportunities, setOpportunities] = useState<ImprovementOpportunity[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!assessmentId) {
      setOpportunities([]);
      setLoading(false);
      return;
    }

    const loadSimulation = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}/simulation`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        if (!response.ok) {
          if (!cancelled) setOpportunities([]);
          return;
        }

        const payload = (await response.json()) as FitImprovementResponse;
        if (!cancelled) {
          setOpportunities((payload.improvementOpportunities ?? []).slice(0, 3));
        }
      } catch {
        if (!cancelled) setOpportunities([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSimulation();

    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  if (loading || opportunities.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/30 p-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-slate-100">Fit Improvement Opportunities</h3>
        <p className="text-sm text-slate-400">
          These estimates show how additional verified baseline signals could improve compatibility for this role.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {opportunities.map((opportunity) => (
          <article
            key={`${opportunity.categoryKey}-${opportunity.categoryLabel}`}
            className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4"
          >
            <p className="text-sm font-semibold text-slate-100">{opportunity.categoryLabel}</p>

            <div className="space-y-1 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current signal</p>
              <p>{opportunity.currentSignal}</p>
            </div>

            <div className="space-y-1 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Role expectation</p>
              <p>{opportunity.roleExpectation}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Estimated score</p>
                <p className="text-base font-semibold">{opportunity.estimatedScore.toFixed(1)}</p>
              </div>
              <div className="space-y-1 text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Potential improvement</p>
                <p className="text-base font-semibold">+{opportunity.delta.toFixed(1)}</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">{opportunity.explanation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
