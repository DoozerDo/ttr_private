"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { trackEvent } from "@/src/lib/analytics";
import {
  buildCareerAdjacencyRadarDimensions,
  type ScoreBreakdownLike,
  type CareerAdjacencyRadarDimension,
} from "@/lib/careerAdjacencyRadar";

type CareerAdjacencyRadarProps = {
  analysisId: string | null;
  score: number | null;
  scoreBreakdown: ScoreBreakdownLike | null;
};

function resolveScoreBucket(score: number | null): "under_60" | "60s" | "70s" | "80s" | "90_plus" | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 90) return "90_plus";
  if (score >= 80) return "80s";
  if (score >= 70) return "70s";
  if (score >= 60) return "60s";
  return "under_60";
}

function toPolarPoint(
  centerX: number,
  centerY: number,
  radius: number,
  angleRadians: number,
): { x: number; y: number } {
  return {
    x: centerX + Math.cos(angleRadians) * radius,
    y: centerY + Math.sin(angleRadians) * radius,
  };
}

export function CareerAdjacencyRadar({
  analysisId,
  score,
  scoreBreakdown,
}: CareerAdjacencyRadarProps) {
  const radarDimensions = useMemo(
    () => buildCareerAdjacencyRadarDimensions(scoreBreakdown),
    [scoreBreakdown],
  );
  const [activeDimensionKey, setActiveDimensionKey] = useState<string | null>(null);
  const viewedAnalysisRef = useRef<string | null>(null);
  const hoveredDimensionKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!analysisId || !radarDimensions.length) return;
    if (viewedAnalysisRef.current === analysisId) return;
    viewedAnalysisRef.current = analysisId;

    trackEvent("results_radar_viewed", {
      source: "results",
      analysisId,
      score,
      scoreBucket: resolveScoreBucket(score),
      axisCount: radarDimensions.length,
    });
  }, [analysisId, radarDimensions.length, score]);

  if (!radarDimensions.length) return null;

  const centerX = 160;
  const centerY = 160;
  const maxRadius = 112;
  const axisCount = radarDimensions.length;
  const angleOffset = -Math.PI / 2;

  const gridRings = [0.25, 0.5, 0.75, 1];
  const gridPolygons = gridRings.map((ring) =>
    radarDimensions
      .map((_, index) => {
        const angle = angleOffset + (Math.PI * 2 * index) / axisCount;
        const point = toPolarPoint(centerX, centerY, maxRadius * ring, angle);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      })
      .join(" "),
  );

  const axisPoints = radarDimensions.map((dimension, index) => {
    const angle = angleOffset + (Math.PI * 2 * index) / axisCount;
    const radius = (dimension.value / 100) * maxRadius;
    const point = toPolarPoint(centerX, centerY, radius, angle);
    return {
      ...dimension,
      x: point.x,
      y: point.y,
      angle,
    };
  });

  const radarPolygonPoints = axisPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

  const handleAxisInteraction = (dimension: CareerAdjacencyRadarDimension) => {
    setActiveDimensionKey(dimension.key);
    if (hoveredDimensionKeysRef.current.has(dimension.key)) return;
    hoveredDimensionKeysRef.current.add(dimension.key);
    trackEvent("results_radar_axis_hovered", {
      source: "results",
      analysisId,
      axisKey: dimension.key,
      axisLabel: dimension.label,
      value: dimension.value,
      scoreBucket: resolveScoreBucket(score),
    });
  };

  return (
    <section
      data-testid="career-adjacency-radar"
      className="space-y-4 rounded-[24px] border border-white/10 bg-slate-900/30 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Where You're Strongest
        </p>
        <p className="max-w-2xl text-sm leading-6 text-slate-300">
          Your experience translates across these adjacent areas
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr] lg:items-start">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.12),transparent_62%)]" />
          <svg
            viewBox="0 0 320 320"
            className="relative mx-auto block h-auto w-full max-w-[320px]"
            role="img"
            aria-label="Career adjacency radar"
          >
            <defs>
              <linearGradient id="career-radar-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(125, 211, 252, 0.42)" />
                <stop offset="100%" stopColor="rgba(96, 165, 250, 0.22)" />
              </linearGradient>
            </defs>
            {gridPolygons.map((points, index) => (
              <polygon
                key={`grid-ring-${index}`}
                points={points}
                fill="none"
                stroke="rgba(148,163,184,0.18)"
                strokeWidth="1"
              />
            ))}
            {axisPoints.map((point, index) => {
              const endPoint = toPolarPoint(centerX, centerY, maxRadius, point.angle);
              const isActive = activeDimensionKey === point.key;
              return (
                <g key={point.key}>
                  <line
                    x1={centerX}
                    y1={centerY}
                    x2={endPoint.x}
                    y2={endPoint.y}
                    stroke="rgba(148,163,184,0.22)"
                    strokeWidth="1"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isActive ? 5.5 : 4}
                    fill={isActive ? "rgb(125, 211, 252)" : "rgba(203,213,225,0.92)"}
                    stroke="rgba(15,23,42,0.95)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={endPoint.x}
                    y={endPoint.y}
                    dx={Math.cos(point.angle) < 0 ? -10 : 10}
                    dy={Math.sin(point.angle) < 0 ? -8 : 12}
                    textAnchor={Math.cos(point.angle) < 0 ? "end" : "start"}
                    className="fill-slate-400"
                    style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
            <polygon
              points={radarPolygonPoints}
              fill="url(#career-radar-fill)"
              stroke="rgba(125, 211, 252, 0.85)"
              strokeWidth="2"
            />
            <circle cx={centerX} cy={centerY} r="2.5" fill="rgba(255,255,255,0.9)" />
          </svg>
        </div>

        <ol className="space-y-3">
          {radarDimensions.map((dimension) => {
            const isActive = activeDimensionKey === dimension.key;
            return (
              <li
                key={dimension.key}
                className={`space-y-2 rounded-2xl border p-3 transition ${
                  isActive
                    ? "border-cyan-300/35 bg-cyan-400/10"
                    : "border-white/10 bg-slate-950/25 hover:border-white/20"
                }`}
                onPointerEnter={() => handleAxisInteraction(dimension)}
                onPointerLeave={() => setActiveDimensionKey(null)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100">{dimension.label}</p>
                    <p className="text-xs leading-5 text-slate-400">{dimension.description}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-white">{dimension.value}/100</p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-200/80 transition-all"
                    style={{ width: `${dimension.value}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
