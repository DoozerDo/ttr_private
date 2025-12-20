// apps/web/app/results/page.tsx
"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";

export default function ResultsPage() {
  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  return (
    <InstrumentShell
      kicker="Output console"
      title="Results"
      subtitle="This page will consolidate fit scoring output, exported assets, and next-step actions. For now, it is an empty shell."
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...basePanelStyle, flex: 1.05 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Status</span>
            <h2 style={ttrTypography.h2}>Staged capability</h2>
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
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
                Coming next
              </p>
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                Results will become the single place to review the score, rationale, strengths and gaps, and the actions
                that follow.
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
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
                  Run a fit check first
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Analyze generates the data that will eventually populate this page.
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
                Future view
              </p>

              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                This panel will show consolidated output, including export actions, without requiring users to hunt across
                multiple screens.
              </p>
            </div>
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}
