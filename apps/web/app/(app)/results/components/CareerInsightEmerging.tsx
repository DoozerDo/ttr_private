"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CareerGravityInsight = {
  summary: string;
  primaryRoleFamily: string;
  secondaryRoleFamily: string | null;
  seniorityTrend: string | null;
  signalStrength: string;
  supportingSignals: string[];
};

type CareerGravityResponse = {
  careerGravity: CareerGravityInsight | null;
};

type AlignmentPattern = {
  strongestAlignmentRoles: string[];
  totalAnalyses: number;
  averageScore: number;
};

type AlignmentHistoryResponse = {
  alignmentPattern: AlignmentPattern;
  recentAnalyses: Array<{
    analysisId: string;
  }>;
};

const EMPTY_HISTORY: AlignmentHistoryResponse = {
  alignmentPattern: {
    strongestAlignmentRoles: [],
    totalAnalyses: 0,
    averageScore: 0,
  },
  recentAnalyses: [],
};

const EMPTY_GRAVITY: CareerGravityResponse = {
  careerGravity: null,
};

function buildFallbackSummary(paths: string[]): string {
  if (!paths.length) {
    return "Your recent analyses are beginning to show recurring alignment patterns.";
  }
  if (paths.length === 1) {
    return `Your strongest compatibility is beginning to cluster around ${paths[0]} roles.`;
  }
  return `Your recent analyses show recurring fit across ${paths[0]} and ${paths[1]} role paths.`;
}

function buildFallbackSignalStrength(totalAnalyses: number, averageScore: number): string {
  if (totalAnalyses >= 5 && averageScore >= 80) return "Strong";
  if (totalAnalyses >= 3) return "Moderate";
  return "Emerging";
}

export function CareerInsightEmerging() {
  const [history, setHistory] = useState<AlignmentHistoryResponse>(EMPTY_HISTORY);
  const [gravity, setGravity] = useState<CareerGravityResponse>(EMPTY_GRAVITY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [historyResponse, gravityResponse] = await Promise.all([
          fetch("/api/analysis/history", { method: "GET", cache: "no-store" }),
          fetch("/api/analysis/career-gravity", { method: "GET", cache: "no-store" }),
        ]);

        const historyPayload = historyResponse.ok
          ? ((await historyResponse.json()) as AlignmentHistoryResponse)
          : EMPTY_HISTORY;
        const gravityPayload = gravityResponse.ok
          ? ((await gravityResponse.json()) as CareerGravityResponse)
          : EMPTY_GRAVITY;

        if (!cancelled) {
          setHistory(historyPayload ?? EMPTY_HISTORY);
          setGravity(gravityPayload ?? EMPTY_GRAVITY);
        }
      } catch {
        if (!cancelled) {
          setHistory(EMPTY_HISTORY);
          setGravity(EMPTY_GRAVITY);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalAnalyses = history.alignmentPattern.totalAnalyses || history.recentAnalyses.length;
  const recurringPaths = useMemo(() => {
    const ordered = [
      gravity.careerGravity?.primaryRoleFamily ?? null,
      gravity.careerGravity?.secondaryRoleFamily ?? null,
      ...history.alignmentPattern.strongestAlignmentRoles,
    ].filter((path): path is string => typeof path === "string" && path.trim().length > 0);

    return Array.from(new Set(ordered)).slice(0, 3);
  }, [
    gravity.careerGravity?.primaryRoleFamily,
    gravity.careerGravity?.secondaryRoleFamily,
    history.alignmentPattern.strongestAlignmentRoles,
  ]);

  if (loading || totalAnalyses < 3) {
    return null;
  }

  const summary =
    gravity.careerGravity?.summary?.trim() || buildFallbackSummary(recurringPaths);
  const signalStrength =
    gravity.careerGravity?.signalStrength ??
    buildFallbackSignalStrength(totalAnalyses, history.alignmentPattern.averageScore);

  return (
    <section className="rounded-[24px] border border-white/10 bg-slate-900/40 p-5">
      <header className="space-y-2 border-b border-white/10 pb-4">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
          Emerging Insight
        </p>
        <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
          Pattern taking shape
        </h3>
      </header>

      <p className="mt-3 text-sm leading-6 text-slate-300">{summary}</p>

      <p className="mt-4 text-sm text-slate-400">
        Signal strength: <span className="font-semibold text-slate-100">{signalStrength}</span>
      </p>

      {recurringPaths.length ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-semibold text-slate-100">Recurring alignment paths</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            {recurringPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        <h4 className="text-sm font-semibold text-slate-100">Explore More Roles In This Path</h4>
        <p className="text-sm text-slate-400">
          Run additional analyses to sharpen this pattern and compare adjacent role paths.
        </p>
        {recurringPaths.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {recurringPaths.map((path) => (
              <Link
                key={`path-${path}`}
                href={`/analyze?roleHint=${encodeURIComponent(path)}`}
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
              >
                {path}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
