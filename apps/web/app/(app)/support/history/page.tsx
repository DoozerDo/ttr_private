"use client";

import { useCallback, useEffect, useState } from "react";

type SupportHistoryItem = {
  issueNumber: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  createdAt: string;
  updatedAt: string;
  severity: "high" | "medium" | null;
  area: string | null;
  reporterMessagePreview: string;
  sentryEventId: string | null;
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

const statusTone = (state: SupportHistoryItem["state"]) =>
  state === "open" ? "text-emerald-300 bg-emerald-500/10" : "text-slate-400 bg-slate-800/60";

export default function SupportHistoryPage() {
  const [items, setItems] = useState<SupportHistoryItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const hasItems = loadState === "success" && items.length > 0;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Support</p>
        <h1 className="text-3xl font-semibold text-slate-50">Support history</h1>
        <p className="mt-2 text-sm text-slate-300">
          Track the bug reports you submitted and check their current status in beta.
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
              className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Issue #{item.issueNumber}</p>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    statusTone(item.state),
                  ].join(" ")}
                >
                  {item.state === "open" ? "Open" : "Closed"}
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

              <div className="mt-4 flex flex-wrap gap-4 text-[0.65rem] uppercase tracking-[0.25em] text-slate-400">
                <span>Reported {formatDate(item.createdAt)}</span>
                <span>Updated {formatDate(item.updatedAt)}</span>
              </div>

              {item.sentryEventId ? (
                <p className="mt-3 text-xs text-slate-400">Sentry event ID: {item.sentryEventId}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
