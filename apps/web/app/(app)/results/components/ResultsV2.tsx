"use client";

import type React from "react";
import { PageHeader } from "@/components/PageHeader";
import { ScoreGauge } from "@/components/ScoreGauge";
import type { ParsedComplianceError } from "@/lib/compliance/parseComplianceError";
import { buildEvidenceLines, type ScoreBreakdown } from "@/lib/evidenceLines";

type ResultsV2Props = {
  heroHeading: string;
  heroScoreText: string;
  heroSupportText: string | null;
  activeScore: number | null;
  isLowScore: boolean;
  executionMode: boolean;
  levelLabel: string;
  strengths: string[];
  gaps: string[];
  complianceError: ParsedComplianceError | null;
  complianceFlags?: string[] | null;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  primaryActionDisabled?: boolean;
  delta?: number | null;
  confidenceScore?: number | null;
  confidenceReasons?: string[] | null;
  scoreBreakdown?: ScoreBreakdown | null;
};

export function ResultsV2({
  heroHeading,
  heroScoreText,
  heroSupportText,
  activeScore,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled,
  scoreBreakdown,
}: ResultsV2Props) {
  const evidenceLines = buildEvidenceLines(scoreBreakdown);

  return (
    <div
      style={{
        backgroundColor: "var(--bg-app)",
        color: "var(--text-primary)",
        padding: "var(--space-xl)",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <PageHeader title="Results" description="Review your fit score and take the next step." />

        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "calc(var(--card-radius) + 4px)",
            border: "1px solid var(--border-strong)",
            padding: "calc(var(--space-lg))",
          }}
        >
          <div className="grid gap-8 lg:grid-cols-[1.25fr,0.75fr] lg:items-center">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{heroHeading}</p>
              <p className="text-5xl font-semibold leading-none text-white">
                {heroScoreText.replace("Score: ", "")}
              </p>
              {heroSupportText ? <p className="text-sm text-slate-300">{heroSupportText}</p> : null}

              {evidenceLines.length ? (
                <section style={{ marginTop: 16, marginBottom: 16 }}>
                  <h3 className="text-sm font-semibold text-slate-200">Evidence from your background</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                    {evidenceLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <button
                type="button"
                className="results-v2-primary-cta"
                onClick={onPrimaryAction}
                disabled={primaryActionDisabled}
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "var(--verdict-apply-text)",
                  border: "none",
                  borderRadius: "var(--button-radius)",
                  padding: "calc(var(--space-sm) + var(--space-md)) calc(var(--space-lg) + var(--space-sm))",
                  cursor: primaryActionDisabled ? "not-allowed" : "pointer",
                  opacity: primaryActionDisabled ? 0.6 : 1,
                }}
              >
                {primaryActionLabel}
              </button>
            </div>

            <div className="flex items-center justify-center">
              <ScoreGauge score={activeScore ?? undefined} loading={activeScore === null} label="Current score" />
            </div>
          </div>
        </section>

        {scoreBreakdown ? (
          <details open className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">
              Supporting score breakdown
            </summary>
            <div className="mt-4 space-y-3">
              {scoreBreakdown.dimensions.map((dimension) => {
                const percent =
                  dimension.weight > 0
                    ? Math.max(0, Math.min(100, (dimension.score / dimension.weight) * 100))
                    : 0;
                return (
                  <div key={`score-breakdown-${dimension.key}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-200">{dimension.label}</span>
                      <span className="font-semibold text-white">
                        {dimension.score.toFixed(1)} / {dimension.weight}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded bg-white/10">
                      <div className="h-1.5 rounded bg-white/40" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-white/10 pt-2 text-sm">
                <span className="font-semibold text-slate-200">Total</span>
                <span className="font-semibold text-white">{scoreBreakdown.total_score.toFixed(1)} / 100</span>
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
