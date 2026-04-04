"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BugReportRow = {
  id: string;
  createdAt: string;
  route: string;
  description?: string | null;
  whatHappened?: string;
  userId: string | null;
  baselineId: string | null;
  jobId: string | null;
  assessmentId: string | null;
  score: string | number | null;
  nextAction: string | null;
  status: string;
  severity: string;
};

type SyntheticRunRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "started" | "dry_run" | "succeeded" | "failed";
  errorMessage: string | null;
  summaryJson?: Record<string, unknown> | null;
  stepResultsJson?: Array<Record<string, unknown>>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "n/a";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function pickNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getSyntheticSummaryField(summary: Record<string, unknown> | null | undefined, key: string) {
  if (!summary) return null;
  return pickString(summary[key]) ?? (pickNumber(summary[key]) !== null ? String(summary[key]) : null);
}

export default function BugReportingAdminPage() {
  const [bugReports, setBugReports] = useState<BugReportRow[]>([]);
  const [syntheticRuns, setSyntheticRuns] = useState<SyntheticRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [reportsRes, runsRes] = await Promise.all([
        fetch("/api/admin/bug-reports?pageSize=10", { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/synthetic-transactions/core-loop-smoke/runs?limit=10", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      if (!reportsRes.ok) throw new Error("Unable to load bug reports.");
      if (!runsRes.ok) throw new Error("Unable to load synthetic runs.");

      const reportsPayload = (await reportsRes.json()) as { items?: BugReportRow[] };
      const runsPayload = (await runsRes.json()) as SyntheticRunRow[];

      setBugReports(Array.isArray(reportsPayload.items) ? reportsPayload.items : []);
      setSyntheticRuns(Array.isArray(runsPayload) ? runsPayload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load beta triage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syntheticFailureCount = useMemo(
    () => syntheticRuns.filter((run) => run.status === "failed").length,
    [syntheticRuns],
  );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Support tools</p>
        <h1 className="text-3xl font-semibold text-white">Beta Triage</h1>
        <p className="text-sm text-slate-300">
          Quick scan of recent user bug reports and synthetic core-loop runs.
        </p>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Bug reports</p>
          <p className="text-2xl font-semibold text-white">{bugReports.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Synthetic runs</p>
          <p className="text-2xl font-semibold text-white">{syntheticRuns.length}</p>
        </div>
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Synthetic failures</p>
          <p className="text-2xl font-semibold text-rose-100">{syntheticFailureCount}</p>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-300">Loading beta triage data...</p> : null}

      {!loading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Recent bug reports</h2>
              <button
                type="button"
                onClick={load}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:border-white/40"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-3">
              {bugReports.map((report) => (
                <article key={report.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{formatDate(report.createdAt)}</p>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate-300">
                      {report.status} / {report.severity}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {report.description ?? report.whatHappened ?? "No description"}
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                    <p><span className="text-slate-500">Route:</span> {report.route}</p>
                    <p><span className="text-slate-500">User:</span> {report.userId ?? "n/a"}</p>
                    <p><span className="text-slate-500">Baseline:</span> {report.baselineId ?? "n/a"}</p>
                    <p><span className="text-slate-500">Job:</span> {report.jobId ?? "n/a"}</p>
                    <p><span className="text-slate-500">Assessment:</span> {report.assessmentId ?? "n/a"}</p>
                    <p><span className="text-slate-500">Score:</span> {report.score ?? "n/a"}</p>
                    <p className="sm:col-span-2"><span className="text-slate-500">Next action:</span> {report.nextAction ?? "n/a"}</p>
                  </div>
                </article>
              ))}
              {bugReports.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-sm text-slate-400">
                  No bug reports found.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">Recent synthetic runs</h2>
            <div className="space-y-3">
              {syntheticRuns.map((run) => {
                const summary = run.summaryJson ?? {};
                const baselineId = getSyntheticSummaryField(summary, "baselineId");
                const jobId = getSyntheticSummaryField(summary, "jobId");
                const assessmentId = getSyntheticSummaryField(summary, "assessmentId");
                const score = getSyntheticSummaryField(summary, "score");
                const nextAction = getSyntheticSummaryField(summary, "nextAction");
                return (
                  <article
                    key={run.id}
                    className={[
                      "rounded-2xl border p-4",
                      run.status === "failed"
                        ? "border-rose-400/40 bg-rose-500/10"
                        : "border-white/10 bg-slate-950/70",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        {formatDate(run.startedAt)}
                      </p>
                      <span
                        className={[
                          "rounded-full border px-2 py-1 text-xs font-semibold",
                          run.status === "failed"
                            ? "border-rose-300/40 bg-rose-400/20 text-rose-50"
                            : "border-emerald-300/30 bg-emerald-400/15 text-emerald-50",
                        ].join(" ")}
                      >
                        {run.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">
                      Core loop smoke run
                    </p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                      <p><span className="text-slate-500">Baseline:</span> {baselineId ?? "n/a"}</p>
                      <p><span className="text-slate-500">Job:</span> {jobId ?? "n/a"}</p>
                      <p><span className="text-slate-500">Assessment:</span> {assessmentId ?? "n/a"}</p>
                      <p><span className="text-slate-500">Score:</span> {score ?? "n/a"}</p>
                      <p className="sm:col-span-2"><span className="text-slate-500">Next action:</span> {nextAction ?? "n/a"}</p>
                    </div>
                    {run.status === "failed" ? (
                      <p className="mt-3 rounded-xl border border-rose-300/30 bg-rose-950/30 p-3 text-sm text-rose-100">
                        {run.errorMessage ?? "Synthetic run failed."}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-slate-500">Finished: {formatDate(run.finishedAt)}</p>
                  </article>
                );
              })}
              {syntheticRuns.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-sm text-slate-400">
                  No synthetic runs found.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
