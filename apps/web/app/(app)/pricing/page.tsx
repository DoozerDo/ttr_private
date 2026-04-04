"use client";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

import { useEntitlements } from "@/src/lib/entitlements";

export default function PricingPage() {
  const { tier } = useEntitlements();

  const activeLabel = tier === "PRO" ? "Pro" : "Free";

  return (
    <PageShell>
      <PageHeader title="Pricing and tiers" />

      <div style={{ marginTop: 8, opacity: 0.85 }}>
        Billing is not live yet. This page is informational only during beta.
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ fontWeight: 600 }}>Billing disabled</div>
        <div style={{ marginTop: 6, opacity: 0.9 }}>
          Paid upgrades are disabled during beta. If you have beta unlock enabled,
          you will still see Pro features where applicable.
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ fontWeight: 600 }}>Current plan</div>
        <div style={{ marginTop: 6 }}>{activeLabel}</div>
      </div>

      <div style={{ marginTop: 20, opacity: 0.85 }}>
        When billing goes live, upgrades will be handled here. For now, this page
        exists to prevent dead ends and confusion.
      </div>
    </PageShell>
  );
}
