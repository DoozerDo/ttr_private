"use client";

import { CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS } from "@/lib/careerAdjacencyRadar";

const RADAR_AXIS_LAYOUTS = [
  { x: 180, y: 18 },
  { x: 292, y: 90 },
  { x: 262, y: 238 },
  { x: 180, y: 300 },
  { x: 78, y: 238 },
  { x: 48, y: 90 },
] as const;

const RADAR_AXES = CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS.map((axis, index) => ({
  label: axis.teaserLabel,
  x: RADAR_AXIS_LAYOUTS[index]!.x,
  y: RADAR_AXIS_LAYOUTS[index]!.y,
}));

const RADAR_POLYGON = "180,54 250,97 238,203 180,246 121,203 110,97";

export function LandingAdjacencyRadarTeaser() {
  return (
    <section
      data-testid="landing-adjacency-radar-teaser"
      className="rounded-[24px] bg-slate-950/45 px-4 py-5 md:px-5 md:py-6"
    >
      <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-[1.9rem]">
            Where you actually win
          </h2>
          <p className="max-w-xl text-sm leading-7 text-slate-200 md:text-[0.98rem]">
            We show where your background gives you the clearest edge.
          </p>
        </div>

        <div className="rounded-[20px] bg-slate-900/25 p-3 md:p-3.5">
          <div className="mx-auto max-w-[400px]">
            <svg
              viewBox="0 0 360 320"
              className="h-auto w-full"
              role="img"
              aria-label="Static career adjacency radar teaser"
            >
              <polygon
                points="180,42 255,92 241,198 180,236 119,198 105,92"
                fill="none"
                stroke="rgba(148,163,184,0.22)"
                strokeWidth="1"
              />
              <polygon
                points="180,82 231,107 220,182 180,218 140,182 129,107"
                fill="rgba(125,211,252,0.12)"
                stroke="rgba(125,211,252,0.7)"
                strokeWidth="2"
              />
              <polygon
                points={RADAR_POLYGON}
                fill="rgba(96,165,250,0.18)"
                stroke="rgba(147,197,253,0.9)"
                strokeWidth="2.5"
              />
              {RADAR_AXES.map((axis, index) => {
                const angle = -Math.PI / 2 + (index * 2 * Math.PI) / RADAR_AXES.length;
                const x2 = 180 + Math.cos(angle) * 126;
                const y2 = 160 + Math.sin(angle) * 126;
                return (
                  <g key={axis.label}>
                    <line
                      x1="180"
                      y1="160"
                      x2={x2}
                      y2={y2}
                      stroke="rgba(148,163,184,0.2)"
                      strokeWidth="1"
                    />
                    <circle cx={axis.x} cy={axis.y} r="4" fill="rgba(226,232,240,0.95)" />
                    <text
                      x={axis.x}
                      y={axis.y}
                      dy={axis.y < 160 ? -10 : 14}
                      textAnchor="middle"
                      className="fill-slate-400"
                      style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}
                    >
                      {axis.label}
                    </text>
                  </g>
                );
              })}
              <circle cx="180" cy="160" r="3" fill="rgba(255,255,255,0.9)" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
