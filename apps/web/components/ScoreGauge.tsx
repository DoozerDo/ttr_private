"use client";

import { useMemo } from "react";

export type ScoreGaugeProps = {
  score?: number | null;
  loading?: boolean;
  label?: string;
};

export function ScoreGauge({ score = 0, loading = false, label }: ScoreGaugeProps) {
  const radius = 72;
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const clampedScore = Math.min(Math.max(score ?? 0, 0), 100);
  const offset = circumference * (1 - clampedScore / 100);

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
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke="var(--score-ring-base)"
          strokeWidth={14}
          fill="none"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke="var(--score-ring-progress)"
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
            fontSize: 42,
            fontWeight: 800,
            color: "var(--text-primary)",
            textShadow: "0 2px 12px rgba(2,6,23,0.5)",
          }}
        >
          {Math.round(clampedScore)}
        </div>
        {label ? (
          <span
          style={{
            marginTop: 8,
            fontSize: 16,
            letterSpacing: 1,
            textTransform: "uppercase",
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
