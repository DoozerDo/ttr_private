// apps/web/app/components/last-analysis-card.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ttrComponents } from "../ui/ttrStyles";
import {
  LAST_ANALYSIS_STORAGE_KEY,
  readLastAnalysis,
  type StoredAnalysisRecord,
} from "../lib/session";

function fitLabel(score: number) {
  if (score >= 90) return "Strong fit";
  if (score >= 75) return "Solid fit";
  if (score >= 60) return "Mixed fit";
  return "Weak fit";
}

function formatSavedTimestamp(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
  } catch {
    return null;
  }
}

export function LastAnalysisCard() {
  const [stored, setStored] = useState<StoredAnalysisRecord | null>(null);

  useEffect(() => {
    const refresh = () => {
      setStored(readLastAnalysis());
    };

    refresh();

    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ANALYSIS_STORAGE_KEY) {
        refresh();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const score =
    stored?.fitScore ??
    stored?.analysis?.score ??
    stored?.analysis?.overallScore ??
    stored?.analysis?.overall_score ??
    null;

  const lastUpdated = formatSavedTimestamp(stored?.savedAt);

  const blockStyle: CSSProperties = {
    border: "1px dashed rgba(251,191,36,0.35)",
    borderRadius: 14,
    padding: "16px 14px",
    background: "rgba(255,255,255,0.03)",
  };

  if (!stored || score === null) {
    return (
      <div style={blockStyle}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: "rgba(251,191,36,0.75)",
            fontWeight: 800,
          }}
        >
          Last analysis
        </p>

        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 13,
            color: "rgba(226,232,240,0.75)",
            lineHeight: 1.6,
          }}
        >
          No analysis saved in this browser session yet. Run Analyze to generate a score and populate Results.
        </p>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/analyze" style={ttrComponents.primaryButton}>
            Start Analyze
          </Link>
          <Link href="/results" style={ttrComponents.quietButton}>
            Open Results
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={blockStyle}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          color: "rgba(251,191,36,0.75)",
          fontWeight: 800,
        }}
      >
        Last analysis
      </p>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.22)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
          aria-label="Fit score"
        >
          <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(251,191,36,0.95)" }}>
            {Math.round(score)}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>
            {fitLabel(score)}
          </div>

          <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
            Last updated: {lastUpdated || "Unknown"}
          </div>

          {stored.baselineId ? (
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
              Baseline: {stored.baselineId}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/results" style={ttrComponents.primaryButton}>
          Continue in Results
        </Link>

        <Link href="/analyze" style={ttrComponents.quietButton}>
          Run another Analyze
        </Link>
      </div>
    </div>
  );
}
