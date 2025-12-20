// apps/web/app/results/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";

interface AnalysisResult {
  ok?: boolean;
  baselineId?: string;
  score: number;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  recommendedActions?: string[];
  debug?: unknown;
}

type StoredPayload = {
  result: AnalysisResult;
  savedAt: string;
};

const STORAGE_KEY = "ttr:lastAnalysis";

const ScoreRing = ({ score }: { score: number }) => {
  const radius = 72;
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const offset = circumference * (1 - clampedScore / 100);
  const gradientId = "resultsScoreRingGradient";

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
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#fbbf24" />
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
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 800ms ease-out",
            filter: "drop-shadow(0 0 18px rgba(255,165,0,0.18))",
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
            color: "#fde68a",
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
            color: "rgba(252, 211, 77, 0.8)",
          }}
        >
          Fit score
        </span>
      </div>
    </div>
  );
};

function fitLabel(score: number | null) {
  if (score === null) return "";
  if (score >= 90) return "Strong fit";
  if (score >= 75) return "Solid fit";
  if (score >= 60) return "Mixed fit";
  return "Weak fit";
}

function formatSavedAt(isoString: string) {
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return dt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ResultsPage() {
  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setResult(null);
        setSavedAt(null);
        setLoadError(null);
        return;
      }

      const parsed = JSON.parse(raw) as AnalysisResult | StoredPayload;

      if ("result" in (parsed as StoredPayload) && "savedAt" in (parsed as StoredPayload)) {
        const payload = parsed as StoredPayload;
        if (typeof payload?.result?.score !== "number") {
          setResult(null);
          setSavedAt(null);
          setLoadError("Stored results are not in the expected format.");
          return;
        }

        setResult(payload.result);
        setSavedAt(payload.savedAt);
        setLoadError(null);
        return;
      }

      const legacy = parsed as AnalysisResult;
      if (typeof legacy?.score !== "number") {
        setResult(null);
        setSavedAt(null);
        setLoadError("Stored results are not in the expected format.");
        return;
      }

      setResult(legacy);
      setSavedAt(null);
      setLoadError(null);
    } catch {
      setResult(null);
      setSavedAt(null);
      setLoadError("Unable to read stored results.");
    }
  }, []);

  const scoreLabel = fitLabel(result?.score ?? null);

  const clearStored = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // no-op
    }
    setResult(null);
    setSavedAt(null);
    setLoadError(null);
  };

  const headerRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Link href="/analyze" style={ttrComponents.quietButton}>
        Go to Analyze
      </Link>

      <button
        type="button"
        onClick={clearStored}
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.75)",
          padding: "10px 12px",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Clear stored results in this browser session"
      >
        Clear
      </button>
    </div>
  );

  return (
    <InstrumentShell
      kicker="Output console"
      title="Results"
      subtitle="Review the most recent analysis output. This page will expand into exports and next-step actions."
      rightSlot={headerRight}
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...basePanelStyle, flex: 1.05 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Output</span>
            <h2 style={ttrTypography.h2}>Latest result</h2>
          </div>

          <div style={{ marginTop: 16 }}>
            {loadError ? <div style={ttrComponents.dangerBox}>{loadError}</div> : null}

            {!result ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                      fontWeight: 800,
                    }}
                  >
                    Coming soon
                  </p>
                  <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                    No stored results found yet. Run an analysis first. Once stored, this page will display the most
                    recent output automatically.
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
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
                    Planned sections
                  </p>

                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap" }}>
                    <span style={ttrComponents.chip}>Fit score and label</span>
                    <span style={ttrComponents.chip}>Signals and gaps</span>
                    <span style={ttrComponents.chip}>Recommended actions</span>
                    <span style={ttrComponents.chip}>Exports and artifacts</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.18)",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontSize: 12, letterSpacing: 2.5, textTransform: "uppercase", color: "rgba(226,232,240,0.65)", fontWeight: 800 }}>
                      Last updated
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
                      {savedAt ? formatSavedAt(savedAt) : "Not yet tracked"}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap" }}>
                    <span style={ttrComponents.chip}>Session storage</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <ScoreRing score={result.score} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fde68a" }}>{scoreLabel}</div>
                  </div>

                  <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 10 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        color: "rgba(251,191,36,0.75)",
                        fontWeight: 700,
                      }}
                    >
                      Alignment summary
                    </p>

                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "rgba(241,245,249,0.95)" }}>
                      {result.summary || "No summary provided."}
                    </p>

                    {result.baselineId ? (
                      <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>Baseline: {result.baselineId}</div>
                    ) : null}
                  </div>
                </div>

                {result.strengths?.length ? (
                  <div>
                    <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fde68a" }}>
                      Signals in your favor
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {result.strengths.map((item, index) => (
                        <span key={`${item}-${index}`} style={ttrComponents.chip}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.gaps?.length ? (
                  <div>
                    <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>
                      Gaps to address
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {result.gaps.map((item, index) => (
                        <span
                          key={`${item}-${index}`}
                          style={{
                            ...ttrComponents.chip,
                            background: "rgba(248,113,113,0.12)",
                            border: "1px solid rgba(248,113,113,0.4)",
                            color: "#fecdd3",
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.recommendedActions?.length ? (
                  <div
                    style={{
                      marginTop: 6,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(251,191,36,0.25)",
                      background: "rgba(251,191,36,0.06)",
                    }}
                  >
                    <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#fde68a" }}>
                      Next steps
                    </p>

                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        display: "grid",
                        gap: 6,
                        color: "rgba(241,245,249,0.9)",
                        fontSize: 14,
                      }}
                    >
                      {result.recommendedActions.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            )}
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
            <h2 style={ttrTypography.h2}>Exports and artifacts</h2>
          </div>

          <div style={{ position: "relative", marginTop: 16 }}>
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
                  fontWeight: 800,
                }}
              >
                Coming next
              </p>

              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                This area will host export actions once the pipeline is ready.
              </p>

              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap" }}>
                <span style={ttrComponents.chip}>Tailored resume</span>
                <span style={ttrComponents.chip}>Cover letter</span>
                <span style={ttrComponents.chip}>Interview packet</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}

