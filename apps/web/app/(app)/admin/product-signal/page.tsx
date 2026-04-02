"use client";

import { useEffect, useState } from "react";

type ProductSignalPayload = {
  funnelMetrics: {
    funnel: {
      totalUsers: number;
      stepCounts: Record<string, number>;
      conversionRates: Record<string, number>;
      dropOffRates: Record<string, number>;
    };
    recovery: Record<string, number>;
  };
  frictionHotspots: Array<{ label: string; count: number }>;
  triggerDistribution: Record<string, number>;
  keyConversions: {
    reachedAnalysisPercent: number;
    reachedHighScorePercent: number;
    createdOpportunityPercent: number;
    generatedDocumentsPercent: number;
  };
  topBottleneck: string;
  biggestRecoveryDriver: string;
};

type AnalyticsSummaryPayload = {
  resultsImprovementModuleViews: number;
  resultsImprovementCtaClicks: number;
  artifactUsedIntents: number;
  artifactRefineIntents: number;
  opportunityCommitIntents: number;
  resultsImprovementCtaRate: number;
  artifactToOpportunityCommitRate: number;
  refineIntentShare: number;
  trendContext: {
    resultsImprovementCtaRate: {
      current: number;
      previous: number;
      delta: number;
      direction: "up" | "down" | "flat";
    };
    artifactToOpportunityCommitRate: {
      current: number;
      previous: number;
      delta: number;
      direction: "up" | "down" | "flat";
    };
    refineIntentShare: {
      current: number;
      previous: number;
      delta: number;
      direction: "up" | "down" | "flat";
    };
  };
  weakestStep: {
    weakestStepKey:
      | "moduleViewToCtaRate"
      | "ctaToArtifactRate"
      | "artifactToRefineRate"
      | "artifactToCommitRate"
      | null;
    weakestStepLabel: string | null;
    weakestStepRate: number;
    weakestStepPreviousRate: number;
    weakestStepDelta: number;
    weakestStepDirection: "improving" | "worsening" | "flat" | "none";
    weakestStepPreviousNumerator: number;
    weakestStepPreviousDenominator: number;
    weakestStepTrendReason: string;
    benchmarkStepRate: number;
    relativeDrop: number;
    weakestStepNumerator: number;
    weakestStepDenominator: number;
    severity: "High" | "Medium" | "Low" | "None";
    confidence: "High" | "Medium" | "Low" | "None";
    confidenceReason: string;
    watchlistStatus: "stable" | "monitor" | "action_needed";
    watchlistPriority: "none" | "low" | "medium" | "high";
    watchlistReason: string;
    recommendationTitle: string;
    recommendationBody: string;
  };
  releaseAnnotations: Array<{
    id: string;
    label: string;
    date: string;
    type: "feature" | "experiment" | "fix" | "content";
    notes: string;
    isInCurrentWindow: boolean;
    isInPreviousWindow: boolean;
  }>;
  weakestStepReleaseContext: {
    relevantCurrentWindowReleases: Array<{
      id: string;
      label: string;
      date: string;
      type: "feature" | "experiment" | "fix" | "content";
      notes: string;
      isInCurrentWindow: boolean;
      isInPreviousWindow: boolean;
    }>;
    relevantPreviousWindowReleases: Array<{
      id: string;
      label: string;
      date: string;
      type: "feature" | "experiment" | "fix" | "content";
      notes: string;
      isInCurrentWindow: boolean;
      isInPreviousWindow: boolean;
    }>;
    releaseContextSummary: string;
  };
  operatorSummary: {
    headline: string;
    subheadline: string;
    tone: "neutral" | "informative" | "caution" | "urgent";
    primaryFocus:
      | "no_signal"
      | "weak_step_monitor"
      | "weak_step_action"
      | "positive_recovery"
      | "stable_funnel";
    supportingReason: string;
    recommendedActionTitle: string | null;
  };
  recommendedNextAction: {
    actionTitle: string;
    actionBody: string;
    actionFocus: "results_cta" | "studio_entry" | "refine_flow" | "opportunity_capture" | "none";
    actionSource: "weakest_step" | "weakest_step_with_release_context" | "none";
  };
  exportMetadata: {
    exportedAt: string;
    selectedWindowDays: number | null;
  };
  formattedExports: {
    plainTextBrief: string;
    jsonPayload: string;
  };
  adminSummaryExport: {
    headline: string;
    tone: "neutral" | "informative" | "caution" | "urgent";
    primaryFocus:
      | "no_signal"
      | "weak_step_monitor"
      | "weak_step_action"
      | "positive_recovery"
      | "stable_funnel";
    weakestStepLabel: string | null;
    weakestStepRate: number;
    weakestStepDirection: "improving" | "worsening" | "flat" | "none";
    watchlistStatus: "stable" | "monitor" | "action_needed";
    watchlistPriority: "none" | "low" | "medium" | "high";
    severity: "High" | "Medium" | "Low" | "None";
    confidence: "High" | "Medium" | "Low" | "None";
    recommendedActionTitle: string | null;
    recommendedActionBody: string;
    releaseContextSummary: string;
  };
};

type InvestorSnapshot = {
  totalUsers: number;
  reachedAnalysisPercent: number;
  recoveredFromLowScorePercent: number;
  reachedHighScorePercent: number;
  createdOpportunityPercent: number;
  avgTimeToHighScore: number;
  biggestDropOff: string;
  topFrictionPattern: string;
};

type ProductSignalSnapshot = {
  id: string;
  createdAt: string;
  selectedWindowDays: number;
  headline: string;
  tone: AnalyticsSummaryPayload["operatorSummary"]["tone"];
  primaryFocus: AnalyticsSummaryPayload["operatorSummary"]["primaryFocus"];
  weakestStepLabel: string | null;
  weakestStepRate: string | number;
  weakestStepDirection: "improving" | "worsening" | "flat" | "none";
  watchlistStatus: "stable" | "monitor" | "action_needed";
  watchlistPriority: "none" | "low" | "medium" | "high";
  severity: "High" | "Medium" | "Low" | "None";
  confidence: "High" | "Medium" | "Low" | "None";
  recommendedActionTitle: string | null;
  recommendedActionBody: string;
  releaseContextSummary: string;
  exportPayloadJson: string;
  reviewStatus: "open" | "monitoring" | "resolved";
  reviewNote: string;
  reviewedAt: string | null;
};

type ProductSignalCompare = {
  hasSnapshot: boolean;
  latestSnapshotCreatedAt: string | null;
  latestSnapshotReviewStatus: "open" | "monitoring" | "resolved" | null;
  latestSnapshotReviewNote: string | null;
  latestSnapshotReviewedAt: string | null;
  comparisonSummary: string;
  changedFields: Array<{
    field: string;
    previousValue: string | number | null;
    currentValue: string | number | null;
  }>;
};

function toLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function formatTrendComparison(current: number, comparison: { previous: number; delta: number; direction: "up" | "down" | "flat" }): string {
  const deltaPercent = Math.abs(comparison.delta * 100).toFixed(1);
  const directionLabel = comparison.direction === "flat" ? "flat" : comparison.direction;
  return `prev ${(comparison.previous * 100).toFixed(1)}% · ${directionLabel} ${deltaPercent} pts`;
}

function toneClasses(tone: AnalyticsSummaryPayload["operatorSummary"]["tone"]): string {
  switch (tone) {
    case "urgent":
      return "border-rose-500/40 bg-rose-950/50";
    case "caution":
      return "border-amber-500/40 bg-amber-950/40";
    case "informative":
      return "border-sky-500/30 bg-sky-950/40";
    default:
      return "border-white/10 bg-slate-950/70";
  }
}

export default function ProductSignalPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<ProductSignalPayload | null>(null);
  const [snapshot, setSnapshot] = useState<InvestorSnapshot | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryPayload | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [copyState, setCopyState] = useState<"text" | "json" | null>(null);
  const [snapshotList, setSnapshotList] = useState<ProductSignalSnapshot[]>([]);
  const [snapshotCompare, setSnapshotCompare] = useState<ProductSignalCompare | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"open" | "monitoring" | "resolved">("open");
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [signalRes, snapshotRes, summaryRes] = await Promise.all([
          fetch("/api/admin/product-signal", { cache: "no-store" }),
          fetch("/api/admin/investor-snapshot", { cache: "no-store" }),
          fetch("/api/analytics/summary?days=30", { cache: "no-store" }),
        ]);
        if (signalRes.status === 403 || snapshotRes.status === 403) throw new Error("Admin access required");
        if (!signalRes.ok || !snapshotRes.ok) throw new Error("Unable to load product signal");
        const [signalPayload, snapshotPayload, summaryPayload] = await Promise.all([
          signalRes.json(),
          snapshotRes.json(),
          summaryRes.json(),
        ]);
        if (!cancelled) {
          setSignal(signalPayload);
          setSnapshot(snapshotPayload);
          setSummary(summaryPayload);
        }
        const [snapshotListRes, snapshotCompareRes] = await Promise.all([
          fetch("/api/admin/product-signal/snapshots?limit=10", { cache: "no-store" }),
          fetch("/api/admin/product-signal/snapshots/compare?days=30", { cache: "no-store" }),
        ]);
        if (!snapshotListRes.ok || !snapshotCompareRes.ok) {
          throw new Error("Unable to load product signal snapshots");
        }
        const [snapshotListPayload, snapshotComparePayload] = await Promise.all([
          snapshotListRes.json(),
          snapshotCompareRes.json(),
        ]);
        if (!cancelled) {
          setSnapshotList(Array.isArray(snapshotListPayload) ? snapshotListPayload : []);
          setSnapshotCompare(snapshotComparePayload);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const generateNarrative = async () => {
    const response = await fetch("/api/admin/generate-product-narrative", { method: "POST" });
    if (!response.ok) return;
    const payload = (await response.json()) as { narrative?: string };
    setNarrative(payload.narrative ?? "");
  };

  const copySnapshot = async () => {
    if (!snapshot) return;
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
  };

  const copyExport = async (format: "text" | "json") => {
    if (!summary) return;
    const content =
      format === "text" ? summary.formattedExports.plainTextBrief : summary.formattedExports.jsonPayload;
    try {
      await navigator.clipboard.writeText(content);
      setCopyState(format);
    } catch {
      setCopyState(null);
    }
  };

  const latestSnapshot = snapshotList[0] ?? null;

  const saveSnapshot = async () => {
    try {
      setSnapshotStatus(null);
      const response = await fetch("/api/admin/product-signal/snapshots?days=30", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Unable to save snapshot");
      }
      const saved = (await response.json()) as ProductSignalSnapshot;
      setSnapshotList((current) => [saved, ...current].slice(0, 10));
      setSnapshotCompare(await (await fetch("/api/admin/product-signal/snapshots/compare?days=30")).json());
      setSnapshotStatus("Snapshot saved.");
    } catch {
      setSnapshotStatus("Snapshot save failed.");
    }
  };

  const saveSnapshotReview = async () => {
    if (!latestSnapshot) return;
    try {
      setSnapshotStatus(null);
      const response = await fetch(
        `/api/admin/product-signal/snapshots/${encodeURIComponent(latestSnapshot.id)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewStatus, reviewNote }),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to save review");
      }
      const updated = (await response.json()) as ProductSignalSnapshot;
      setSnapshotList((current) => [updated, ...current.slice(1)]);
      setSnapshotCompare(
        updated
          ? {
              ...(snapshotCompare ?? {
                hasSnapshot: true,
                latestSnapshotCreatedAt: updated.createdAt,
                latestSnapshotReviewStatus: updated.reviewStatus,
                latestSnapshotReviewNote: updated.reviewNote,
                latestSnapshotReviewedAt: updated.reviewedAt,
                comparisonSummary: "Current Product Signal summary is materially unchanged from the latest saved snapshot.",
                changedFields: [],
              }),
              latestSnapshotCreatedAt: updated.createdAt,
              latestSnapshotReviewStatus: updated.reviewStatus,
              latestSnapshotReviewNote: updated.reviewNote,
              latestSnapshotReviewedAt: updated.reviewedAt,
            }
          : snapshotCompare,
      );
      setSnapshotStatus("Review saved.");
    } catch {
      setSnapshotStatus("Review save failed.");
    }
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Founder Ops</p>
        <h1 className="text-3xl font-semibold text-slate-50">Product Signal</h1>
        <p className="text-sm text-slate-300">Evidence-based product performance and investor-ready snapshot.</p>
      </header>
      {loading ? <p className="text-sm text-slate-300">Loading product signal...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {signal && snapshot ? (
        <>
          {summary ? (
            <section className={`rounded-xl border p-4 ${toneClasses(summary.operatorSummary.tone)}`}>
              <h2 className="text-xl font-semibold text-white">{summary.operatorSummary.headline}</h2>
              <p className="mt-2 text-sm text-slate-200">{summary.operatorSummary.subheadline}</p>
              {summary.operatorSummary.recommendedActionTitle ? (
                <p className="mt-2 text-sm text-slate-100">Next: {summary.operatorSummary.recommendedActionTitle}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-300">{summary.operatorSummary.supportingReason}</p>
            </section>
          ) : null}
          {summary ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Recommended next action</h2>
              <p className="mt-2 text-base font-semibold text-white">{summary.recommendedNextAction.actionTitle}</p>
              <p className="mt-2 text-sm text-slate-300">{summary.recommendedNextAction.actionBody}</p>
            </section>
          ) : null}
          {summary ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Export summary</h2>
              <p className="mt-1 text-xs text-slate-400">
                Window: last {summary.exportMetadata.selectedWindowDays ?? "all"} days · Exported:{" "}
                {summary.exportMetadata.exportedAt}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  onClick={() => void copyExport("text")}
                >
                  Copy plain text
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  onClick={() => void copyExport("json")}
                >
                  Copy JSON
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {copyState === "text"
                  ? "Plain text copied."
                  : copyState === "json"
                    ? "JSON copied."
                    : "Copies the current operator summary for sharing."}
              </p>
            </section>
          ) : null}
          {summary ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Review snapshots</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  onClick={() => void saveSnapshot()}
                >
                  Save snapshot
                </button>
                <p className="text-xs text-slate-400">
                  Most recent snapshot: {latestSnapshot?.createdAt ?? "None yet"}
                </p>
              </div>
              <p className="mt-3 text-sm text-slate-200">
                {snapshotCompare?.comparisonSummary ?? "No saved Product Signal snapshot exists yet."}
              </p>
              {latestSnapshot ? (
                <div className="mt-4 rounded-lg border border-white/10 bg-slate-900/80 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest snapshot review</p>
                  <p className="mt-2 text-sm text-slate-200">
                    Status:{" "}
                    {snapshotCompare?.latestSnapshotReviewStatus ?? latestSnapshot.reviewStatus}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">
                    Note:{" "}
                    {snapshotCompare?.latestSnapshotReviewNote?.trim() || latestSnapshot.reviewNote?.trim() || "No review note yet."}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">
                    Reviewed at:{" "}
                    {snapshotCompare?.latestSnapshotReviewedAt ?? latestSnapshot.reviewedAt ?? "None yet"}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm text-slate-200">
                      <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">Review status</span>
                      <select
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={reviewStatus}
                        onChange={(event) => setReviewStatus(event.target.value as "open" | "monitoring" | "resolved")}
                      >
                        <option value="open">open</option>
                        <option value="monitoring">monitoring</option>
                        <option value="resolved">resolved</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm text-slate-200">
                      <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">Review note</span>
                      <input
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={reviewNote}
                        onChange={(event) => setReviewNote(event.target.value)}
                        placeholder="No review note yet."
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                      onClick={() => void saveSnapshotReview()}
                    >
                      Save review
                    </button>
                  </div>
                </div>
              ) : null}
              {snapshotCompare?.hasSnapshot && snapshotCompare.changedFields.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {snapshotCompare.changedFields.map((field) => (
                    <div
                      key={field.field}
                      className="rounded-lg border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-200"
                    >
                      <p className="font-medium text-white">{field.field}</p>
                      <p className="text-xs text-slate-400">Previous: {String(field.previousValue ?? "None")}</p>
                      <p className="text-xs text-slate-400">Current: {String(field.currentValue ?? "None")}</p>
                    </div>
                  ))}
                </div>
              ) : snapshotCompare?.hasSnapshot ? (
                <p className="mt-3 text-xs text-slate-400">No changed fields to review.</p>
              ) : null}
            </section>
          ) : null}
          {summary ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Results to Studio conversion</h2>
              <p className="mt-1 text-sm text-slate-300">
                Signals from the new Results improvement module and Studio intent actions.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Module views</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{summary.resultsImprovementModuleViews}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">CTA clicks</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{summary.resultsImprovementCtaClicks}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Results improvement CTA rate: {(summary.resultsImprovementCtaRate * 100).toFixed(1)}% ·{" "}
                    {formatTrendComparison(summary.resultsImprovementCtaRate, summary.trendContext.resultsImprovementCtaRate)}
                  </p>
                </article>
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Artifact used intent</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{summary.artifactUsedIntents}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Artifact to opportunity commit rate: {(summary.artifactToOpportunityCommitRate * 100).toFixed(1)}% ·{" "}
                    {formatTrendComparison(
                      summary.artifactToOpportunityCommitRate,
                      summary.trendContext.artifactToOpportunityCommitRate,
                    )}
                  </p>
                </article>
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Opportunity commit intent</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{summary.opportunityCommitIntents}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Refine vs commit split: {(summary.refineIntentShare * 100).toFixed(1)}% refine ·{" "}
                    {formatTrendComparison(summary.refineIntentShare, summary.trendContext.refineIntentShare)}
                  </p>
                </article>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Refine intents: {summary.artifactRefineIntents}
              </p>
            </section>
          ) : null}
          {summary ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Weakest funnel step</h2>
              {summary.weakestStep.weakestStepLabel ? (
                <p className="mt-1 text-sm text-slate-300">{summary.weakestStep.weakestStepLabel}</p>
              ) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Current rate</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {(summary.weakestStep.weakestStepRate * 100).toFixed(1)}%
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Previous rate: {(summary.weakestStep.weakestStepPreviousRate * 100).toFixed(1)}%
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Delta vs prior period: {(summary.weakestStep.weakestStepDelta * 100).toFixed(1)} pts
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Trend:{" "}
                    {summary.weakestStep.weakestStepDirection.charAt(0).toUpperCase() +
                      summary.weakestStep.weakestStepDirection.slice(1)}
                  </p>
                </article>
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Benchmark</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {(summary.weakestStep.benchmarkStepRate * 100).toFixed(1)}%
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Gap vs strongest active step: {(summary.weakestStep.relativeDrop * 100).toFixed(1)} pts
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Sample: {summary.weakestStep.weakestStepNumerator} / {summary.weakestStep.weakestStepDenominator}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Previous sample: {summary.weakestStep.weakestStepPreviousNumerator} /{" "}
                    {summary.weakestStep.weakestStepPreviousDenominator}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Severity: {summary.weakestStep.severity}</p>
                  <p className="mt-1 text-xs text-slate-400">Confidence: {summary.weakestStep.confidence}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Watchlist status:{" "}
                    {summary.weakestStep.watchlistStatus === "action_needed"
                      ? "Action needed"
                      : summary.weakestStep.watchlistStatus.charAt(0).toUpperCase() +
                        summary.weakestStep.watchlistStatus.slice(1)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Priority:{" "}
                    {summary.weakestStep.watchlistPriority === "none"
                      ? "None"
                      : summary.weakestStep.watchlistPriority.charAt(0).toUpperCase() +
                        summary.weakestStep.watchlistPriority.slice(1)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{summary.weakestStep.watchlistReason}</p>
                  <p className="mt-1 text-xs text-slate-400">{summary.weakestStep.confidenceReason}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recommendation</p>
                  <p className="mt-2 text-base font-semibold text-white">{summary.weakestStep.recommendationTitle}</p>
                  <p className="mt-2 text-sm text-slate-300">{summary.weakestStep.recommendationBody}</p>
                  <p className="mt-2 text-xs text-slate-400">{summary.weakestStep.weakestStepTrendReason}</p>
                </article>
              </div>
              {summary.weakestStep.weakestStepKey === null ? (
                <p className="mt-3 text-xs text-slate-400">
                  There is not enough current period funnel activity to identify a weak point.
                </p>
              ) : null}
            </section>
          ) : null}
          {summary ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Release context</h2>
              <p className="mt-1 text-sm text-slate-300">{summary.weakestStepReleaseContext.releaseContextSummary}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Relevant current window releases</p>
                  {summary.weakestStepReleaseContext.relevantCurrentWindowReleases.length > 0 ? (
                    <ul className="mt-2 space-y-3 text-sm text-slate-200">
                      {summary.weakestStepReleaseContext.relevantCurrentWindowReleases.map((release) => (
                        <li key={release.id}>
                          <p className="font-medium text-white">{release.label}</p>
                          <p className="text-xs text-slate-400">
                            {release.date} · {release.type}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">{release.notes}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-300">None in current window</p>
                  )}
                </article>
                <article className="rounded-lg border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Relevant previous window releases</p>
                  {summary.weakestStepReleaseContext.relevantPreviousWindowReleases.length > 0 ? (
                    <ul className="mt-2 space-y-3 text-sm text-slate-200">
                      {summary.weakestStepReleaseContext.relevantPreviousWindowReleases.map((release) => (
                        <li key={release.id}>
                          <p className="font-medium text-white">{release.label}</p>
                          <p className="text-xs text-slate-400">
                            {release.date} · {release.type}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">{release.notes}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-300">None in previous window</p>
                  )}
                </article>
              </div>
            </section>
          ) : null}

          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">% reached analysis</p><p className="text-2xl text-white">{signal.keyConversions.reachedAnalysisPercent}%</p></div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">% reached 70+</p><p className="text-2xl text-white">{signal.keyConversions.reachedHighScorePercent}%</p></div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">% created opportunity</p><p className="text-2xl text-white">{signal.keyConversions.createdOpportunityPercent}%</p></div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs uppercase text-slate-400">% generated documents</p><p className="text-2xl text-white">{signal.keyConversions.generatedDocumentsPercent}%</p></div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Top Bottleneck</h2>
              <p className="mt-2 text-sm text-slate-200">{toLabel(signal.topBottleneck)}</p>
            </article>
            <article className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="text-lg font-semibold text-white">Biggest Recovery Driver</h2>
              <p className="mt-2 text-sm text-slate-200">{toLabel(signal.biggestRecoveryDriver)}</p>
            </article>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">Friction Hotspots (Top 5)</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              {signal.frictionHotspots.map((item) => (
                <li key={item.label}>{item.label}: {item.count}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <h2 className="text-lg font-semibold text-white">Engagement Trigger Distribution</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              {Object.entries(signal.triggerDistribution).map(([k, v]) => (
                <li key={k}>{toLabel(k)}: {v}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Investor Snapshot</h2>
              <button
                type="button"
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                onClick={() => void copySnapshot()}
              >
                Copy snapshot
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-200">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Product Narrative</h2>
              <button
                type="button"
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                onClick={() => void generateNarrative()}
              >
                Generate narrative
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-200">{narrative || "No narrative generated yet."}</p>
          </section>
        </>
      ) : null}
    </section>
  );
}

