import Link from "next/link";
import { adminServerFetch } from "../_lib/adminServerFetch";
import { RELEASE_ANNOTATIONS, type ReleaseAnnotation } from "./releaseAnnotations";

type RangeKey = "7d" | "14d" | "30d" | "all";

type FunnelStage = {
  label: string;
  count: number;
  conversionFromPrevious: number | null;
};

type FounderMetricsResponse = {
  range: {
    key: RangeKey;
    days: number | null;
    granularity: "day" | "week";
    startAt: string;
    endAt: string;
  };
  lastUpdatedAt: string;
  funnel: FunnelStage[];
  metrics: {
    visitorToAnalysisConversion: number;
    analysisCompletionRate: number;
    resultToAccountConversion: number;
    secondAnalysisRate: number;
    visitors: number;
    analysesStarted: number;
    analysesCompleted: number;
    accountsCreated: number;
    usersWithAtLeastOneAnalysis: number;
    usersWithTwoOrMoreAnalyses: number;
    averageAnalysesPerActiveUser: number;
  };
  previousPeriod: {
    visitorToAnalysisConversion: number;
    analysisCompletionRate: number;
    resultToAccountConversion: number;
    secondAnalysisRate: number;
    visitors: number;
    analysesStarted: number;
    analysesCompleted: number;
    accountsCreated: number;
  } | null;
  trends: {
    volume: Array<{
      bucketStart: string;
      bucketLabel: string;
      visitors: number;
      analysesStarted: number;
      analysesCompleted: number;
      accountsCreated: number;
    }>;
    conversion: Array<{
      bucketStart: string;
      bucketLabel: string;
      visitorToAnalysisConversion: number;
      analysisCompletionRate: number;
      resultToAccountConversion: number;
      secondAnalysisRate: number;
    }>;
  };
  supportingSignals: {
    resumeUploadRate: number;
    resumeUploads: number;
    sampleRoleUsage: number;
    averageTimeToFirstAnalysisSeconds: number;
  };
};

type AdminMetricsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatDelta(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const delta = ((current - previous) / previous) * 100;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  if (direction === "flat") return "flat vs prior period";
  return `${direction} ${Math.abs(delta).toFixed(1)}% vs prior period`;
}

function TrendBars(props: {
  title: string;
  values: Array<{ label: string; value: number }>;
  formatter?: (value: number) => string;
  emptyText?: string;
}) {
  const max = props.values.reduce((acc, item) => Math.max(acc, item.value), 0);
  if (!props.values.length || max <= 0) {
    return (
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <p className="text-sm font-medium text-slate-300">{props.title}</p>
        <p className="mt-3 text-sm text-slate-400">
          {props.emptyText ?? "Not enough data yet to show a trend."}
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-sm font-medium text-slate-300">{props.title}</p>
      <div className="mt-4 space-y-2">
        {props.values.map((item) => (
          <div key={`${props.title}-${item.label}`} className="grid grid-cols-[52px_1fr_auto] items-center gap-3">
            <p className="text-xs text-slate-400">{item.label}</p>
            <div className="h-2 rounded bg-slate-800">
              <div
                className="h-2 rounded bg-emerald-300/80"
                style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-200">{props.formatter ? props.formatter(item.value) : formatNumber(item.value)}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

async function loadMetrics(range: RangeKey): Promise<FounderMetricsResponse> {
  return adminServerFetch<FounderMetricsResponse>(
    `/analytics/metrics?range=${encodeURIComponent(range)}`,
    "Load admin metrics",
  );
}

function filterAnnotations(
  annotations: ReleaseAnnotation[],
  startAt: string,
  endAt: string,
): ReleaseAnnotation[] {
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  return annotations.filter((item) => {
    const itemMs = new Date(`${item.date}T00:00:00.000Z`).getTime();
    return Number.isFinite(itemMs) && itemMs >= startMs && itemMs <= endMs;
  });
}

function KpiCard(props: {
  title: string;
  value: number;
  deltaText: string | null;
}) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{props.title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-50">{formatNumber(props.value)}</p>
      {props.deltaText ? <p className="mt-2 text-sm text-slate-300">{props.deltaText}</p> : null}
    </article>
  );
}

function FunnelStageCard({ stage }: { stage: FunnelStage }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{stage.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{formatNumber(stage.count)}</p>
      <p className="mt-2 text-sm text-slate-300">
        {stage.conversionFromPrevious === null
          ? "Base stage"
          : `${formatPercent(stage.conversionFromPrevious)} from previous stage`}
      </p>
    </article>
  );
}

function MetricCard(props: { title: string; percent: number; detail: string }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-sm font-medium text-slate-300">{props.title}</p>
      <p className="mt-2 text-4xl font-semibold text-slate-50">{formatPercent(props.percent)}</p>
      <p className="mt-2 text-sm text-slate-400">{props.detail}</p>
    </article>
  );
}

export default async function AdminMetricsPage({ searchParams }: AdminMetricsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedRange = resolvedSearchParams.range;
  const range =
    typeof requestedRange === "string" && ["7d", "14d", "30d", "all"].includes(requestedRange)
      ? (requestedRange as RangeKey)
      : "7d";

  try {
    const data = await loadMetrics(range);
    const { funnel, metrics, supportingSignals, previousPeriod, trends, lastUpdatedAt } = data;
    const visibleAnnotations = filterAnnotations(
      RELEASE_ANNOTATIONS,
      data.range.startAt,
      data.range.endAt,
    );

    const kpiCards = [
      {
        title: "Visitors",
        value: metrics.visitors,
        deltaText: previousPeriod ? formatDelta(metrics.visitors, previousPeriod.visitors) : null,
      },
      {
        title: "Analyses Started",
        value: metrics.analysesStarted,
        deltaText: previousPeriod
          ? formatDelta(metrics.analysesStarted, previousPeriod.analysesStarted)
          : null,
      },
      {
        title: "Analyses Completed",
        value: metrics.analysesCompleted,
        deltaText: previousPeriod
          ? formatDelta(metrics.analysesCompleted, previousPeriod.analysesCompleted)
          : null,
      },
      {
        title: "Accounts Created",
        value: metrics.accountsCreated,
        deltaText: previousPeriod
          ? formatDelta(metrics.accountsCreated, previousPeriod.accountsCreated)
          : null,
      },
    ];

    return (
      <div className="space-y-7">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Metrics</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Beta Funnel Dashboard</h1>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: "7d", label: "Last 7 days" },
              { key: "14d", label: "Last 14 days" },
              { key: "30d", label: "Last 30 days" },
              { key: "all", label: "All time" },
            ] as const).map((preset) => {
              const active = data.range.key === preset.key;
              return (
                <Link
                  key={preset.key}
                  href={`/admin/metrics?range=${preset.key}`}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "border border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  {preset.label}
                </Link>
              );
            })}
          </div>
          <p className="text-sm text-slate-400">Last updated: {formatTimestamp(lastUpdatedAt)}</p>
        </header>

        <section className="grid gap-4 lg:grid-cols-4">
          {kpiCards.map((item) => (
            <KpiCard key={item.title} title={item.title} value={item.value} deltaText={item.deltaText} />
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">Core Funnel</h2>
          <div className="grid gap-3 lg:grid-cols-4">
            {funnel.map((stage) => (
              <FunnelStageCard key={stage.label} stage={stage} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">Release Annotations</h2>
          {visibleAnnotations.length ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <ul className="space-y-2">
                {visibleAnnotations.map((item) => (
                  <li key={`${item.date}-${item.title}`} className="text-sm text-slate-300">
                    <span className="font-semibold text-slate-100">{item.date}</span> - {item.title}
                    {item.note ? <span className="text-slate-400"> ({item.note})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No release annotations in this period.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">Trend</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            <TrendBars
              title="Visitors"
              values={trends.volume.map((item) => ({ label: item.bucketLabel, value: item.visitors }))}
            />
            <TrendBars
              title="Analyses Started"
              values={trends.volume.map((item) => ({ label: item.bucketLabel, value: item.analysesStarted }))}
            />
            <TrendBars
              title="Analyses Completed"
              values={trends.volume.map((item) => ({ label: item.bucketLabel, value: item.analysesCompleted }))}
            />
            <TrendBars
              title="Accounts Created"
              values={trends.volume.map((item) => ({ label: item.bucketLabel, value: item.accountsCreated }))}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">Conversion Trend</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            <TrendBars
              title="Visitor to Analysis Conversion"
              values={trends.conversion.map((item) => ({
                label: item.bucketLabel,
                value: item.visitorToAnalysisConversion,
              }))}
              formatter={formatPercent}
            />
            <TrendBars
              title="Analysis Completion Rate"
              values={trends.conversion.map((item) => ({
                label: item.bucketLabel,
                value: item.analysisCompletionRate,
              }))}
              formatter={formatPercent}
            />
            <TrendBars
              title="Result to Account Conversion"
              values={trends.conversion.map((item) => ({
                label: item.bucketLabel,
                value: item.resultToAccountConversion,
              }))}
              formatter={formatPercent}
            />
            <TrendBars
              title="Second Analysis Rate"
              values={trends.conversion.map((item) => ({
                label: item.bucketLabel,
                value: item.secondAnalysisRate,
              }))}
              formatter={formatPercent}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">Key Conversion Metrics</h2>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Visitor to Analysis Conversion"
              percent={metrics.visitorToAnalysisConversion}
              detail={`${formatNumber(metrics.analysesStarted)} analyses started / ${formatNumber(metrics.visitors)} visitors`}
            />
            <MetricCard
              title="Analysis Completion Rate"
              percent={metrics.analysisCompletionRate}
              detail={`${formatNumber(metrics.analysesCompleted)} analyses completed / ${formatNumber(metrics.analysesStarted)} analyses started`}
            />
            <MetricCard
              title="Result to Account Conversion"
              percent={metrics.resultToAccountConversion}
              detail={`${formatNumber(metrics.accountsCreated)} accounts created / ${formatNumber(metrics.analysesCompleted)} analyses completed`}
            />
            <MetricCard
              title="Second Analysis Rate"
              percent={metrics.secondAnalysisRate}
              detail={`${formatNumber(metrics.usersWithTwoOrMoreAnalyses)} of ${formatNumber(metrics.usersWithAtLeastOneAnalysis)} users ran another analysis`}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">Supporting Signals</h2>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm font-medium text-slate-300">Resume Upload Rate</p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">{formatPercent(supportingSignals.resumeUploadRate)}</p>
              <p className="mt-2 text-sm text-slate-400">
                {formatNumber(supportingSignals.resumeUploads)} uploads / {formatNumber(metrics.analysesStarted)} analyses started
              </p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm font-medium text-slate-300">Sample Role Usage</p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">{formatNumber(supportingSignals.sampleRoleUsage)}</p>
              <p className="mt-2 text-sm text-slate-400">
                Sample role clicks or closest in-session proxy events
              </p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm font-medium text-slate-300">Average Time to First Analysis</p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">
                {supportingSignals.averageTimeToFirstAnalysisSeconds.toFixed(1)}s
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Average seconds from landing view to first analysis start
              </p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm font-medium text-slate-300">Average Analyses per Active User</p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">
                {metrics.averageAnalysesPerActiveUser.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Analyses started / users with at least one analysis
              </p>
            </article>
          </div>
        </section>
      </div>
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to load metrics.";
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Metrics</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Beta Funnel Dashboard</h1>
        </header>
        <section className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
          Unable to load metrics: {message}
        </section>
      </div>
    );
  }
}
