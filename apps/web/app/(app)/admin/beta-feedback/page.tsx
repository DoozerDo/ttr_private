"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Severity = "blocker" | "major" | "minor";
type Category =
  | "scoring_issue"
  | "hallucination"
  | "formatting_resume"
  | "formatting_cover_letter"
  | "ux_confusion"
  | "navigation_break"
  | "data_missing"
  | "other";

type FeedbackUser = {
  id: string;
  email?: string | null;
} | null;

type BetaFeedbackItem = {
  id: string;
  title: string;
  where: string;
  actual: string;
  expected: string;
  severity: Severity;
  category: Category;
  jobDescription: string | null;
  notes: string | null;
  screenshotUrl: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  user: FeedbackUser;
};

type SummaryResponse = {
  totalCount: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<Category, number>;
  topRecurringTitles: Array<{ title: string; count: number }>;
};

const severityOptions: Severity[] = ["blocker", "major", "minor"];
const categoryOptions: Category[] = [
  "scoring_issue",
  "hallucination",
  "formatting_resume",
  "formatting_cover_letter",
  "ux_confusion",
  "navigation_break",
  "data_missing",
  "other",
];

const severityTone: Record<Severity, string> = {
  blocker: "text-rose-200 bg-rose-500/20 border-rose-400/50",
  major: "text-amber-200 bg-amber-500/20 border-amber-400/40",
  minor: "text-sky-200 bg-sky-500/20 border-sky-400/40",
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

function toLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default function AdminBetaFeedbackPage() {
  const [items, setItems] = useState<BetaFeedbackItem[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"" | Severity>("");
  const [categoryFilter, setCategoryFilter] = useState<"" | Category>("");
  const [groupBy, setGroupBy] = useState<"none" | "severity" | "category">("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [where, setWhere] = useState("");
  const [actual, setActual] = useState("");
  const [expected, setExpected] = useState("");
  const [severity, setSeverity] = useState<Severity>("major");
  const [jobDescription, setJobDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (severityFilter) params.set("severity", severityFilter);
      if (categoryFilter) params.set("category", categoryFilter);

      const [itemsRes, summaryRes] = await Promise.all([
        fetch(`/api/beta-feedback?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/beta-feedback/summary", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      if (!itemsRes.ok) {
        throw new Error("Unable to load beta feedback.");
      }
      if (!summaryRes.ok) {
        throw new Error("Unable to load beta feedback summary.");
      }

      const list = (await itemsRes.json()) as BetaFeedbackItem[];
      const summaryPayload = (await summaryRes.json()) as SummaryResponse;

      setItems(Array.isArray(list) ? list : []);
      setSummary(summaryPayload);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load beta feedback.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, selectedId, severityFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "All feedback", items }];
    }
    const groups = new Map<string, BetaFeedbackItem[]>();
    for (const item of items) {
      const key = groupBy === "category" ? item.category : item.severity;
      const current = groups.get(key) ?? [];
      current.push(item);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).map(([key, value]) => ({
      key,
      label: `${toLabel(key)} (${value.length})`,
      items: value,
    }));
  }, [groupBy, items]);

  const topCategory = useMemo(() => {
    if (!summary) return "n/a";
    const entries = Object.entries(summary.byCategory) as Array<[Category, number]>;
    const [winner] = entries.sort((a, b) => b[1] - a[1]);
    return winner ? `${toLabel(winner[0])} (${winner[1]})` : "n/a";
  }, [summary]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/beta-feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          where,
          actual,
          expected,
          severity,
          jobDescription: jobDescription || undefined,
          notes: notes || undefined,
          screenshotUrl: screenshotUrl || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to submit beta feedback.");
      }

      setTitle("");
      setWhere("");
      setActual("");
      setExpected("");
      setSeverity("major");
      setJobDescription("");
      setNotes("");
      setScreenshotUrl("");

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit beta feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Support tools</p>
        <h1 className="text-3xl font-semibold text-white">Beta Feedback Triage</h1>
        <p className="text-sm text-slate-300">
          Internal triage board for beta feedback, issue classification, and prioritization.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase text-slate-400">Total</p>
          <p className="text-2xl font-semibold text-white">{summary?.totalCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase text-slate-400">Blockers</p>
          <p className="text-2xl font-semibold text-rose-200">{summary?.bySeverity.blocker ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase text-slate-400">Majors</p>
          <p className="text-2xl font-semibold text-amber-200">{summary?.bySeverity.major ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase text-slate-400">Top category</p>
          <p className="text-sm font-semibold text-white">{topCategory}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-white">Manual entry</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Where" value={where} onChange={(e) => setWhere(e.target.value)} required />
          <textarea className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" rows={3} placeholder="What happened" value={actual} onChange={(e) => setActual(e.target.value)} required />
          <textarea className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" rows={2} placeholder="What you expected" value={expected} onChange={(e) => setExpected(e.target.value)} required />
          <select className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            {severityOptions.map((value) => (
              <option key={value} value={value}>{toLabel(value)}</option>
            ))}
          </select>
          <input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Screenshot URL (optional)" value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} />
          <textarea className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" rows={3} placeholder="Job description (optional)" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
          <textarea className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button type="submit" disabled={submitting} className="mt-3 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:border-white/40 disabled:opacity-60">
          {submitting ? "Submitting..." : "Submit feedback"}
        </button>
      </form>

      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-slate-300">
          Severity
          <select className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as "" | Severity)}>
            <option value="">All</option>
            {severityOptions.map((value) => (
              <option key={value} value={value}>{toLabel(value)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Category
          <select className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "" | Category)}>
            <option value="">All</option>
            {categoryOptions.map((value) => (
              <option key={value} value={value}>{toLabel(value)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Group by
          <select className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "none" | "severity" | "category") }>
            <option value="none">None</option>
            <option value="severity">Severity</option>
            <option value="category">Category</option>
          </select>
        </label>
      </div>

      {loading ? <p className="text-sm text-slate-300">Loading feedback...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {grouped.map((group) => (
              <section key={group.key} className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
                <header className="border-b border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-200">{group.label}</header>
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {group.items.map((item) => (
                      <tr key={item.id} className={selectedId === item.id ? "bg-slate-800/50" : "hover:bg-slate-800/30"}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="text-left text-slate-100 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                            onClick={() => setSelectedId(item.id)}
                          >
                            {item.title}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityTone[item.severity]}`}>
                            {item.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3">{toLabel(item.category)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatDate(item.createdAt)}</td>
                        <td className="px-4 py-3 text-slate-300">{item.user?.email || item.userId || "Unknown"}</td>
                      </tr>
                    ))}
                    {group.items.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-slate-400" colSpan={5}>No feedback found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ))}
          </div>

          <aside className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold text-white">Detail</h2>
            {!selected ? (
              <p className="mt-2 text-sm text-slate-300">Select a row to inspect full report details.</p>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-slate-200">
                <p><span className="text-slate-400">Title:</span> {selected.title}</p>
                <p><span className="text-slate-400">Where:</span> {selected.where}</p>
                <p><span className="text-slate-400">Severity:</span> {selected.severity}</p>
                <p><span className="text-slate-400">Category:</span> {toLabel(selected.category)}</p>
                <p><span className="text-slate-400">Created:</span> {formatDate(selected.createdAt)}</p>
                <div>
                  <p className="text-slate-400">What happened</p>
                  <p className="whitespace-pre-wrap">{selected.actual}</p>
                </div>
                <div>
                  <p className="text-slate-400">What expected</p>
                  <p className="whitespace-pre-wrap">{selected.expected}</p>
                </div>
                {selected.jobDescription ? (
                  <div>
                    <p className="text-slate-400">Job description</p>
                    <p className="whitespace-pre-wrap">{selected.jobDescription}</p>
                  </div>
                ) : null}
                {selected.notes ? (
                  <div>
                    <p className="text-slate-400">Notes</p>
                    <p className="whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                ) : null}
                {selected.screenshotUrl ? (
                  <p>
                    <a className="text-sky-300 hover:text-sky-200" href={selected.screenshotUrl} target="_blank" rel="noreferrer">
                      Open screenshot
                    </a>
                  </p>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
