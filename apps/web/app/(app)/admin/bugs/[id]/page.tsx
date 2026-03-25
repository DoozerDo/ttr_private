"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BugStatus = "OPEN" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type BugSeverity = "NEW" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type BugReportDetail = {
  id: string;
  createdAt: string;
  updatedAt: string;
  reporterEmail: string | null;
  userId: string | null;
  whatHappened: string;
  attemptedAction: string | null;
  expectedBehavior: string | null;
  route: string;
  pageLabel: string | null;
  appVersion: string | null;
  gitSha: string | null;
  baselineId: string | null;
  assessmentId: string | null;
  fitScore: string | null;
  browserInfo: string | null;
  viewport: Record<string, unknown> | null;
  runtimeContext: Record<string, unknown>;
  screenshotStoragePath: string | null;
  status: BugStatus;
  severity: BugSeverity;
  triageNotes: string | null;
  resolvedAt: string | null;
};

type AdminBugDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) return "n/a";
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

export default function AdminBugDetailPage({ params }: AdminBugDetailPageProps) {
  const [id, setId] = useState<string>("");
  const [report, setReport] = useState<BugReportDetail | null>(null);
  const [status, setStatus] = useState<BugStatus>("OPEN");
  const [severity, setSeverity] = useState<BugSeverity>("NEW");
  const [triageNotes, setTriageNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bug-reports/${id}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load bug report.");
      const payload = (await response.json()) as BugReportDetail;
      setReport(payload);
      setStatus(payload.status);
      setSeverity(payload.severity);
      setTriageNotes(payload.triageNotes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load bug report.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const screenshotUrl = useMemo(
    () => (report?.screenshotStoragePath ? `/api/admin/bug-reports/${id}/screenshot` : null),
    [id, report?.screenshotStoragePath],
  );

  const save = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bug-reports/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, severity, triageNotes }),
      });
      if (!response.ok) throw new Error("Unable to update bug report.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update bug report.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-300">Loading bug report...</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!report) return <p className="text-sm text-slate-300">Bug report not found.</p>;

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Bug report</p>
        <h1 className="text-2xl font-semibold text-white">{report.id}</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
          <p><span className="text-slate-400">Created:</span> {formatDate(report.createdAt)}</p>
          <p><span className="text-slate-400">Reporter:</span> {report.reporterEmail ?? report.userId ?? "unknown"}</p>
          <p><span className="text-slate-400">Route:</span> {report.route}</p>
          <p><span className="text-slate-400">Baseline:</span> {report.baselineId ?? "n/a"}</p>
          <p><span className="text-slate-400">Assessment:</span> {report.assessmentId ?? "n/a"}</p>
          <p><span className="text-slate-400">Fit score:</span> {report.fitScore ?? "n/a"}</p>
          <div>
            <p className="text-slate-400">What happened</p>
            <p className="whitespace-pre-wrap">{report.whatHappened}</p>
          </div>
          <div>
            <p className="text-slate-400">Attempted action</p>
            <p className="whitespace-pre-wrap">{report.attemptedAction ?? "n/a"}</p>
          </div>
          <div>
            <p className="text-slate-400">Expected behavior</p>
            <p className="whitespace-pre-wrap">{report.expectedBehavior ?? "n/a"}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
          <label className="block">
            <span className="text-slate-400">Status</span>
            <select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value as BugStatus)}>
              <option value="OPEN">OPEN</option>
              <option value="TRIAGED">TRIAGED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-400">Severity</span>
            <select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={severity} onChange={(event) => setSeverity(event.target.value as BugSeverity)}>
              <option value="NEW">NEW</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-400">Triage notes</span>
            <textarea
              className="mt-1 h-40 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={triageNotes}
              onChange={(event) => setTriageNotes(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:border-white/40 disabled:opacity-60"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving..." : "Save triage"}
          </button>
          <div>
            <p className="text-slate-400">Resolved at</p>
            <p>{formatDate(report.resolvedAt)}</p>
          </div>
          {screenshotUrl ? (
            <div className="space-y-2">
              <p className="text-slate-400">Screenshot</p>
              <a href={screenshotUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
                Open screenshot
              </a>
              <img src={screenshotUrl} alt="Bug report screenshot" className="max-h-80 rounded border border-white/10" />
            </div>
          ) : (
            <p className="text-slate-400">No screenshot uploaded.</p>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-white">Runtime context</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-200">
          {JSON.stringify(report.runtimeContext ?? {}, null, 2)}
        </pre>
      </section>
    </section>
  );
}
