"use client";

import { useEffect, useState } from "react";

type FunnelStepName =
  | "user_created"
  | "baseline_started"
  | "baseline_completed"
  | "first_analysis_completed"
  | "low_score_detected"
  | "baseline_updated_after_low_score"
  | "reanalysis_completed"
  | "high_score_achieved"
  | "opportunity_created"
  | "documents_generated";

type FunnelMetricsResponse = {
  funnel: {
    totalUsers: number;
    stepCounts: Record<FunnelStepName, number>;
    conversionRates: Record<string, number>;
    dropOffRates: Record<FunnelStepName, number>;
  };
  time: Record<string, number>;
  recovery: Record<string, number>;
};

type SegmentResponse = {
  scoreBucket: Record<string, number>;
  baselineCompletenessAtFirstAnalysis: Record<string, number>;
  analysisCount: Record<string, number>;
};

type FunnelUser = {
  userId: string;
  email: string;
  currentStep: FunnelStepName;
  lastActivityAt: string | null;
  mostRecentScore: number | null;
  analysisCount: number;
};

const STEPS: FunnelStepName[] = [
  "user_created",
  "baseline_started",
  "baseline_completed",
  "first_analysis_completed",
  "low_score_detected",
  "baseline_updated_after_low_score",
  "reanalysis_completed",
  "high_score_achieved",
  "opportunity_created",
  "documents_generated",
];

function toLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function FunnelDiagnosticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FunnelMetricsResponse | null>(null);
  const [segments, setSegments] = useState<SegmentResponse | null>(null);
  const [users, setUsers] = useState<FunnelUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [metricsRes, usersRes, segmentsRes] = await Promise.all([
          fetch("/api/admin/funnel-metrics", { cache: "no-store" }),
          fetch("/api/admin/funnel-users", { cache: "no-store" }),
          fetch("/api/admin/funnel-segments", { cache: "no-store" }),
        ]);
        if (metricsRes.status === 403 || usersRes.status === 403 || segmentsRes.status === 403) {
          throw new Error("Admin access required");
        }
        if (!metricsRes.ok || !usersRes.ok || !segmentsRes.ok) {
          throw new Error("Unable to load funnel diagnostics");
        }
        const [metricsPayload, usersPayload, segmentPayload] = await Promise.all([
          metricsRes.json(),
          usersRes.json(),
          segmentsRes.json(),
        ]);
        if (!cancelled) {
          setMetrics(metricsPayload);
          setUsers(Array.isArray(usersPayload) ? usersPayload : []);
          setSegments(segmentPayload);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Founder Ops</p>
        <h1 className="text-3xl font-semibold text-slate-50">Funnel Diagnostics Dashboard</h1>
        <p className="text-sm text-slate-300">
          Deterministic visibility into progression, drop-offs, recovery, and time-to-progress.
        </p>
      </header>

      {loading ? <p className="text-sm text-slate-300">Loading funnel diagnostics...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && !error && metrics ? (
        <>
          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">Funnel</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr><th className="px-2 py-2">Step</th><th className="px-2 py-2">Users</th><th className="px-2 py-2">Conversion %</th><th className="px-2 py-2">Drop-off %</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {STEPS.map((step) => (
                    <tr key={step}>
                      <td className="px-2 py-2">{toLabel(step)}</td>
                      <td className="px-2 py-2">{metrics.funnel.stepCounts[step] ?? 0}</td>
                      <td className="px-2 py-2">
                        {step === "baseline_started" ? metrics.funnel.conversionRates.baseline_started_to_completed :
                          step === "baseline_completed" ? metrics.funnel.conversionRates.completed_to_first_analysis :
                          step === "first_analysis_completed" ? metrics.funnel.conversionRates.analysis_to_high_score :
                          step === "high_score_achieved" ? metrics.funnel.conversionRates.high_score_to_opportunity :
                          step === "opportunity_created" ? metrics.funnel.conversionRates.opportunity_to_documents : 0}%
                      </td>
                      <td className="px-2 py-2">{metrics.funnel.dropOffRates[step] ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Time Metrics (hours)</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {Object.entries(metrics.time).map(([key, value]) => (
                  <li key={key}>{toLabel(key)}: {value}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Recovery Metrics</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {Object.entries(metrics.recovery).map(([key, value]) => (
                  <li key={key}>{toLabel(key)}: {value}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">Segments</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-3 text-sm text-slate-200">
              <div>
                <p className="font-semibold text-white">Score bands</p>
                {Object.entries(segments?.scoreBucket ?? {}).map(([k, v]) => <p key={k}>{toLabel(k)}: {v}</p>)}
              </div>
              <div>
                <p className="font-semibold text-white">Baseline completeness at first analysis</p>
                {Object.entries(segments?.baselineCompletenessAtFirstAnalysis ?? {}).map(([k, v]) => <p key={k}>{toLabel(k)}: {v}</p>)}
              </div>
              <div>
                <p className="font-semibold text-white">Analysis count</p>
                {Object.entries(segments?.analysisCount ?? {}).map(([k, v]) => <p key={k}>{toLabel(k)}: {v}</p>)}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">User Drill-down</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr><th className="px-2 py-2">User</th><th className="px-2 py-2">Current step</th><th className="px-2 py-2">Last activity</th><th className="px-2 py-2">Score</th><th className="px-2 py-2">Analyses</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map((user) => (
                    <tr key={user.userId}>
                      <td className="px-2 py-2">{user.email}</td>
                      <td className="px-2 py-2">{toLabel(user.currentStep)}</td>
                      <td className="px-2 py-2">{formatDate(user.lastActivityAt)}</td>
                      <td className="px-2 py-2">{user.mostRecentScore ?? "-"}</td>
                      <td className="px-2 py-2">{user.analysisCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

