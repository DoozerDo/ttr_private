"use client";

import { useCallback, useEffect, useState } from "react";

type SupportHistoryItem = {
  issueNumber: number;
  title: string;
  state: "open" | "closed";
  status: "Investigating" | "Fix in progress" | "Resolved";
  labels: string[];
  createdAt: string;
  updatedAt: string;
  severity: "high" | "medium" | null;
  area: string | null;
  reporterMessagePreview: string;
  sentryEventId: string | null;
  resolutionNote: string | null;
};

type SupportHistoryResponse = {
  items: SupportHistoryItem[];
  page?: number;
};

type LoadState = "loading" | "success" | "error";

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

const statusTone = (status: SupportHistoryItem["status"]) => {
  if (status === "Resolved") return "text-slate-300 bg-slate-800/70 border border-slate-700/80";
  if (status === "Fix in progress") return "text-amber-200 bg-amber-500/10 border border-amber-400/20";
  return "text-emerald-300 bg-emerald-500/10 border border-emerald-400/20";
};

export default function SupportHistoryPage() {
  const [items, setItems] = useState<SupportHistoryItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stillSeeingPending, setStillSeeingPending] = useState<Record<number, boolean>>({});
  const [stillSeeingMessage, setStillSeeingMessage] = useState<Record<number, string>>({});

  const loadHistory = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/support/history", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load your support history right now.");
      }

      const payload = (await response.json()) as SupportHistoryResponse;
      setItems(payload.items ?? []);
      setLoadState("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load your support history right now.",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleStillSeeing = useCallback(async (issueNumber: number) => {
    setStillSeeingPending((current) => ({ ...current, [issueNumber]: true }));
    setStillSeeingMessage((current) => ({ ...current, [issueNumber]: "" }));

    try {
      const response = await fetch("/api/support/history/still-seeing", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueNumber }),
      });
      if (!response.ok) {
        throw new Error("Unable to record your signal right now.");
      }
      setStillSeeingMessage((current) => ({
        ...current,
        [issueNumber]: "Thanks. We recorded that you're still seeing this issue.",
      }));
    } catch (error) {
      setStillSeeingMessage((current) => ({
        ...current,
        [issueNumber]:
          error instanceof Error ? error.message : "Unable to record your signal right now.",
      }));
    } finally {
      setStillSeeingPending((current) => ({ ...current, [issueNumber]: false }));
    }
  }, []);

  const hasItems = loadState === "success" && items.length > 0;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Support</p>
        <h1 className="text-3xl font-semibold text-slate-50">Support History</h1>
        <p className="mt-2 text-sm text-slate-300">
          Track the bug reports you have submitted and their current status.
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 text-sm text-slate-300">
        GitHub issues remain the source of truth for each report. This view only surfaces the issues you submitted.
      </div>

      {loadState === "loading" ? (
        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-5 text-sm text-slate-300">
          Loading your support history…
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5 text-sm text-rose-100">
          <p>{errorMessage ?? "Unable to load your support history right now."}</p>
          <button
            type="button"
            onClick={loadHistory}
            className="mt-3 inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/60 hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      ) : null}

      {loadState === "success" && !hasItems ? (
        <div className="space-y-3 rounded-2xl border border-white/5 bg-slate-950/60 p-5 text-sm text-slate-300">
          <p>You have not reported any bugs yet.</p>
          <p>
            Use the "Report a bug" action in the header or footer to send runtime context to the team.
          </p>
        </div>
      ) : null}

      {hasItems ? (
        <div className="grid gap-4">
          {items.map((item) => (
            <article
              key={item.issueNumber}
              className={[
                "rounded-3xl border p-5",
                item.status === "Resolved"
                  ? "border-slate-700/80 bg-slate-950/55"
                  : "border-white/10 bg-slate-950/70",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Issue #{item.issueNumber}</p>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    statusTone(item.status),
                  ].join(" ")}
                >
                  {item.status}
                </span>
              </div>

              <h2 className="mt-3 text-lg font-semibold text-white">{item.title}</h2>

              <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em]">
                {item.area ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                    {item.area}
                  </span>
                ) : null}
                {item.severity ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                    Severity: {item.severity === "high" ? "High" : "Medium"}
                  </span>
                ) : null}
              </div>

              <p className="mt-4 text-sm text-slate-300">{item.reporterMessagePreview}</p>

              {item.resolutionNote ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.25em] text-slate-400">Latest update</p>
                  <p className="mt-1 text-sm text-slate-200">{item.resolutionNote}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-4 text-[0.65rem] uppercase tracking-[0.25em] text-slate-400">
                <span>Reported {formatDate(item.createdAt)}</span>
                <span>Updated {formatDate(item.updatedAt)}</span>
              </div>

              {item.sentryEventId ? (
                <p className="mt-3 text-xs text-slate-400">Sentry event ID: {item.sentryEventId}</p>
              ) : null}

              {item.status === "Resolved" ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void handleStillSeeing(item.issueNumber)}
                    disabled={Boolean(stillSeeingPending[item.issueNumber])}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/60 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {stillSeeingPending[item.issueNumber] ? "Sending..." : "Still seeing this issue"}
                  </button>
                  {stillSeeingMessage[item.issueNumber] ? (
                    <p className="mt-2 text-xs text-slate-300">{stillSeeingMessage[item.issueNumber]}</p>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
