"use client";

import Link from "next/link";
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
  actionHref?: string;
  compact?: boolean;
};

export function FitImprovementOpportunities({
  assessmentId,
  actionHref = "/fit-review",
  compact = false,
}: FitImprovementOpportunitiesProps) {
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

  if (compact) {
    return (
      <section className="space-y-5 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.9))] p-5 shadow-[0_16px_45px_rgba(2,6,23,0.2)]">
        <div className="space-y-2 border-b border-white/10 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Want to increase your score?
          </p>
          <h3 className="text-xl font-semibold tracking-tight text-slate-100">
            Improve the evidence behind this match
          </h3>
          <p className="text-sm leading-6 text-slate-300">
            Fit Review is the secondary path. Use it to sharpen the missing proof most likely to
            lift this score.
          </p>
        </div>

        <div className="space-y-3">
          {opportunities.slice(0, 2).map((opportunity) => (
            <article
              key={`${opportunity.categoryKey}-${opportunity.categoryLabel}`}
              className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{opportunity.categoryLabel}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{opportunity.explanation}</p>
                </div>
                <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                  +{opportunity.delta.toFixed(1)}
                </div>
              </div>
            </article>
          ))}
        </div>

        <Link
          href={actionHref}
          className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/[0.04]"
        >
          Open Fit Review
        </Link>
      </section>
    );
  }

  return (
    <details className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
      <summary className="cursor-pointer text-sm font-semibold text-slate-200">
        Improve compatibility
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-400">
          These estimates show how additional verified baseline signals could improve compatibility for this role.
        </p>

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
      </div>
    </details>
  );
}
