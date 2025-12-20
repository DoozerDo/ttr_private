import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { AuthStatus } from "./components/auth-status";
import { StatusSection } from "./components/status-section";
import { decodeJwt } from "../lib/auth";

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

  const shellStyle: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 20% 20%, rgba(251,191,36,0.08), transparent 30%), radial-gradient(circle at 80% 0%, rgba(248,113,113,0.08), transparent 30%), linear-gradient(180deg, #0f172a, #0b1220 60%, #0f172a)",
    color: "#e2e8f0",
    padding: "48px 0 72px",
  };

  const containerStyle: React.CSSProperties = {
    margin: "0 auto",
    maxWidth: 980,
    padding: "0 20px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  };

  const headerCardStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.06)",
    background:
      "linear-gradient(120deg, rgba(255,255,255,0.02), rgba(251,191,36,0.05))",
    boxShadow: "0 10px 35px rgba(0,0,0,0.3)",
  };

  const panelStyle: React.CSSProperties = {
    position: "relative",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 20,
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(30,41,59,0.75))",
    boxShadow:
      "0 15px 45px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(10px)",
  };

  const subtleLabel: React.CSSProperties = {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(251,191,36,0.8)",
    fontWeight: 700,
  };

  const h1Style: React.CSSProperties = {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    color: "#f8fafc",
  };

  const paragraphStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    color: "rgba(226,232,240,0.75)",
    lineHeight: 1.6,
  };

  const linkButtonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 800,
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(241,245,249,0.92)",
  };

  const primaryButton: React.CSSProperties = {
    ...linkButtonBase,
    border: "none",
    background: "linear-gradient(120deg, #fbbf24, #f97316)",
    color: "#0f172a",
    boxShadow: "0 15px 25px rgba(249,115,22,0.25)",
  };

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <div style={headerCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={subtleLabel}>Console</span>
            <h1 style={h1Style}>Target This Role</h1>
            <p style={paragraphStyle}>
              Session management and status. Use this console to jump into baseline and analysis.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <Link href="/baseline" style={linkButtonBase}>
              Baseline library
            </Link>
            <Link href="/analyze" style={primaryButton}>
              Analyze a role
            </Link>
          </div>
        </div>

        <section style={panelStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc" }}>
                Quick actions
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(226,232,240,0.75)",
                  lineHeight: 1.6,
                }}
              >
                Upload a locked baseline, then run a role analysis to generate a fit score and notes.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/baseline" style={linkButtonBase}>
                Go to baseline
              </Link>
              <Link href="/analyze" style={primaryButton}>
                Start analysis
              </Link>
            </div>
          </div>
        </section>

        <section style={panelStyle}>
          <AuthStatus email={payload.email} />
        </section>

        <section style={panelStyle}>
          <StatusSection />
        </section>
      </div>
    </main>
  );
}
