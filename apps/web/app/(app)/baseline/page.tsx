import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import type { BaselineDto } from "@/lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";
import { InstrumentPanelShell } from "../ui/InstrumentPanelShell";
import { ttrTypography } from "../ui/ttrStyles";
import { JobsHub } from "./_components/JobsHub";
import { WorkspaceRunner } from "./_components/WorkspaceRunner";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (!("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

type SearchParamsShape = Record<string, string | string[] | undefined>;

type BaselinePageProps = {
  searchParams?: SearchParamsShape | Promise<SearchParamsShape>;
};

const resolveParam = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : null;
  }
  return value ?? null;
};

const onboardingTextStyle: CSSProperties = {
  ...ttrTypography.paragraph,
  color: "rgba(226,232,240,0.85)",
  margin: 0,
  lineHeight: 1.5,
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
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("Failed to fetch baselines", error);
    const message =
      error instanceof Error ? error.message : "Unable to load baselines.";
    return {
      baselines: [],
      error: message,
    };
  }
}

export default async function BaselinePage({ searchParams }: BaselinePageProps) {
  const params = (await Promise.resolve(searchParams ?? {})) as SearchParamsShape;

  const selectedBaselineId = resolveParam(params.baselineId);
  const selectedJobId = resolveParam(params.jobId);

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
      contentWidth="wide"
    >
      <div className="space-y-6">
        <p style={onboardingTextStyle}>
          Compare your trusted baseline against a job description to surface a compatibility score.
        </p>

        <div className="w-full max-w-7xl xl:max-w-7xl mx-auto grid grid-cols-1 gap-6 lg:grid-cols-3">
          <BaselineDashboard
            initialBaselines={baselines}
            initialFetchError={baselineFetchError}
            selectedBaselineId={selectedBaselineId}
          />

          <JobsHub selectedJobId={selectedJobId} />

          <WorkspaceRunner baselineId={selectedBaselineId} jobId={selectedJobId} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-xs text-slate-400">
          debug baselineId={selectedBaselineId ?? "null"} jobId={selectedJobId ?? "null"}
        </div>
      </div>
    </InstrumentPanelShell>
  );
}
