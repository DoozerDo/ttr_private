// apps/web/app/components/next-step-card.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ttrComponents } from "../ui/ttrStyles";
import {
  LAST_ANALYSIS_STORAGE_KEY,
  readLastAnalysis,
  type StoredAnalysisRecord,
} from "../lib/session";

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

export function NextStepCard() {
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

  const lastUpdated = formatSavedTimestamp(stored?.savedAt);

  const hasLastAnalysis = stored?.fitScore !== null && stored?.fitScore !== undefined;

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        padding: "12px 12px",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
        Next step
      </p>

      {!hasLastAnalysis ? (
        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 13,
            color: "rgba(226,232,240,0.75)",
            lineHeight: 1.6,
          }}
        >
          Upload or confirm your baseline, then run an analysis to generate a fit score and guidance.
        </p>
      ) : (
        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 13,
            color: "rgba(226,232,240,0.75)",
            lineHeight: 1.6,
          }}
        >
          Continue the last session in Results, or run another analysis to compare a new role.
        </p>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!hasLastAnalysis ? (
          <>
            <Link href="/baseline" style={ttrComponents.quietButton}>
              Open Baseline
            </Link>
            <Link href="/analyze" style={ttrComponents.primaryButton}>
              Start Analyze
            </Link>
          </>
        ) : (
          <>
            <Link href="/results" style={ttrComponents.primaryButton}>
              Continue in Results
            </Link>
            <Link href="/analyze" style={ttrComponents.quietButton}>
              Run another Analyze
            </Link>
            <Link href="/analyze" style={ttrComponents.quietButton}>
              Reality Check
            </Link>
          </>
        )}
      </div>

      {hasLastAnalysis ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
          Last updated: {lastUpdated || "Unknown"}
        </div>
      ) : null}
    </div>
  );
}
