"use client";

import { useMemo } from "react";

export type ScoreGaugeProps = {
  score?: number | null;
  loading?: boolean;
  label?: string;
};

export function ScoreGauge({ score = 0, loading = false, label = "CX Fit Score" }: ScoreGaugeProps) {
  const radius = 72;
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const clampedScore = Math.min(Math.max(score ?? 0, 0), 100);
  const offset = circumference * (1 - clampedScore / 100);
  const gradientId = "scoreGaugeGradient";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        height: 176,
        width: 176,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 200 200" style={{ height: "100%", width: "100%" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={14}
          fill="none"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={14}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 800ms ease-out",
            filter: "drop-shadow(0 0 18px rgba(34,197,94,0.2))",
          }}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "#bbf7d0",
            textShadow: "0 2px 14px rgba(0,0,0,0.35)",
          }}
        >
          {Math.round(clampedScore)}
        </div>
        <span
          style={{
            marginTop: 6,
            fontSize: 11,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: "rgba(187,247,208,0.8)",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
