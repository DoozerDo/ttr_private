"use client";

type OpportunityAreaScore = {
  id: string;
  label: string;
  score: number;
};

type OpportunityRadarChartProps = {
  areas: OpportunityAreaScore[];
};

const CHART_SIZE = 340;
const CENTER = CHART_SIZE / 2;
const RADIUS = 112;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function polarToCartesian(angle: number, radius: number) {
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function buildRingPolygonPointString(count: number, factor: number): string {
  const points: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const point = polarToCartesian(angle, RADIUS * factor);
    points.push(`${point.x},${point.y}`);
  }
  return points.join(" ");
}

export function OpportunityRadarChart({ areas }: OpportunityRadarChartProps) {
  const normalized = areas.slice(0, 6).map((area) => ({
    ...area,
    score: clamp(area.score),
  }));

  if (!normalized.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5 text-sm text-slate-400">
        Opportunity radar is not available for this analysis.
      </div>
    );
  }

  const polygonPoints = normalized
    .map((area, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / normalized.length;
      const point = polarToCartesian(angle, RADIUS * (area.score / 100));
      return `${point.x},${point.y}`;
    })
    .join(" ");

  const rings = [1, 0.8, 0.6, 0.4];
  const topAreas = [...normalized].sort((a, b) => b.score - a.score).slice(0, 3);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:items-start">
        <div className="mx-auto w-full max-w-[340px]">
          <svg viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} className="h-auto w-full" role="img" aria-label="Opportunity map radar chart">
            {rings.map((ring) => (
              <polygon
                key={`ring-${ring}`}
                points={buildRingPolygonPointString(normalized.length, ring)}
                fill="none"
                stroke="rgba(148,163,184,0.3)"
                strokeWidth="1"
              />
            ))}

            {normalized.map((area, index) => {
              const angle = -Math.PI / 2 + (index * 2 * Math.PI) / normalized.length;
              const edge = polarToCartesian(angle, RADIUS);
              const labelPoint = polarToCartesian(angle, RADIUS + 24);
              return (
                <g key={`axis-${area.id}`}>
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={edge.x}
                    y2={edge.y}
                    stroke="rgba(148,163,184,0.24)"
                    strokeWidth="1"
                  />
                  <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle" fontSize="9" fill="rgb(148,163,184)">
                    {area.label}
                  </text>
                </g>
              );
            })}

            <polygon points={polygonPoints} fill="rgba(56,189,248,0.2)" stroke="rgba(56,189,248,0.95)" strokeWidth="2" />
          </svg>
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Viable Role Areas</p>
          {topAreas.map((area) => (
            <div key={`top-${area.id}`} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-100">{area.label}</p>
                <p className="text-sm font-semibold text-sky-200">{Math.round(area.score)}</p>
              </div>
              <div className="mt-2 h-1.5 rounded bg-slate-800">
                <div className="h-1.5 rounded bg-sky-300/85" style={{ width: `${area.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
