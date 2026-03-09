"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ConfidenceLevel = "High" | "Moderate" | "Low";

type CareerGravityInsight = {
  summary: string;
  primaryRoleFamily: string;
  secondaryRoleFamily: string | null;
  seniorityTrend: string | null;
  confidence: ConfidenceLevel;
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

function buildFallbackConfidence(totalAnalyses: number, averageScore: number): ConfidenceLevel {
  if (totalAnalyses >= 5 && averageScore >= 80) return "High";
  if (totalAnalyses >= 3) return "Moderate";
  return "Low";
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
  const confidence =
    gravity.careerGravity?.confidence ??
    buildFallbackConfidence(totalAnalyses, history.alignmentPattern.averageScore);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
          Visible after 3 analyses
        </p>
        <h3 className="text-lg font-semibold text-neutral-900">Career Insight Emerging</h3>
      </header>

      <p className="mt-3 text-sm text-neutral-700">{summary}</p>

      <p className="mt-4 text-sm text-neutral-600">
        Pattern Confidence: <span className="font-semibold text-neutral-900">{confidence}</span>
      </p>

      {recurringPaths.length ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-semibold text-neutral-900">Recurring alignment paths</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {recurringPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        <h4 className="text-sm font-semibold text-neutral-900">Explore More Roles In This Path</h4>
        <p className="text-sm text-neutral-600">
          Run additional analyses to sharpen this pattern and compare adjacent role paths.
        </p>
        {recurringPaths.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {recurringPaths.map((path) => (
              <Link
                key={`path-${path}`}
                href={`/analyze?roleHint=${encodeURIComponent(path)}`}
                className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900"
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
