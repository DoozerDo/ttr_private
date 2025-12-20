import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BaselineDto } from "../../lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";

import Link from "next/link";
import { InstrumentPanelShell } from "../ui/InstrumentPanelShell";
import { ttrComponents } from "../ui/ttrStyles";

async function fetchBaselines(token: string): Promise<BaselineDto[]> {
  const baseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    return [];
  }

  const response = await fetch(`${baseUrl}/baselines`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/auth/login");
  }

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as BaselineDto[];
}

export default async function BaselinePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const baselines = await fetchBaselines(token);

  const rightSlot = (
    <Link
      href="/analyze"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 12px",
        borderRadius: 12,
        textDecoration: "none",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(241,245,249,0.92)",
        fontWeight: 800,
        fontSize: 13,
        boxShadow: "0 12px 22px rgba(0,0,0,0.25)",
        transition: "transform 160ms ease, box-shadow 160ms ease",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      Analyze a role
    </Link>
  );

  return (
    <InstrumentPanelShell kicker="Baseline console" title="Baseline library" rightSlot={rightSlot}>
      <section style={{ ...ttrComponents.basePanel, padding: 18 }}>
        <BaselineDashboard initialBaselines={baselines} />
      </section>
    </InstrumentPanelShell>
  );
}

