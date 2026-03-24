"use client";

import { useEffect, useMemo, useState } from "react";

type FeedbackSeverity = "low" | "medium" | "high" | "critical";
type FeedbackStatus = "new" | "reviewed" | "planned" | "resolved" | "closed";
type FrictionStatus = "open" | "reviewed" | "resolved" | "ignored";

type FeedbackItem = {
  id: string;
  userId: string;
  category: string;
  title: string;
  message: string;
  pageContext: string | null;
  createdAt: string;
  triageStatus: FeedbackStatus;
  severity: FeedbackSeverity;
  adminNotes: string | null;
  requiresFounderFollowup: boolean;
};

type FrictionEvent = {
  id: string;
  userId: string;
  eventType: string;
  reason: string;
  createdAt: string;
  resolutionStatus: FrictionStatus;
  severity: FeedbackSeverity;
  recovered: boolean;
  recoveryAction: string | null;
  adminNotes: string | null;
  requiresFounderFollowup: boolean;
};

type Pattern = {
  patternKey: string;
  label: string;
  count: number;
  affectedUsers: number;
  latestSeenAt: string;
  severityMix: Record<string, number>;
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export default function BetaFrictionDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [events, setEvents] = useState<FrictionEvent[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [categoryOrEventFilter, setCategoryOrEventFilter] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const feedbackParams = new URLSearchParams();
      const frictionParams = new URLSearchParams();
      if (unresolvedOnly) {
        feedbackParams.set("unresolvedOnly", "true");
        frictionParams.set("unresolvedOnly", "true");
      }
      if (severityFilter) {
        feedbackParams.set("severity", severityFilter);
        frictionParams.set("severity", severityFilter);
      }
      if (pageFilter) feedbackParams.set("pageContext", pageFilter);
      if (statusFilter) {
        feedbackParams.set("triageStatus", statusFilter);
        frictionParams.set("resolutionStatus", statusFilter);
      }
      if (categoryOrEventFilter) {
        feedbackParams.set("category", categoryOrEventFilter);
        frictionParams.set("eventType", categoryOrEventFilter);
      }
      const [feedbackRes, eventsRes, patternsRes] = await Promise.all([
        fetch(`/api/admin/feedback?${feedbackParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/admin/friction-events?${frictionParams.toString()}`, { cache: "no-store" }),
        fetch("/api/admin/friction-patterns", { cache: "no-store" }),
      ]);
      if (feedbackRes.status === 403 || eventsRes.status === 403 || patternsRes.status === 403) {
        throw new Error("Admin access required");
      }
      if (!feedbackRes.ok || !eventsRes.ok || !patternsRes.ok) {
        throw new Error("Unable to load friction dashboard");
      }
      const [feedbackPayload, eventsPayload, patternsPayload] = await Promise.all([
        feedbackRes.json(),
        eventsRes.json(),
        patternsRes.json(),
      ]);
      setFeedback(Array.isArray(feedbackPayload) ? feedbackPayload : []);
      setEvents(Array.isArray(eventsPayload) ? eventsPayload : []);
      setPatterns(Array.isArray(patternsPayload) ? patternsPayload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, severityFilter, categoryOrEventFilter, pageFilter, unresolvedOnly]);

  const summary = useMemo(() => {
    const newFeedback = feedback.filter((item) => item.triageStatus === "new").length;
    const openEvents = events.filter((item) => item.resolutionStatus === "open").length;
    const highSeverity = feedback.filter((item) => item.severity === "high" || item.severity === "critical").length
      + events.filter((item) => item.severity === "high" || item.severity === "critical").length;
    const recovered = events.filter((item) => item.recovered).length;
    const topPattern = patterns[0]?.label ?? "n/a";
    return { newFeedback, openEvents, highSeverity, recovered, topPattern };
  }, [feedback, events, patterns]);

  const runDetection = async () => {
    setError(null);
    const response = await fetch("/api/admin/friction-events/run-detection", { method: "POST" });
    if (!response.ok) {
      setError("Failed to run friction detection");
      return;
    }
    await load();
  };

  const updateFeedback = async (
    id: string,
    patch: Partial<Pick<FeedbackItem, "triageStatus" | "severity" | "requiresFounderFollowup">>,
  ) => {
    await fetch(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  };

  const updateFriction = async (
    id: string,
    patch: Partial<Pick<FrictionEvent, "resolutionStatus" | "severity" | "requiresFounderFollowup">>,
  ) => {
    await fetch(`/api/admin/friction-events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Founder Ops</p>
        <h1 className="text-3xl font-semibold text-slate-50">Beta Friction Dashboard</h1>
        <p className="text-sm text-slate-300">
          Structured feedback plus deterministic friction signals for beta triage.
        </p>
        <button
          type="button"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:border-slate-500"
          onClick={() => void runDetection()}
        >
          Run Friction Detection
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">New feedback</p><p className="text-2xl text-white">{summary.newFeedback}</p></div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">Open friction events</p><p className="text-2xl text-white">{summary.openEvents}</p></div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">High severity</p><p className="text-2xl text-white">{summary.highSeverity}</p></div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">Recovered users</p><p className="text-2xl text-white">{summary.recovered}</p></div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">Top pattern</p><p className="text-sm text-white">{summary.topPattern}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <label>Status <input className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} /></label>
        <label>Severity <input className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} /></label>
        <label>Category / Event <input className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1" value={categoryOrEventFilter} onChange={(event) => setCategoryOrEventFilter(event.target.value)} /></label>
        <label>Page context <input className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1" value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} /></label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} />
          only unresolved
        </label>
      </div>

      {loading ? <p className="text-sm text-slate-300">Loading friction intelligence...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">Friction Patterns</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr><th className="px-2 py-2">Pattern</th><th className="px-2 py-2">Count</th><th className="px-2 py-2">Affected users</th><th className="px-2 py-2">Latest seen</th><th className="px-2 py-2">Severity mix</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {patterns.map((item) => (
                    <tr key={item.patternKey}>
                      <td className="px-2 py-2">{item.label}</td>
                      <td className="px-2 py-2">{item.count}</td>
                      <td className="px-2 py-2">{item.affectedUsers}</td>
                      <td className="px-2 py-2">{formatDate(item.latestSeenAt)}</td>
                      <td className="px-2 py-2">{Object.entries(item.severityMix).map(([k, v]) => `${k}:${v}`).join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">Raw Feedback</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr><th className="px-2 py-2">User</th><th className="px-2 py-2">Category</th><th className="px-2 py-2">Title</th><th className="px-2 py-2">Page</th><th className="px-2 py-2">Created</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Severity</th><th className="px-2 py-2">Follow-up</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {feedback.map((item) => (
                    <tr key={item.id}>
                      <td className="px-2 py-2">{item.userId}</td>
                      <td className="px-2 py-2">{toLabel(item.category)}</td>
                      <td className="px-2 py-2">{item.title}</td>
                      <td className="px-2 py-2">{item.pageContext ?? "-"}</td>
                      <td className="px-2 py-2">{formatDate(item.createdAt)}</td>
                      <td className="px-2 py-2">
                        <select
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          value={item.triageStatus}
                          onChange={(event) => void updateFeedback(item.id, { triageStatus: event.target.value as FeedbackStatus })}
                        >
                          <option value="new">new</option><option value="reviewed">reviewed</option><option value="planned">planned</option><option value="resolved">resolved</option><option value="closed">closed</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          value={item.severity}
                          onChange={(event) => void updateFeedback(item.id, { severity: event.target.value as FeedbackSeverity })}
                        >
                          <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={item.requiresFounderFollowup}
                          onChange={(event) => void updateFeedback(item.id, { requiresFounderFollowup: event.target.checked })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">Friction Events</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr><th className="px-2 py-2">User</th><th className="px-2 py-2">Event type</th><th className="px-2 py-2">Reason</th><th className="px-2 py-2">Created</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Recovered</th><th className="px-2 py-2">Follow-up</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {events.map((item) => (
                    <tr key={item.id}>
                      <td className="px-2 py-2">{item.userId}</td>
                      <td className="px-2 py-2">{toLabel(item.eventType)}</td>
                      <td className="px-2 py-2">{item.reason}</td>
                      <td className="px-2 py-2">{formatDate(item.createdAt)}</td>
                      <td className="px-2 py-2">
                        <select
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          value={item.resolutionStatus}
                          onChange={(event) => void updateFriction(item.id, { resolutionStatus: event.target.value as FrictionStatus })}
                        >
                          <option value="open">open</option><option value="reviewed">reviewed</option><option value="resolved">resolved</option><option value="ignored">ignored</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">{item.recovered ? toLabel(item.recoveryAction ?? "yes") : "no"}</td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={item.requiresFounderFollowup}
                          onChange={(event) => void updateFriction(item.id, { requiresFounderFollowup: event.target.checked })}
                        />
                      </td>
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

