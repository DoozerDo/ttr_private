import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import type { BaselineDto } from "../../lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";
import { InstrumentPanelShell } from "../ui/InstrumentPanelShell";
import { ttrComponents, ttrTypography } from "../ui/ttrStyles";

async function fetchBaselines(): Promise<BaselineDto[]> {
  try {
    const res = await fetch("/api/baselines", {
      cache: "no-store",
    });

    if (res.status === 401) {
      redirect("/auth/login");
    }

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as BaselineDto[];
  } catch (error) {
    console.error("Failed to fetch baselines", error);
    return [];
  }
}

export default async function BaselinePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const baselines = await fetchBaselines();

  const rightSlot = (
    <Link
      href="/analyze"
      style={ttrComponents.secondaryButton}
    >
      Analyze a role
    </Link>
  );

  return (
    <InstrumentPanelShell
      kicker="Baseline console"
      title="Baseline library"
      rightSlot={rightSlot}
    >
      <section style={ttrComponents.basePanel}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <span style={ttrTypography.subtleLabel}>Your data</span>
          <h2 style={ttrTypography.h2}>Uploaded baselines</h2>
          <p style={ttrTypography.bodyMuted}>
            Upload and manage your locked résumé baselines. These are used as the
            source of truth when analyzing role fit.
          </p>
        </div>

        <BaselineDashboard initialBaselines={baselines} />
      </section>
    </InstrumentPanelShell>
  );
}



