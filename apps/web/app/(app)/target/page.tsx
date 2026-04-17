import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert } from "@/components/Alert";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import type { BaselineDto } from "@/lib/baselines";
import { BaselineWorkspace } from "../baseline/BaselineWorkspace";

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

  return {
    cache: "no-store",
    credentials: "include",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  };
}

type BaselineFetchResult = {
  baselines: BaselineDto[];
  error: string | null;
};

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

type SearchParamsShape = Record<string, string | string[] | undefined>;

type TargetPageProps = {
  searchParams?: SearchParamsShape | Promise<SearchParamsShape>;
};

const resolveParam = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : null;
  }

  return value ?? null;
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
    return {
      baselines: [],
      error: error instanceof Error ? error.message : "Unable to load baselines.",
    };
  }
}

export default async function TargetPage({ searchParams }: TargetPageProps) {
  const params = (await Promise.resolve(searchParams ?? {})) as SearchParamsShape;
  const showNewBaselineToast = resolveParam(params.toast) === "new_baseline";
  const selectedBaselineId = resolveParam(params.baselineId);
  const selectedJobId = resolveParam(params.jobId);
  const entrySource = resolveParam(params.entry);
  const isMomentumEntry = entrySource === "studio_post_apply";

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const { baselines, error: baselineFetchError } = await fetchBaselines();

  const selectedBaseline = selectedBaselineId
    ? baselines.find((baseline) => baseline.id === selectedBaselineId) ?? null
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
          {isMomentumEntry ? "Next role" : "Target"}
        </p>
        <h1 className="text-3xl font-semibold text-slate-100">
          {isMomentumEntry ? "Let's find your next role" : "Run a compatibility score for a role."}
        </h1>
        <p className="max-w-3xl text-sm text-slate-300">
          {isMomentumEntry
            ? "Your baseline is ready. Paste the next job and we will score it."
            : "Select a baseline and a job description to generate a compatibility score."}
        </p>
        {isMomentumEntry && selectedBaseline ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
              Baseline ready
            </span>
            <span className="text-sm text-slate-200">{selectedBaseline.originalFilename ?? selectedBaseline.id}</span>
          </div>
        ) : null}
      </div>
      {showNewBaselineToast ? (
        <Alert intent="success" title="New version available">
          <p className="text-sm">New version available. Re-run compatibility score.</p>
        </Alert>
      ) : null}
      {baselines.length === 0 ? (
        <Alert intent="warning" title="Create a baseline first">
          <p className="text-sm">
            Create a baseline on the Baseline page before starting role analysis.
          </p>
          <Link
            href="/baseline"
            className="mt-3 inline-flex items-center rounded-[var(--button-radius)] border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            GO TO BASELINE
          </Link>
        </Alert>
      ) : null}
      <BaselineWorkspace
        initialBaselines={baselines}
        initialFetchError={baselineFetchError}
        initialBaselineId={selectedBaselineId}
        initialJobId={selectedJobId}
        entrySource={isMomentumEntry ? "studio_post_apply" : null}
        showBaselineCreationControls={false}
      />
    </div>
  );
}
