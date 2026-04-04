"use client";

import { useCallback, useEffect, useState } from "react";

type ErrorHealthStatus = "New" | "Active" | "Quiet" | "Regressed";

type ErrorHealthItem = {
  fingerprint: string;
  summary: string;
  sourceType: "runtime" | "promise" | "api";
  areaOrRoute: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  releaseId: string | null;
  escalated: boolean;
  issueNumber: number | null;
  issueUrl: string | null;
  statusHint: ErrorHealthStatus;
};

type ErrorHealthResponse = {
  items: ErrorHealthItem[];
};

type CriticalFlowStatus = "Healthy" | "Degraded" | "Critical";
type CriticalFlowItem = {
  flowName: "score_generated" | "resume_generated" | "baseline_parsed";
  successRatePct: number;
  totalAttempts: number;
  totalFailures: number;
  thresholdPct: number;
  status: CriticalFlowStatus;
  lastEventAt: string | null;
  escalated: boolean;
  issueNumber: number | null;
  issueUrl: string | null;
};
type CriticalFlowHealthResponse = {
  items: CriticalFlowItem[];
};

const statusTone: Record<ErrorHealthStatus, string> = {
  New: "text-sky-200 bg-sky-500/20 border-sky-400/40",
  Active: "text-amber-200 bg-amber-500/20 border-amber-400/40",
  Quiet: "text-slate-300 bg-slate-700/40 border-slate-500/30",
  Regressed: "text-rose-100 bg-rose-500/25 border-rose-400/40",
};
const flowStatusTone: Record<CriticalFlowStatus, string> = {
  Healthy: "text-emerald-100 bg-emerald-500/20 border-emerald-400/40",
  Degraded: "text-amber-100 bg-amber-500/20 border-amber-400/40",
  Critical: "text-rose-100 bg-rose-500/25 border-rose-400/40",
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export default function ErrorHealthPage() {
  const [items, setItems] = useState<ErrorHealthItem[]>([]);
  const [flowItems, setFlowItems] = useState<CriticalFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/support/error-health?limit=100", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to load error health right now.");
      }
      const payload = (await response.json()) as ErrorHealthResponse;
      setItems(payload.items ?? []);
      const flowResponse = await fetch("/api/support/critical-flow-health", {
        credentials: "include",
        cache: "no-store",
      });
      if (!flowResponse.ok) {
        throw new Error("Unable to load critical flow health right now.");
      }
      const flowPayload = (await flowResponse.json()) as CriticalFlowHealthResponse;
      setFlowItems(flowPayload.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load error health right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Support tools</p>
        <h1 className="text-3xl font-semibold text-white">Error Health</h1>
        <p className="text-sm text-slate-300">
          Recent auto-captured error fingerprints, activity, and regression hints for triage.
        </p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
          Loading error health...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          <p>{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:border-white/40"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
          No auto-captured error fingerprints in the current runtime window.
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Fingerprint</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Area/Route</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">First Seen</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3">Release</th>
                <th className="px-4 py-3">Escalated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {items.map((item) => (
                <tr key={item.fingerprint}>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone[item.statusHint]}`}>
                      {item.statusHint}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{item.fingerprint}</td>
                  <td className="max-w-[22rem] px-4 py-3 text-slate-100">{item.summary}</td>
                  <td className="px-4 py-3 uppercase text-xs text-slate-300">{item.sourceType}</td>
                  <td className="px-4 py-3 text-slate-300">{item.areaOrRoute ?? "Unknown"}</td>
                  <td className="px-4 py-3 font-semibold text-slate-100">{item.count}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDate(item.firstSeenAt)}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDate(item.lastSeenAt)}</td>
                  <td className="px-4 py-3 text-slate-300">{item.releaseId ?? "n/a"}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {item.escalated ? (
                      item.issueUrl && item.issueNumber ? (
                        <a
                          href={item.issueUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-300 hover:text-emerald-200"
                        >
                          Yes (#{item.issueNumber})
                        </a>
                      ) : (
                        `Yes${item.issueNumber ? ` (#${item.issueNumber})` : ""}`
                      )
                    ) : (
                      "No"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Critical Flow Health</h2>
          {flowItems.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
              No critical flow events in the current runtime window.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-slate-900/80 text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Flow</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Success Rate</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Failures</th>
                    <th className="px-4 py-3">Threshold</th>
                    <th className="px-4 py-3">Last Event</th>
                    <th className="px-4 py-3">Escalated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {flowItems.map((item) => (
                    <tr key={item.flowName}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{item.flowName}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${flowStatusTone[item.status]}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{item.successRatePct}%</td>
                      <td className="px-4 py-3">{item.totalAttempts}</td>
                      <td className="px-4 py-3">{item.totalFailures}</td>
                      <td className="px-4 py-3">{item.thresholdPct}% failure</td>
                      <td className="px-4 py-3">{item.lastEventAt ? formatDate(item.lastEventAt) : "n/a"}</td>
                      <td className="px-4 py-3">
                        {item.escalated ? (
                          item.issueUrl && item.issueNumber ? (
                            <a
                              href={item.issueUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-rose-300 hover:text-rose-200"
                            >
                              Yes (#{item.issueNumber})
                            </a>
                          ) : (
                            "Yes"
                          )
                        ) : (
                          "No"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
