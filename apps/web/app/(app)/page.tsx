// apps/web/app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";

import { AuthStatus } from "./components/auth-status";
import { LastAnalysisCard } from "./components/last-analysis-card";
import { NextStepCard } from "./components/next-step-card";

import { AUTH_COOKIE_NAME, decodeJwt } from "@/lib/auth";
import { SubscriptionTier, tierLabels } from "@/lib/tiers";

import { ttrComponents, ttrLayout, ttrTypography } from "./ui/ttrStyles";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const payload = decodeJwt(token);

  if (!payload?.email) {
    redirect("/auth/login");
  }

  const tier =
    (payload?.subscriptionTier as SubscriptionTier | undefined) ??
    SubscriptionTier.FREE;
  const planLabel = tierLabels[tier];

  const pageShellStyle: CSSProperties = ttrLayout.shell;
  const pageContainerStyle: CSSProperties = {
    ...ttrLayout.container,
    maxWidth: 1120,
  };

  const headerCardStyle: CSSProperties = ttrComponents.headerCard;

  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  const sectionKicker: CSSProperties = ttrTypography.kicker;

  return (
    <main style={pageShellStyle}>
      <div style={pageContainerStyle}>
        <div style={headerCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={sectionKicker}>Console</span>
            <h1 style={ttrTypography.h1}>Dashboard</h1>
            <p style={ttrTypography.paragraph}>
              Session hub. Pick up where you left off and move to the next step.
            </p>
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.35)",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(241,245,249,0.85)",
              }}
            >
              Plan: {planLabel}
            </span>
            <Link href="/pricing" style={ttrComponents.secondaryButton}>
              Manage plan
            </Link>
          </div>
        </div>

        <div style={ttrLayout.panelsRow}>
          <section style={{ ...basePanelStyle, flex: 1.2 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Session</span>
              <h2 style={ttrTypography.h2}>Current state</h2>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <NextStepCard />
              <LastAnalysisCard />
            </div>
          </section>

          <section style={{ ...basePanelStyle, flex: 0.95 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Identity</span>
              <h2 style={ttrTypography.h2}>Session access</h2>
            </div>

            <div style={{ marginTop: 16 }}>
              <AuthStatus email={payload.email} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
