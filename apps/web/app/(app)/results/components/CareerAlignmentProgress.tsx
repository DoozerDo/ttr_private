"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RecentAnalysis = {
  analysisId: string;
  jobTitle: string;
  company: string;
  score: number;
  classification: string;
  createdAt: string;
};

type AlignmentPattern = {
  strongestAlignmentRoles: string[];
  totalAnalyses: number;
  averageScore: number;
};

type Badge = {
  id: string;
  title: string;
  description: string;
};

type AlignmentHistoryResponse = {
  recentAnalyses: RecentAnalysis[];
  alignmentPattern: AlignmentPattern;
  badges: Badge[];
};

const EMPTY_HISTORY: AlignmentHistoryResponse = {
  recentAnalyses: [],
  alignmentPattern: {
    strongestAlignmentRoles: [],
    totalAnalyses: 0,
    averageScore: 0,
  },
  badges: [],
};

function normalizeHistory(payload: Partial<AlignmentHistoryResponse> | null | undefined): AlignmentHistoryResponse {
  return {
    recentAnalyses: Array.isArray(payload?.recentAnalyses) ? payload!.recentAnalyses : [],
    alignmentPattern: {
      strongestAlignmentRoles: Array.isArray(payload?.alignmentPattern?.strongestAlignmentRoles)
        ? payload!.alignmentPattern!.strongestAlignmentRoles
        : [],
      totalAnalyses:
        typeof payload?.alignmentPattern?.totalAnalyses === "number"
          ? payload!.alignmentPattern!.totalAnalyses
          : 0,
      averageScore:
        typeof payload?.alignmentPattern?.averageScore === "number"
          ? payload!.alignmentPattern!.averageScore
          : 0,
    },
    badges: Array.isArray(payload?.badges) ? payload!.badges : [],
  };
}

type CareerAlignmentProgressProps = {
  showProgressSection?: boolean;
  showBadgesSection?: boolean;
};

export function CareerAlignmentProgress({
  showProgressSection = true,
  showBadgesSection = true,
}: CareerAlignmentProgressProps) {
  const [history, setHistory] = useState<AlignmentHistoryResponse>(EMPTY_HISTORY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/analysis/history", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) {
            setHistory(EMPTY_HISTORY);
          }
          return;
        }

        const payload = (await response.json()) as Partial<AlignmentHistoryResponse>;
        if (!cancelled) {
          setHistory(normalizeHistory(payload));
        }
      } catch {
        if (!cancelled) {
          setHistory(EMPTY_HISTORY);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedRecentAnalyses = useMemo(
    () =>
      [...(Array.isArray(history.recentAnalyses) ? history.recentAnalyses : [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [history.recentAnalyses],
  );

  if (loading) {
    return (
      <section className="space-y-2 rounded-[24px] border border-white/10 bg-slate-900/30 p-5">
        <h3 className="text-lg font-semibold text-slate-100">
          {showProgressSection ? "Analysis Momentum" : "Signals Worth Keeping"}
        </h3>
        <p className="text-sm text-slate-400">Preparing compatibility report…</p>
      </section>
    );
  }

  if (showProgressSection && sortedRecentAnalyses.length < 2) {
    return (
      <section className="space-y-3 rounded-[24px] border border-white/10 bg-slate-900/30 p-5">
        <h3 className="text-lg font-semibold text-slate-100">Analysis Momentum</h3>
        <p className="text-sm leading-6 text-slate-400">
          Run additional role analyses to begin identifying alignment patterns in your career.
        </p>
        <Link
          href="#analyze-another-role"
          className="inline-flex rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
        >
          Analyze Another Role
        </Link>
      </section>
    );
  }

  if (!showProgressSection && (!history.badges.length || !showBadgesSection)) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-white/10 bg-slate-900/30 p-5">
      {showProgressSection ? (
        <>
          <header className="space-y-2 border-b border-white/10 pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Progress and History
            </p>
            <h3 className="text-2xl font-semibold tracking-tight text-slate-100">Analysis Momentum</h3>
            <p className="text-sm leading-6 text-slate-400">
              See how recent score history is shaping your strongest profile patterns.
            </p>
          </header>

          <article className="space-y-3 rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
            <h4 className="text-base font-semibold text-slate-100">Recent score history</h4>
            <ul className="space-y-3">
              {sortedRecentAnalyses.map((analysis) => (
                <li key={analysis.analysisId} className="space-y-1">
                  <p className="text-sm font-semibold text-slate-100">{analysis.jobTitle}</p>
                  <p className="text-sm text-slate-300">
                    {analysis.score.toFixed(1)} | {analysis.classification}
                  </p>
                  {analysis.company ? <p className="text-xs text-slate-400">{analysis.company}</p> : null}
                </li>
              ))}
            </ul>
          </article>

          <article className="space-y-3 rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
            <h4 className="text-base font-semibold text-slate-100">Strongest recurring path</h4>
            <p className="text-sm leading-6 text-slate-300">
              Your strongest recent compatibility appears in these adjacent role directions.
            </p>
            {history.alignmentPattern.strongestAlignmentRoles.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                {history.alignmentPattern.strongestAlignmentRoles.map((role) => (
                  <li key={role}>{role}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">
                Run additional analyses to strengthen pattern confidence.
              </p>
            )}
            <p className="text-xs text-slate-400">
              This insight is derived from your recent role compatibility analyses.
            </p>
          </article>
        </>
      ) : null}

      {showBadgesSection && history.badges.length ? (
        <article className="space-y-3 rounded-[24px] border border-white/10 bg-slate-950/40 p-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Quiet reinforcement
            </p>
            <h4 className="text-lg font-semibold text-slate-100">Signals worth keeping in view</h4>
          </div>
          <div className="grid gap-3">
            {history.badges.map((badge) => (
              <div key={badge.id} className="rounded-[18px] border border-white/10 bg-slate-900/35 p-4">
                <p className="text-sm font-semibold text-slate-100">{badge.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{badge.description}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
