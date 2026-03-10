import type { OpportunityEntry } from "@/src/data/opportunityPreview";

type OpportunityRadarChartProps = {
  scores: OpportunityEntry[];
  revealed: boolean;
};

const MAX_SCORE = 100;
const CENTER_X = 180;
const CENTER_Y = 170;
const RADIUS = 120;

function polarPoint(angle: number, radius: number) {
  const x = CENTER_X + Math.cos(angle) * radius;
  const y = CENTER_Y + Math.sin(angle) * radius;
  return `${x},${y}`;
}

function buildPolygonPoints(count: number, factor: number) {
  const points: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    points.push(polarPoint(angle, RADIUS * factor));
  }
  return points.join(" ");
}

function buildDataPoints(scores: OpportunityEntry[]) {
  const points: string[] = [];
  for (let index = 0; index < scores.length; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / scores.length;
    const scoreFactor = Math.max(0, Math.min(MAX_SCORE, scores[index].score)) / MAX_SCORE;
    points.push(polarPoint(angle, RADIUS * scoreFactor));
  }
  return points.join(" ");
}

export function OpportunityRadarChart({ scores, revealed }: OpportunityRadarChartProps) {
  const rings = [0.25, 0.5, 0.75, 1];
  const axisLines = scores.map((score, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / scores.length;
    const end = polarPoint(angle, RADIUS);
    return {
      key: `${score.industry}-${index}`,
      end,
      labelX: CENTER_X + Math.cos(angle) * (RADIUS + 26),
      labelY: CENTER_Y + Math.sin(angle) * (RADIUS + 26),
      label: score.industry,
    };
  });

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Opportunity Radar</p>
      <svg viewBox="0 0 360 340" className="mt-4 h-auto w-full" role="img" aria-label="Opportunity radar chart">
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={buildPolygonPoints(scores.length, ring)}
            fill="none"
            stroke="rgba(148,163,184,0.2)"
            strokeWidth="1"
          />
        ))}

        {axisLines.map((axis) => (
          <g key={axis.key}>
            <line x1={CENTER_X} y1={CENTER_Y} x2={axis.end.split(",")[0]} y2={axis.end.split(",")[1]} stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
            <text
              x={axis.labelX}
              y={axis.labelY}
              textAnchor="middle"
              fontSize="9"
              fill="rgb(148,163,184)"
            >
              {axis.label}
            </text>
          </g>
        ))}

        <g
          style={{
            transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
            transform: revealed ? "scale(1)" : "scale(0.45)",
            opacity: revealed ? 1 : 0.35,
            transition: "transform 700ms ease, opacity 700ms ease",
          }}
        >
          <polygon
            points={buildDataPoints(scores)}
            fill="rgba(34,197,94,0.20)"
            stroke="rgb(74,222,128)"
            strokeWidth="2"
          />
        </g>
      </svg>
    </div>
  );
}
