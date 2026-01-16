import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Alert } from "@/components/Alert";
import { RetryButton } from "@/components/RetryButton";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import type { BaselineDto } from "@/lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";
import { InstrumentPanelShell } from "../ui/InstrumentPanelShell";
import { ttrComponents, ttrColors, ttrTypography } from "../ui/ttrStyles";
import type { CSSProperties } from "react";

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

const instructionSteps = [
  {
    title: "Step 1: Upload your baseline resume.",
    detail:
      "Use a current resume that reflects your real experience. Do not upload a job specific version.",
  },
  {
    title: "Step 2: Confirm your baseline appears in the library.",
    detail: "You can keep multiple baselines later, but start with one.",
  },
  {
    title: "Step 3: Go to Analyze.",
    detail: "Paste a job description and run Analyze to generate your CX Fit Score.",
  },
];

const instructionPanelStyle: CSSProperties = {
  ...ttrComponents.basePanel,
  flex: "0 0 auto",
  minWidth: 0,
  padding: 24,
};

const instructionStepsContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginTop: 20,
};

const instructionStepTitleStyle: CSSProperties = {
  ...ttrTypography.paragraph,
  color: ttrColors.textPrimary,
  fontWeight: 700,
  margin: 0,
};

const instructionStepDetailStyle: CSSProperties = {
  ...ttrTypography.paragraph,
  margin: 0,
};

const instructionNoteStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15,23,42,0.8)",
  padding: "12px 14px",
  marginTop: 16,
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

  return (
    <InstrumentPanelShell
      kicker="WELCOME TO TTR"
      title="Target this role with clarity."
      subtitle="TTR compares a baseline resume you trust against a job description to generate a CX Fit Score and tailored outputs. Thanks for letting us be part of your search."
    >
      <div className="space-y-6">
        <section style={instructionPanelStyle}>
          <div className="space-y-3">
            <h1 style={ttrTypography.h1}>Baseline Library</h1>
            <p style={ttrTypography.paragraph}>
              A baseline is the resume you trust most. TTR uses it as your source of truth, then compares it against a job description to generate your CX Fit Score and tailored outputs.
            </p>
          </div>

          <div style={instructionStepsContainerStyle}>
            {instructionSteps.map((step) => (
              <div key={step.title} className="space-y-1">
                <p style={instructionStepTitleStyle}>{step.title}</p>
                <p style={instructionStepDetailStyle}>{step.detail}</p>
              </div>
            ))}
          </div>

          <div style={instructionNoteStyle}>
            <p
              style={{
                ...ttrTypography.paragraph,
                color: ttrColors.textPrimary,
                fontWeight: 700,
                margin: 0,
              }}
            >
              Notes:
            </p>
            <p
              style={{
                ...ttrTypography.paragraph,
                color: ttrColors.textSecondary,
                margin: 0,
                marginTop: 6,
              }}
            >
              Your baseline is stored in your library for future runs. Job descriptions are temporary and stay in your browser unless you clear them.
            </p>
          </div>
        </section>

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
              Upload and manage your locked rAcsumAc baselines. These are used as the
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
      </div>
    </InstrumentPanelShell>
  );
}
