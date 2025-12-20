// apps/web/app/components/last-analysis-card.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ttrComponents } from "../ui/ttrStyles";

type AnalysisResult = {
  ok?: boolean;
  baselineId?: string;
  score: number;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  recommendedActions?: string[];
  debug?: unknown;
};

type StoredPayload = {
  result: AnalysisResult;
  savedAt: string;
};

const STORAGE_KEY = "ttr:lastAnalysis";

function fitLabel(score: number) {
  if (score >= 90) return "Strong fit";
  if (score >= 75) return "Solid fit";
  if (score >= 60) return "Mixed fit";
  return "Weak fit";
}

function safeParse(payload: string | null): StoredPayload | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as StoredPayload;

    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.result || typeof parsed.result.score !== "number") return null;
    if (!parsed.savedAt || typeof parsed.savedAt !== "string") return null;

    return parsed;
  } catch {
    return null;
  }
}

export function LastAnalysisCard() {
  const [stored, setStored] = useState<StoredPayload | null>(null);

  useEffect(() => {
    const read = () => {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      setStored(safeParse(raw));
    };

    read();

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) read();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const score = stored?.result?.score ?? null;

  const lastUpdated = useMemo(() => {
    if (!stored?.savedAt) return null;

    try {
      const d = new Date(stored.savedAt);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleString();
    } catch {
      return null;
    }
  }, [stored?.savedAt]);

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

          {stored.result.baselineId ? (
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
              Baseline: {stored.result.baselineId}
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
