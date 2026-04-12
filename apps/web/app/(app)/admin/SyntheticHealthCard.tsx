"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SyntheticHealthRollup = {
  status: "all_passing" | "failing" | "stale" | "unknown";
  statusLabel: string;
  failingSuites: number;
  failingSuiteNames: string[];
  staleSuites: number;
  staleSuiteNames: string[];
  latestRunAt: string | null;
  latestRunAgeMinutes: number | null;
  lastSuccessfulPublishAt: string | null;
  lastAttemptedPublishAt: string | null;
  recencyLabel: string;
  staleThresholdMinutes: number;
};

type SyntheticHealthPayload = {
  generatedAt: string;
  healthRollup: SyntheticHealthRollup;
  suiteCount: number;
  suites: Array<{
    suiteName: string;
  }>;
};

function tone(status: SyntheticHealthRollup["status"]): string {
  switch (status) {
    case "all_passing":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "failing":
      return "border-rose-400/20 bg-rose-500/10 text-rose-100";
    case "stale":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    default:
      return "border-slate-500/20 bg-slate-500/10 text-slate-100";
  }
}

function minutesAgo(generatedAt: string, timestamp: string | null): string | null {
  if (!timestamp) return null;
  const referenceMs = new Date(generatedAt).getTime();
  const targetMs = new Date(timestamp).getTime();
  if (!Number.isFinite(referenceMs) || !Number.isFinite(targetMs)) {
    return null;
  }
  const diff = Math.max(0, Math.floor((referenceMs - targetMs) / 60000));
  if (diff < 1) return "just now";
  if (diff === 1) return "1 min ago";
  return `${diff} min ago`;
}

export default function SyntheticHealthCard() {
  const [payload, setPayload] = useState<SyntheticHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/synthetics?limit=5", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Synthetic reliability summary is unavailable");
        }

        const data = (await response.json()) as SyntheticHealthPayload;
        if (!cancelled) {
          setPayload(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Synthetic reliability summary is unavailable");
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

  const health = payload?.healthRollup;
  const firstFailingSuite = health?.failingSuiteNames[0] ?? null;
  const firstStaleSuite = health?.staleSuiteNames[0] ?? null;
  const publishedAgo = payload && health ? minutesAgo(payload.generatedAt, health.lastSuccessfulPublishAt) : null;
  const attemptedAgo = payload && health ? minutesAgo(payload.generatedAt, health.lastAttemptedPublishAt) : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Synthetic health</p>
            <h2 className="text-xl font-semibold text-slate-50">Public synthetic reliability</h2>
          </div>
          <p className="text-sm text-slate-300">
            Live rollup of the public landing and auth synthetic transaction suite.
          </p>
        </div>
        <Link
          href="/admin/synthetics"
          className="inline-flex rounded-[var(--button-radius)] border border-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/5"
        >
          Open Synthetic Reliability
        </Link>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading synthetic health...</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

      {health ? (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className={`rounded-xl border p-4 ${tone(health.status)}`}>
            <p className="text-xs uppercase tracking-[0.2em] opacity-80">Overall status</p>
            <p className="mt-1 text-2xl font-semibold">{health.statusLabel}</p>
            <p className="mt-1 text-sm opacity-90">{health.recencyLabel}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Failing suites</p>
            <p className="mt-1 text-2xl font-semibold text-rose-50">{health.failingSuites}</p>
            <p className="mt-1 text-sm text-slate-300">
              {firstFailingSuite ? `First failing: ${firstFailingSuite}` : "No failing suites"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Stale suites</p>
            <p className="mt-1 text-2xl font-semibold text-amber-50">{health.staleSuites}</p>
            <p className="mt-1 text-sm text-slate-300">
              {firstStaleSuite ? `First stale: ${firstStaleSuite}` : "No stale suites"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Last run</p>
            <p className="mt-1 text-sm font-semibold text-slate-50">{health.recencyLabel}</p>
            <p className="mt-1 text-xs text-slate-300">
              Last published: {publishedAgo ?? "No publish yet"}
            </p>
            {attemptedAgo && attemptedAgo !== publishedAgo ? (
              <p className="mt-1 text-xs text-slate-300">Last attempt: {attemptedAgo}</p>
            ) : null}
            <p className="mt-1 text-xs text-slate-400">Threshold: {health.staleThresholdMinutes} min</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
