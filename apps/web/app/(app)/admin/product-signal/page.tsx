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

function toLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export default function ProductSignalPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<ProductSignalPayload | null>(null);
  const [snapshot, setSnapshot] = useState<InvestorSnapshot | null>(null);
  const [narrative, setNarrative] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [signalRes, snapshotRes] = await Promise.all([
          fetch("/api/admin/product-signal", { cache: "no-store" }),
          fetch("/api/admin/investor-snapshot", { cache: "no-store" }),
        ]);
        if (signalRes.status === 403 || snapshotRes.status === 403) throw new Error("Admin access required");
        if (!signalRes.ok || !snapshotRes.ok) throw new Error("Unable to load product signal");
        const [signalPayload, snapshotPayload] = await Promise.all([signalRes.json(), snapshotRes.json()]);
        if (!cancelled) {
          setSignal(signalPayload);
          setSnapshot(snapshotPayload);
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

