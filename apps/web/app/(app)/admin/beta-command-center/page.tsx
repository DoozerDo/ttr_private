"use client";

import { useEffect, useMemo, useState } from "react";

type BetaUserRosterRow = {
  userId: string;
  email: string;
  accessCodeStatus: "none" | "assigned" | "redeemed" | "revoked";
  firstLoginAt: string | null;
  lastActiveAt: string | null;
  analysesRun: number;
  studioVisits: number;
  documentGenerations: number;
  bugReportsSubmitted: number;
  currentStateSummary:
    | "Invited, not activated"
    | "Logged in, no analysis"
    | "Analysis complete, no generation"
    | "Limited generation, unresolved"
    | "Generated docs"
    | "Submitted bug report";
};

type BetaCommandCenterPayload = {
  generatedAt: string;
  roster: BetaUserRosterRow[];
  funnel: {
    invited: number;
    activated: number;
    loggedIn: number;
    ranFirstAnalysis: number;
    reachedResults: number;
    openedStudio: number;
    generatedResume: number;
    generatedCoverLetter: number;
    submittedBug: number;
    trackedApplication: number;
  };
  frictionHotspots: Array<{
    key: string;
    label: string;
    count: number;
    examples: string[];
  }>;
  bugFeed: Array<{
    id: string;
    title: string;
    severity: string;
    category: string;
    where: string;
    createdAt: string;
    userEmail: string | null;
    status: "open";
    issueUrl: string | null;
  }>;
  actionNeededQueue: Array<{
    key: string;
    label: string;
    count: number;
    users: string[];
  }>;
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function severityClass(value: string): string {
  if (value === "blocker") return "text-rose-200";
  if (value === "major") return "text-amber-200";
  return "text-slate-200";
}

export default function BetaCommandCenterPage() {
  const [data, setData] = useState<BetaCommandCenterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/analytics/beta-command-center", {
          cache: "no-store",
          credentials: "include",
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error("Admin access required");
        }
        if (!response.ok) {
          throw new Error("Unable to load beta command center.");
        }
        const payload = (await response.json()) as BetaCommandCenterPayload;
        if (!cancelled) setData(payload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load beta command center.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const topCategory = useMemo(() => {
    if (!data?.frictionHotspots?.length) return "none";
    const sorted = [...data.frictionHotspots].sort((a, b) => b.count - a.count);
    return sorted[0]?.label ?? "none";
  }, [data?.frictionHotspots]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Founder Ops</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Closed Beta Command Center</h1>
        <p className="mt-2 text-sm text-slate-300">
          Internal operations view across access, usage progression, friction, and support load.
        </p>
      </header>

      {loading ? <p className="text-sm text-slate-300">Loading command center…</p> : null}
      {error ? (
        <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </section>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Beta users</p>
              <p className="mt-1 text-2xl font-semibold text-slate-50">{data.roster.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Activated</p>
              <p className="mt-1 text-2xl font-semibold text-slate-50">{data.funnel.activated}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Reached studio</p>
              <p className="mt-1 text-2xl font-semibold text-slate-50">{data.funnel.openedStudio}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Top friction</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{topCategory}</p>
            </div>
            <p className="md:col-span-4 text-xs text-slate-400">Updated: {formatDate(data.generatedAt)}</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100">Beta Funnel Snapshot</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              {Object.entries(data.funnel).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                  <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">{key}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100">Beta User Roster</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Access</th>
                    <th className="px-2 py-2">First login</th>
                    <th className="px-2 py-2">Last active</th>
                    <th className="px-2 py-2">Analyses</th>
                    <th className="px-2 py-2">Studio</th>
                    <th className="px-2 py-2">Generations</th>
                    <th className="px-2 py-2">Bugs</th>
                    <th className="px-2 py-2">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.roster.map((row) => (
                    <tr key={row.userId}>
                      <td className="px-2 py-2 text-slate-100">{row.email}</td>
                      <td className="px-2 py-2 text-slate-200">{row.accessCodeStatus}</td>
                      <td className="px-2 py-2 text-slate-200">{formatDate(row.firstLoginAt)}</td>
                      <td className="px-2 py-2 text-slate-200">{formatDate(row.lastActiveAt)}</td>
                      <td className="px-2 py-2 text-slate-200">{row.analysesRun}</td>
                      <td className="px-2 py-2 text-slate-200">{row.studioVisits}</td>
                      <td className="px-2 py-2 text-slate-200">{row.documentGenerations}</td>
                      <td className="px-2 py-2 text-slate-200">{row.bugReportsSubmitted}</td>
                      <td className="px-2 py-2 text-slate-100">{row.currentStateSummary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-lg font-semibold text-slate-100">Friction Hotspots</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.frictionHotspots.map((item) => (
                  <li key={item.key} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="font-semibold text-slate-100">{item.label} · {item.count}</p>
                    <p className="mt-1 text-xs text-slate-300">{item.examples.join(" | ") || "No recent examples."}</p>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-lg font-semibold text-slate-100">Action Needed Queue</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.actionNeededQueue.map((item) => (
                  <li key={item.key} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="font-semibold text-slate-100">{item.label} · {item.count}</p>
                    <p className="mt-1 text-xs text-slate-300">{item.users.join(" | ") || "No users currently in this queue."}</p>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100">Bug Report Feed</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="px-2 py-2">When</th>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Severity</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">User</th>
                    <th className="px-2 py-2">Flow</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.bugFeed.map((bug) => (
                    <tr key={bug.id}>
                      <td className="px-2 py-2 text-slate-200">{formatDate(bug.createdAt)}</td>
                      <td className="px-2 py-2 text-slate-100">{bug.title}</td>
                      <td className={`px-2 py-2 ${severityClass(bug.severity)}`}>{bug.severity}</td>
                      <td className="px-2 py-2 text-slate-200">{bug.category}</td>
                      <td className="px-2 py-2 text-slate-200">{bug.userEmail ?? "Unknown"}</td>
                      <td className="px-2 py-2 text-slate-200">{bug.where}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

