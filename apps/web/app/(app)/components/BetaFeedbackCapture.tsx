"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const CATEGORIES = [
  "bug",
  "confusion",
  "trust_issue",
  "scoring_question",
  "generation_problem",
  "ux_friction",
  "feature_request",
  "other",
] as const;

type FeedbackCategory = (typeof CATEGORIES)[number];

export function BetaFeedbackCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const context = useMemo(() => {
    const analysisId = searchParams?.get("analysisId") ?? searchParams?.get("assessmentId");
    const baselineId = searchParams?.get("baselineId");
    const opportunityId = searchParams?.get("opportunityId");
    return {
      analysisId: analysisId || undefined,
      baselineId: baselineId || undefined,
      opportunityId: opportunityId || undefined,
      pageContext: pathname || undefined,
    };
  }, [pathname, searchParams]);

  const isSupportedPage = useMemo(() => {
    if (!pathname) return false;
    return (
      pathname.startsWith("/baseline") ||
      pathname.startsWith("/results") ||
      pathname.startsWith("/studio") ||
      pathname.startsWith("/opportunities")
    );
  }, [pathname]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title,
          message,
          ...context,
          metadata: {
            pathname,
          },
        }),
      });
      if (!response.ok) throw new Error("Unable to submit feedback.");
      setTitle("");
      setMessage("");
      setStatus("Feedback submitted");
      setOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSupportedPage) return null;

  return (
    <div className="w-full max-w-[420px]">
      {!open ? (
        <button
          type="button"
          className="w-full rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-white/30 hover:text-slate-100"
          onClick={() => setOpen(true)}
        >
          Report Beta Feedback
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-white/20 bg-slate-900/95 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Beta feedback</p>
          <select
            className="w-full rounded border border-white/15 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            value={category}
            onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded border border-white/15 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            placeholder="Short title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <textarea
            className="w-full rounded border border-white/15 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            rows={3}
            placeholder="What happened and what you expected"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
          />
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="rounded border border-white/20 px-2 py-1 text-xs text-slate-100">
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button type="button" className="rounded border border-white/20 px-2 py-1 text-xs text-slate-300" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {status ? <p className="text-xs text-slate-300">{status}</p> : null}
        </form>
      )}
    </div>
  );
}
