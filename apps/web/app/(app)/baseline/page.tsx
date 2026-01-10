import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Alert } from "@/components/Alert";
import { RetryButton } from "@/components/RetryButton";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import type { BaselineDto } from "@/lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";
import { InstrumentPanelShell } from "../ui/InstrumentPanelShell";
import { ttrComponents, ttrTypography } from "../ui/ttrStyles";

export const dynamic = "force-dynamic";

async function buildInternalApiUrl(path: string) {
  const headerList = await headers();
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL;

  const baseUrl = fallbackBase ?? (host ? `${protocol}://${host}` : null);

  return new URL(path, baseUrl ?? "http://localhost:3000").toString();
}

async function buildInternalFetchOptions(): Promise<RequestInit> {
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie");

  const headersInit = cookieHeader ? { cookie: cookieHeader } : undefined;

  return {
    cache: "no-store",
    credentials: "include",
    headers: headersInit,
  };
}

type BaselineFetchResult = {
  baselines: BaselineDto[];
  error: string | null;
};

async function fetchBaselines(): Promise<BaselineFetchResult> {
  try {
    const res = await fetch(
      await buildInternalApiUrl("/api/baselines"),
      await buildInternalFetchOptions(),
    );

    if (res.status === 401) {
      redirect("/auth/login");
    }

    if (!res.ok) {
      const message = (await res.text()) || "Unable to load baselines";
      throw new Error(message);
    }

    return {
      baselines: (await res.json()) as BaselineDto[],
      error: null,
    };
  } catch (error) {
    console.error("Failed to fetch baselines", error);
    const message = error instanceof Error ? error.message : "Unable to load baselines.";
    return {
      baselines: [],
      error: message,
    };
  }
}

export default async function BaselinePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const { baselines, error: baselineFetchError } = await fetchBaselines();

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

        {baselineFetchError ? (
          <div className="space-y-3">
            <Alert intent="error" title="Unable to load baselines">
              <p>{baselineFetchError}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <RetryButton label="Try again" />
              </div>
            </Alert>
          </div>
        ) : null}

        <BaselineDashboard
          initialBaselines={baselines}
          initialFetchError={baselineFetchError}
        />
      </section>
    </InstrumentPanelShell>
  );
}
