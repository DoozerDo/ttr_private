"use client";

import { useMemo, useState } from "react";

import type { RadarOpportunityEntry } from "@/src/data/opportunityPreview";

type OpportunityRadarChartProps = {
  scores: RadarOpportunityEntry[];
  revealed: boolean;
};

const MAX_SCORE = 100;
const CENTER_X = 180;
const CENTER_Y = 170;
const RADIUS = 120;

function polarPoint(angle: number, radius: number) {
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function buildPolygonPoints(count: number, factor: number) {
  const points: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const point = polarPoint(angle, RADIUS * factor);
    points.push(`${point.x},${point.y}`);
  }
  return points.join(" ");
}

function buildDataPoints(scores: RadarOpportunityEntry[]) {
  const points: string[] = [];
  for (let index = 0; index < scores.length; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / scores.length;
    const scoreFactor = Math.max(0, Math.min(MAX_SCORE, scores[index].score)) / MAX_SCORE;
    const point = polarPoint(angle, RADIUS * scoreFactor);
    points.push(`${point.x},${point.y}`);
  }
  return points.join(" ");
}

export function OpportunityRadarChart({ scores, revealed }: OpportunityRadarChartProps) {
  const [hoveredIndustry, setHoveredIndustry] = useState<string | null>(null);

  const strongestOpportunity = useMemo(
    () => scores.reduce((max, entry) => (entry.score > max.score ? entry : max), scores[0]),
    [scores],
  );
  const rankedTopThree = useMemo(
    () => [...scores].sort((a, b) => b.score - a.score).slice(0, 3),
    [scores],
  );

  const selected = useMemo(() => {
    if (!hoveredIndustry) return strongestOpportunity;
    return scores.find((entry) => entry.industry === hoveredIndustry) ?? strongestOpportunity;
  }, [hoveredIndustry, scores, strongestOpportunity]);

  const rings = [
    { factor: 1, label: "100" },
    { factor: 0.8, label: "80" },
    { factor: 0.6, label: "60" },
    { factor: 0.4, label: "40" },
  ];
  const axisLines = scores.map((score, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / scores.length;
    const end = polarPoint(angle, RADIUS);
    const node = polarPoint(angle, RADIUS * (score.score / 100));
    const lineLength = Math.hypot(end.x - CENTER_X, end.y - CENTER_Y);
    return {
      key: `${score.industry}-${index}`,
      end,
      node,
      lineLength,
      index,
      labelX: CENTER_X + Math.cos(angle) * (RADIUS + 26),
      labelY: CENTER_Y + Math.sin(angle) * (RADIUS + 26),
      label: score.industry,
      score: score.score,
    };
  });

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Opportunity Radar</p>
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Strongest Opportunity</p>
          <p className="text-sm font-semibold text-emerald-100">{strongestOpportunity.industry}</p>
          <p className="text-xs text-emerald-200">{strongestOpportunity.score}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 lg:hidden">
        {rankedTopThree.map((entry) => (
          <div key={entry.industry} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <div className="flex items-center justify-between text-sm">
              <p className="font-semibold text-slate-100">{entry.industry}</p>
              <span className="text-xs font-semibold text-emerald-200">{entry.score}</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-400/85" style={{ width: `${entry.score}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_180px]">
        <svg viewBox="0 0 360 340" className="h-auto w-full" role="img" aria-label="Opportunity radar chart">
          {rings.map((ring, ringIndex) => (
            <g key={ring.label}>
              <polygon
                points={buildPolygonPoints(scores.length, ring.factor)}
                fill="none"
                stroke="rgba(148,163,184,0.22)"
                strokeWidth="1"
                style={{
                  opacity: revealed ? 1 : 0,
                  transition: "opacity 180ms ease",
                  transitionDelay: `${ringIndex * 80}ms`,
                }}
              />
              <text
                x={CENTER_X + 5}
                y={CENTER_Y - RADIUS * ring.factor + 10}
                fontSize="9"
                fill="rgb(148,163,184)"
                style={{
                  opacity: revealed ? 1 : 0,
                  transition: "opacity 180ms ease",
                  transitionDelay: `${ringIndex * 80}ms`,
                }}
              >
                {ring.label}
              </text>
            </g>
          ))}

          {axisLines.map((axis) => (
            <g key={axis.key}>
              <line
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={axis.end.x}
                y2={axis.end.y}
                stroke="rgba(148,163,184,0.35)"
                strokeWidth="1"
                strokeDasharray={axis.lineLength}
                strokeDashoffset={revealed ? 0 : axis.lineLength}
                style={{
                  transition: "stroke-dashoffset 220ms ease",
                  transitionDelay: `${180 + axis.index * 45}ms`,
                }}
              />
              <text
                x={axis.labelX}
                y={axis.labelY}
                textAnchor="middle"
                fontSize="9"
                fill={selected.industry === axis.label ? "rgb(226,232,240)" : "rgb(148,163,184)"}
              >
                {axis.label}
              </text>
            </g>
          ))}

          <g
            style={{
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
              transform: revealed ? "scale(1)" : "scale(0.75)",
              opacity: revealed ? 1 : 0,
              transition: "transform 240ms ease, opacity 220ms ease",
              transitionDelay: "420ms",
            }}
          >
            <polygon
              points={buildDataPoints(scores)}
              fill="rgba(34,197,94,0.16)"
              stroke="rgba(74,222,128,0.85)"
              strokeWidth="2"
            />
          </g>

          {axisLines.map((axis) => {
            const isSelected = selected.industry === axis.label;
            return (
              <g key={`${axis.key}-node`}>
                <circle
                  cx={axis.node.x}
                  cy={axis.node.y}
                  r={isSelected ? 6 : 4}
                  fill={isSelected ? "rgb(110,231,183)" : "rgb(45,212,191)"}
                  opacity={revealed ? 1 : 0}
                  style={{
                    transition: "r 140ms ease, fill 140ms ease, filter 160ms ease, opacity 200ms ease",
                    transitionDelay: `${460 + axis.index * 35}ms`,
                    filter: isSelected ? "drop-shadow(0 0 8px rgba(16,185,129,0.9))" : "drop-shadow(0 0 4px rgba(45,212,191,0.6))",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHoveredIndustry(axis.label)}
                />
              </g>
            );
          })}
        </svg>

        <aside className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{selected.industry}</p>
          <p className="mt-2 text-sm font-semibold text-white">Opportunity Score {selected.score}</p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Signals</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-200">
            {selected.signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
