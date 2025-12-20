// apps/web/app/page.tsx
import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { AuthStatus } from "./components/auth-status";
import { StatusSection } from "./components/status-section";
import { decodeJwt } from "../lib/auth";

import { ttrComponents, ttrLayout, ttrTypography } from "./ui/ttrStyles";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const payload = decodeJwt(token);

  if (!payload?.email) {
    redirect("/auth/login");
  }

  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  return (
    <main style={ttrLayout.shell}>
      <div style={ttrLayout.container}>
        <header style={ttrComponents.headerCard}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.kicker}>Console</span>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h1 style={ttrTypography.h1}>Dashboard</h1>
              <p style={ttrTypography.paragraph}>
                Session hub. Pick up where you left off and move to the next step.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link href="/baseline" style={ttrComponents.quietButton}>
              Baseline
            </Link>
            <Link href="/analyze" style={ttrComponents.primaryButton}>
              Analyze
            </Link>
            <Link href="/calibrate" style={ttrComponents.quietButton}>
              Calibrate
            </Link>
            <Link href="/results" style={ttrComponents.quietButton}>
              Results
            </Link>
          </div>
        </header>

        <div style={ttrLayout.panelsRow}>
          <section style={{ ...basePanelStyle, flex: 1.05 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Session</span>
              <h2 style={ttrTypography.h2}>Current state</h2>
            </div>

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
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
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "rgba(226,232,240,0.75)", lineHeight: 1.6 }}>
                  Upload or confirm your baseline, then run an analysis to generate a fit score and guidance.
                </p>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/baseline" style={ttrComponents.quietButton}>
                    Open Baseline
                  </Link>
                  <Link href="/analyze" style={ttrComponents.primaryButton}>
                    Start Analyze
                  </Link>
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
                    fontWeight: 800,
                  }}
                >
                  Last analysis
                </p>
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "rgba(226,232,240,0.75)", lineHeight: 1.6 }}>
                  Coming soon. This section will show the latest fit score and last updated timestamp from your browser
                  session, plus a one click continue to Results.
                </p>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/results" style={ttrComponents.quietButton}>
                    Open Results
                  </Link>
                </div>
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
              <span style={ttrTypography.subtleLabel}>Identity</span>
              <h2 style={ttrTypography.h2}>Session access</h2>
            </div>

            <div style={{ position: "relative", marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.18)",
                  padding: "12px 12px",
                }}
              >
                <AuthStatus email={payload.email} />
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.18)",
                  padding: "12px 12px",
                }}
              >
                <StatusSection />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

