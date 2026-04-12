"use client";

import { useEffect, useMemo, useState } from "react";

type SyntheticReliabilityStatus = "pass" | "fail" | "running" | "unknown" | "stale";

type SyntheticReliabilityRunViewModel = {
  id: string;
  status: Exclude<SyntheticReliabilityStatus, "stale">;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  ageMinutes: number | null;
  isStale: boolean;
  summary: string;
  errorMessage: string | null;
  failureReason: string | null;
  firstFailureStep: {
    key: string;
    title: string;
    status: string;
    errorMessage: string | null;
  } | null;
  rawStatus: string;
  stepCount: number;
};

type SyntheticReliabilitySuiteViewModel = {
  suiteKey: string;
  suiteName: string;
  surface: string;
  category: string;
  journeySummary: string;
  active: boolean;
  validatedJourneys: string[];
  dependencies: string[];
  envInputs: string[];
  sourceRefs: string[];
  artifactRefs: string[];
  latestRun: SyntheticReliabilityRunViewModel | null;
  recentHistory: SyntheticReliabilityRunViewModel[];
  provenance: {
    registrySource: "static-registry";
    latestRunSource: "database" | "none";
    historySource: "database" | "none";
  };
};

type SyntheticReliabilityPayload = {
  generatedAt: string;
  suiteCount: number;
  suites: SyntheticReliabilitySuiteViewModel[];
  statusCounts: Record<Exclude<SyntheticReliabilityStatus, "stale">, number>;
  healthRollup: {
    status: "all_passing" | "failing" | "stale" | "unknown";
    statusLabel: string;
    failingSuites: number;
    failingSuiteNames: string[];
    staleSuites: number;
    staleSuiteNames: string[];
    latestRunAt: string | null;
    latestRunAgeMinutes: number | null;
    recencyLabel: string;
    staleThresholdMinutes: number;
  };
  sources: {
    registry: "static-registry";
    latestRuns: "synthetic_cleanup_runs";
  };
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "No run yet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function statusTone(status: SyntheticReliabilityStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "fail":
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "running":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "stale":
      return "border-amber-300/30 bg-amber-400/15 text-amber-100";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-100";
  }
}

function statusLabel(status: SyntheticReliabilityStatus): string {
  if (status === "stale") {
    return "Stale";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function composeFailureSummary(
  failureReason: string | null | undefined,
  firstFailureStep: SyntheticReliabilityRunViewModel["firstFailureStep"] | null | undefined,
): string | null {
  const pieces: string[] = [];
  if (failureReason?.trim()) {
    pieces.push(failureReason.trim());
  }
  if (firstFailureStep?.title) {
    const stepSummary = firstFailureStep.errorMessage?.trim()
      ? `${firstFailureStep.title}: ${firstFailureStep.errorMessage.trim()}`
      : firstFailureStep.title;
    pieces.push(stepSummary);
  }
  return pieces.length > 0 ? pieces.join(" | ") : null;
}

function healthTone(status: SyntheticReliabilityPayload["healthRollup"]["status"]): string {
  switch (status) {
    case "all_passing":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "failing":
      return "border-rose-400/20 bg-rose-500/10 text-rose-100";
    case "stale":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    default:
      return "border-slate-500/20 bg-slate-500/10 text-slate-100";
  }
}

function healthLabel(status: SyntheticReliabilityPayload["healthRollup"]["status"]): string {
  switch (status) {
    case "all_passing":
      return "All passing";
    case "failing":
      return "Failing";
    case "stale":
      return "Stale";
    default:
      return "Unknown";
  }
}

export default function SyntheticReliabilityPage() {
  const [payload, setPayload] = useState<SyntheticReliabilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/synthetics?limit=5", {
          credentials: "include",
          cache: "no-store",
        });

        if (response.status === 401 || response.status === 403) {
          throw new Error("Admin access required");
        }

        if (!response.ok) {
          throw new Error("Unable to load synthetic reliability");
        }

        const data = (await response.json()) as SyntheticReliabilityPayload;
        if (!cancelled) setPayload(data);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load synthetic reliability");
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

  const recentHistoryEmpty = useMemo(() => {
    return !payload?.suites.some((suite) => suite.recentHistory.length > 0);
  }, [payload?.suites]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Operational quality</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Synthetic Reliability</h1>
        <p className="text-sm text-slate-300">
          Registry-backed view of public synthetic suites, their latest run state, and recent history.
        </p>
      </header>

      {loading ? <p className="text-sm text-slate-300">Loading synthetic reliability...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {payload ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Suites</p>
              <p className="mt-1 text-2xl font-semibold text-slate-50">{payload.suiteCount}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Pass</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-50">{payload.statusCounts.pass}</p>
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Fail</p>
              <p className="mt-1 text-2xl font-semibold text-rose-50">{payload.statusCounts.fail}</p>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Running / unknown</p>
              <p className="mt-1 text-2xl font-semibold text-amber-50">
                {payload.statusCounts.running + payload.statusCounts.unknown}
              </p>
            </div>
          </section>

          <section className="space-y-4">
            {payload.suites.map((suite) => {
              const latestRunStatus = suite.latestRun?.isStale ? "stale" : suite.latestRun?.status ?? "unknown";
              const failureSummary = composeFailureSummary(
                suite.latestRun?.failureReason,
                suite.latestRun?.firstFailureStep,
              );

              return (
                <article key={suite.suiteKey} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-slate-50">{suite.suiteName}</h2>
                        <span
                          className={[
                            "rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                            suite.active
                              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                              : "border-slate-500/20 bg-slate-500/10 text-slate-200",
                          ].join(" ")}
                        >
                          {suite.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">
                        {suite.surface} | {suite.category}
                      </p>
                      <p className="text-sm text-slate-200">{suite.journeySummary}</p>
                    </div>

                    <div className="min-w-[240px] rounded-xl border border-white/10 bg-slate-950/50 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Latest run</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(
                            latestRunStatus,
                          )}`}
                        >
                          {statusLabel(latestRunStatus)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {suite.provenance.latestRunSource === "database" ? "From DB" : "No recorded run"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-200">
                        Started: <span className="text-slate-100">{formatDate(suite.latestRun?.startedAt)}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        Duration: <span className="text-slate-100">{formatDuration(suite.latestRun?.durationMs)}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        Recency:{" "}
                        <span className="text-slate-100">
                          {suite.latestRun?.isStale ? "stale" : formatDate(suite.latestRun?.startedAt)}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        Summary:{" "}
                        <span className="text-slate-100">
                          {suite.latestRun?.summary ?? "No run history recorded yet."}
                        </span>
                      </p>
                      {failureSummary ? (
                        <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-50">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">
                            Failure reason
                          </p>
                          <p className="mt-1 break-words">{failureSummary}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <details className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                        Validated journeys and dependencies
                      </summary>
                      <div className="mt-3 space-y-4 text-sm text-slate-300">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Validated journeys</p>
                          <ul className="mt-2 space-y-2">
                            {suite.validatedJourneys.map((journey) => (
                              <li key={journey} className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
                                {journey}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Dependencies / env inputs
                          </p>
                          <p className="mt-2 text-slate-200">{suite.dependencies.join(" | ")}</p>
                          <p className="mt-2 text-xs text-slate-400">Env inputs: {suite.envInputs.join(", ")}</p>
                        </div>
                      </div>
                    </details>

                    <details className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                        Sources and recent history
                      </summary>
                      <div className="mt-3 space-y-4 text-sm text-slate-300">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Source refs</p>
                          <ul className="mt-2 space-y-2">
                            {suite.sourceRefs.map((sourceRef) => (
                              <li key={sourceRef} className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
                                {sourceRef}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Artifact refs</p>
                          {suite.artifactRefs.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {suite.artifactRefs.map((artifactRef) => (
                                <li
                                  key={artifactRef}
                                  className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2"
                                >
                                  {artifactRef}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-slate-400">No artifact reference recorded.</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recent history</p>
                          {suite.recentHistory.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {suite.recentHistory.map((run) => {
                                const runStatus = run.isStale ? "stale" : run.status;
                                const runFailureSummary = composeFailureSummary(run.failureReason, run.firstFailureStep);

                                return (
                                  <li key={run.id} className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span
                                        className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone(
                                          runStatus,
                                        )}`}
                                      >
                                        {statusLabel(runStatus)}
                                      </span>
                                      <span className="text-xs text-slate-400">{formatDate(run.startedAt)}</span>
                                    </div>
                                    <p className="mt-2 text-slate-200">{run.summary}</p>
                                    <p className="mt-1 text-xs text-slate-400">
                                      Duration {formatDuration(run.durationMs)} | {run.stepCount} steps
                                    </p>
                                    {runFailureSummary ? (
                                      <p className="mt-2 text-xs text-rose-200">{runFailureSummary}</p>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="mt-2 rounded-lg border border-dashed border-white/10 bg-slate-950/40 px-3 py-3 text-slate-400">
                              No run history recorded yet. When a synthetic report is published, the latest run will
                              show here.
                            </p>
                          )}
                        </div>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </section>

          {recentHistoryEmpty ? (
            <section className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
              Registry is loaded, but no run history has been recorded yet. The page will update once a synthetic run
              report is published to the reliability contract.
            </section>
          ) : null}

          <p className="text-xs text-slate-500">
            Registry source: {payload.sources.registry} | Latest runs source: {payload.sources.latestRuns} |
            Updated: {formatDate(payload.generatedAt)}
          </p>
        </>
      ) : null}
    </section>
  );
}
