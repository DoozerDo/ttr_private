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

export function CareerAlignmentProgress() {
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

        const payload = (await response.json()) as AlignmentHistoryResponse;
        if (!cancelled) {
          setHistory(payload ?? EMPTY_HISTORY);
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
      [...history.recentAnalyses].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [history.recentAnalyses],
  );

  if (loading) {
    return (
      <section className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/30 p-5">
        <h3 className="text-lg font-semibold text-slate-100">Career Alignment Progress</h3>
        <p className="text-sm text-slate-400">Preparing compatibility report…</p>
      </section>
    );
  }

  if (sortedRecentAnalyses.length < 2) {
    return (
      <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/30 p-5">
        <h3 className="text-lg font-semibold text-slate-100">Career Alignment Progress</h3>
        <p className="text-sm text-slate-400">
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

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/30 p-5">
      <header className="space-y-1">
        <h3 className="text-lg font-semibold text-slate-100">Career Alignment Progress</h3>
        <p className="text-sm text-slate-400">
          Insights derived from your recent role compatibility analyses.
        </p>
      </header>

      <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <h4 className="text-base font-semibold text-slate-100">Recent Analyses</h4>
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

      <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <h4 className="text-base font-semibold text-slate-100">Strongest Alignment Pattern</h4>
        <p className="text-sm text-slate-300">
          Your strongest compatibility appears in these role paths.
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

      {history.badges.length ? (
        <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <h4 className="text-base font-semibold text-slate-100">Achievement Badges</h4>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {history.badges.map((badge) => (
              <div key={badge.id} className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <p className="text-sm font-semibold text-slate-100">{badge.title}</p>
                <p className="mt-1 text-sm text-slate-300">{badge.description}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
