"use client";

import { useEffect, useState } from "react";

import { shouldSuppressCategorySuggestion } from "@/lib/evidenceSuggestions";
import { mapGapToUserGuidance, type UserGuidanceCard } from "@/lib/userGuidance";

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

type RequirementGapInsight = {
  requirement: string;
  currentSignal: string;
  roleExpectation: string;
  explanation: string;
  scope: string;
  categoryKey?: string;
  categoryLabel?: string;
  estimatedScore?: number;
  delta?: number;
};

type VisibleInsight = UserGuidanceCard;

type FitImprovementOpportunitiesProps = {
  assessmentId: string | null;
  compact?: boolean;
  fallbackInsights?: RequirementGapInsight[];
  supportingSignals?: unknown;
  baselineEvidence?: unknown;
  summary?: unknown;
};

export function FitImprovementOpportunities({
  assessmentId,
  compact = false,
  fallbackInsights = [],
  supportingSignals,
  baselineEvidence,
  summary,
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

  const filteredCategorySuggestions = opportunities.filter(
    (opportunity) =>
      !shouldSuppressCategorySuggestion({
        categoryLabel: opportunity.categoryLabel,
        supportingSignals,
        baselineEvidence,
        summary,
      }),
  );
  const visibleInsights: VisibleInsight[] =
    filteredCategorySuggestions.length > 0
      ? filteredCategorySuggestions.map((opportunity) =>
          mapGapToUserGuidance({
            requirement: opportunity.categoryLabel,
            currentSignal: opportunity.currentSignal,
            roleExpectation: opportunity.roleExpectation,
            explanation: opportunity.explanation,
            fallbackDescription: opportunity.explanation,
          }),
        )
      : fallbackInsights.map((insight) =>
          mapGapToUserGuidance({
            requirement: insight.requirement,
            currentSignal: insight.currentSignal,
            roleExpectation: insight.roleExpectation,
            explanation: insight.explanation,
            fallbackDescription: insight.explanation,
          }),
        );

  if (process.env.NODE_ENV !== "production") {
    console.info("fitImprovementOpportunitiesDebug", {
      assessmentId,
      categoryCount: opportunities.length,
      filteredCategoryCount: filteredCategorySuggestions.length,
      fallbackCount: fallbackInsights.length,
      usingFallback: filteredCategorySuggestions.length === 0,
    });
  }

  if (loading && visibleInsights.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <section className="space-y-5 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.9))] p-5 shadow-[0_16px_45px_rgba(2,6,23,0.2)]">
        <div className="space-y-2 border-b border-white/10 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Next step
          </p>
          <h3 className="text-xl font-semibold tracking-tight text-slate-100">Clarify this example</h3>
          <p className="text-sm leading-6 text-slate-300">
            Add one concrete detail and outcome so Studio can use it more confidently.
          </p>
        </div>

        <div className="space-y-3">
          {visibleInsights.slice(0, 2).map((opportunity) => (
            <article
              key={`${opportunity.title}-${opportunity.description}`}
              className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
            >
              <p className="text-sm font-semibold text-slate-100">{opportunity.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">{opportunity.description}</p>
              {opportunity.whyItMatters ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">{opportunity.whyItMatters}</p>
              ) : null}
            </article>
          ))}
        </div>

        <p className="text-sm font-medium text-slate-200">You&apos;ll address these gaps in Fit Review.</p>
      </section>
    );
  }

  return (
    <details className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
      <summary className="cursor-pointer text-sm font-semibold text-slate-200">What to strengthen</summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-400">
          These examples are grounded in your experience. Add a concrete detail and outcome so Studio can use them more confidently.
        </p>

        <div className="grid gap-3 lg:grid-cols-3">
          {visibleInsights.map((opportunity) => (
            <article
              key={`${opportunity.title}-${opportunity.description}`}
              className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4"
            >
              <p className="text-sm font-semibold text-slate-100">{opportunity.title}</p>
              <p className="text-sm text-slate-300">{opportunity.description}</p>
              {opportunity.whyItMatters ? (
                <p className="text-xs leading-5 text-slate-500">{opportunity.whyItMatters}</p>
              ) : null}
              {opportunity.examplePrompt ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
                  {opportunity.examplePrompt}
                </p>
              ) : null}
            </article>
          ))}
        </div>
        <p className="text-sm font-medium text-slate-300">You&apos;ll address these gaps in Fit Review.</p>
      </div>
    </details>
  );
}
