// apps/web/app/components/next-step-card.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ttrComponents } from "../ui/ttrStyles";
import type { StoredPayload } from "../lib/session";

const STORAGE_KEY = "ttr:lastAnalysis";

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

export function NextStepCard() {
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

  const hasLastAnalysis = Boolean(stored?.result && typeof stored.result.score === "number");

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
            <Link href="/baseline" style={ttrComponents.quietButton}>
              Baseline
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
