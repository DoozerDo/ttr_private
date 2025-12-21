// apps/web/app/results/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";
import type { AnalysisResult, StoredPayload } from "../lib/session";

const STORAGE_KEY = "ttr:lastAnalysis";

function fitLabel(score: number | null) {
  if (score === null) return "";
  if (score >= 90) return "Strong fit";
  if (score >= 75) return "Solid fit";
  if (score >= 60) return "Mixed fit";
  return "Weak fit";
}

function safeParseStored(raw: string): { result: AnalysisResult; savedAt: string } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    // New format: { result, savedAt }
    if (
      parsed &&
      typeof parsed === "object" &&
      "result" in parsed &&
      "savedAt" in parsed &&
      typeof (parsed as any).savedAt === "string"
    ) {
      const payload = parsed as StoredPayload;
      if (payload?.result && typeof payload.result.score === "number") {
        return { result: payload.result, savedAt: payload.savedAt };
      }
    }

    // Old format: AnalysisResult directly
    if (parsed && typeof parsed === "object" && "score" in parsed && typeof (parsed as any).score === "number") {
      return { result: parsed as AnalysisResult, savedAt: new Date().toISOString() };
    }

    return null;
  } catch {
    return null;
  }
}

function formatLastUpdated(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString();
  } catch {
    return "Unknown";
  }
}

const ScoreRing = ({ score }: { score: number }) => {
  const radius = 64;
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const clamped = Math.min(Math.max(score, 0), 100);
  const offset = circumference * (1 - clamped / 100);
  const gradientId = "resultsScoreGradient";

  return (
    <div style={{ position: "relative", width: 160, height: 160, display: "grid", placeItems: "center" }}>
      <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={14} fill="none" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={14}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 600ms ease-out", filter: "drop-shadow(0 0 18px rgba(255,165,0,0.18))" }}
        />
      </svg>

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#fde68a", textShadow: "0 2px 14px rgba(0,0,0,0.35)" }}>
            {Math.round(clamped)}
          </div>
          <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: "rgba(252, 211, 77, 0.8)" }}>
            Fit score
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ResultsPage() {
  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  const [stored, setStored] = useState<{ result: AnalysisResult; savedAt: string } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setStored(null);
        return;
      }

      const parsed = safeParseStored(raw);
      setStored(parsed);
    } catch {
      setStored(null);
    }
  }, []);

  const score = stored?.result?.score ?? null;
  const label = fitLabel(score);
  const lastUpdated = stored?.savedAt ? formatLastUpdated(stored.savedAt) : "Not yet";

  const hasResult = score !== null;

  return (
    <InstrumentShell
      kicker="Output console"
      title="Results"
      subtitle="Review the most recent fit score, rationale, and the next actions. This is a staged UI shell for now."
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...basePanelStyle, flex: 1.05 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Snapshot</span>
            <h2 style={ttrTypography.h2}>Latest analysis</h2>
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
                padding: "12px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Status</div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>Last updated: {lastUpdated}</div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {hasResult ? (
                  <>
                    <ScoreRing score={score ?? 0} />
                    <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#fde68a" }}>{label}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(241,245,249,0.92)" }}>
                        {stored?.result?.summary || "Summary will appear here as the analyzer output is refined."}
                      </div>

                      {stored?.result?.baselineId ? (
                        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                          Baseline: {stored.result.baselineId}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "rgba(226,232,240,0.75)", lineHeight: 1.6 }}>
                    No saved analysis found yet. Run Analyze once and then return here.
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                border: "1px dashed rgba(251,191,36,0.35)",
                borderRadius: 14,
                padding: "16px 14px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: "rgba(251,191,36,0.75)",
                  fontWeight: 900,
                }}
              >
                Coming soon
              </p>
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                Results will consolidate the score, strengths and gaps, actions, and export status in one place.
              </p>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
                padding: "12px 12px",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Planned sections</p>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap" }}>
                <span style={ttrComponents.chip}>Fit score and label</span>
                <span style={ttrComponents.chip}>Signals and gaps</span>
                <span style={ttrComponents.chip}>Recommended actions</span>
                <span style={ttrComponents.chip}>Exports and artifacts</span>
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>
                  Run a fit check first
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Analyze generates the data that populates this page.
                </div>
              </div>

              <Link href="/analyze" style={ttrComponents.quietButton}>
                Go to Analyze
              </Link>
            </div>
          </div>
        </section>

        <section style={{ ...basePanelStyle, flex: 0.95, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 20% 0%, rgba(251,191,36,0.08), transparent 35%), radial-gradient(circle at 90% 20%, rgba(255,255,255,0.05), transparent 30%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Wireframe</span>
            <h2 style={ttrTypography.h2}>Layout preview</h2>
          </div>

          <div style={{ position: "relative", marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                border: "1px dashed rgba(255,255,255,0.16)",
                borderRadius: 14,
                padding: "22px 16px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: "rgba(226,232,240,0.65)",
                  fontWeight: 900,
                }}
              >
                Future view
              </p>
              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                This panel will host export buttons, a final verdict, and the action checklist without requiring users to hunt across screens.
              </p>
            </div>

            {hasResult ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.18)",
                  padding: "12px 12px",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Quick links</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/analyze" style={ttrComponents.quietButton}>
                    Run another analysis
                  </Link>
                  <Link href="/calibrate" style={ttrComponents.quietButton}>
                    Open Calibrate
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}


