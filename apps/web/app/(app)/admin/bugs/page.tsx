"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type BugStatus = "OPEN" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type BugSeverity = "NEW" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type BugReportItem = {
  id: string;
  createdAt: string;
  reporterEmail: string | null;
  route: string;
  baselineId: string | null;
  whatHappened: string;
  status: BugStatus;
  severity: BugSeverity;
};

type BugReportsListResponse = {
  items: BugReportItem[];
  total: number;
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

export default function AdminBugsPage() {
  const [items, setItems] = useState<BugReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | BugStatus>("");
  const [severity, setSeverity] = useState<"" | BugSeverity>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (severity) params.set("severity", severity);
      const response = await fetch(`/api/admin/bug-reports?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to load bug reports.");
      const payload = (await response.json()) as BugReportsListResponse;
      setItems(payload.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load bug reports.");
    } finally {
      setLoading(false);
    }
  }, [severity, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Support tools</p>
        <h1 className="text-3xl font-semibold text-white">Bug Reports</h1>
      </header>

      <div className="flex gap-3">
        <select
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          value={status}
          onChange={(event) => setStatus(event.target.value as "" | BugStatus)}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="TRIAGED">TRIAGED</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        <select
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          value={severity}
          onChange={(event) => setSeverity(event.target.value as "" | BugSeverity)}
        >
          <option value="">All severities</option>
          <option value="NEW">NEW</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
        <button
          type="button"
          className="rounded border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:border-white/40"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-300">Loading bug reports...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && !error ? (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/70">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Reporter</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Baseline</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">{item.reporterEmail ?? "unknown"}</td>
                  <td className="px-4 py-3">{item.route}</td>
                  <td className="px-4 py-3">{item.baselineId ?? "n/a"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/bugs/${item.id}`} className="text-sky-300 hover:text-sky-200">
                      {item.whatHappened.slice(0, 90)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3">{item.severity}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={7}>
                    No bug reports found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
