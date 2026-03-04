import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { RetryButton } from "@/components/RetryButton";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

import type {
  BaselineDto,
  BaselineSectionDto,
} from "@/lib/baselines";
import { formatDateTime } from "@/lib/format-date";
import { getBaselineDetailsHref } from "@/src/navigation/routes";

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

function computeBaseUrl({
  protocol,
  host,
  fallbackBase,
}: {
  protocol: string;
  host: string | null;
  fallbackBase: string | undefined;
}) {
  if (fallbackBase && fallbackBase.trim().length > 0) {
    return fallbackBase;
  }

  if (host) {
    const url = new URL("http://localhost:3000");
    url.protocol = protocol.endsWith(":") ? protocol : `${protocol}:`;
    url.host = host;
    return url.toString().replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

async function buildInternalApiUrl(path: string) {
  const headerList = await headers();
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL;

  const baseUrl = computeBaseUrl({ protocol, host, fallbackBase });

  return new URL(path, baseUrl).toString();
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
  baseline: BaselineDto | null;
  error: string | null;
  notFound: boolean;
};

async function fetchBaseline(id: string): Promise<BaselineFetchResult> {
  try {
    const response = await fetch(
      await buildInternalApiUrl(`/api/baselines/${id}`),
      await buildInternalFetchOptions(),
    );

    if (response.status === 401 || response.status === 403) {
      redirect("/auth/login");
    }

    if (response.status === 404) {
      return { baseline: null, error: null, notFound: true };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const message = errorText || "Unable to load baseline.";
      return { baseline: null, error: message, notFound: false };
    }

    const data = (await response.json()) as BaselineDto;
    return { baseline: data, error: null, notFound: false };
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("Failed to fetch baseline", error);
    const message =
      error instanceof Error ? error.message : "Unable to load baseline.";
    return { baseline: null, error: message, notFound: false };
  }
}

const friendlyTitles: Record<string, string> = {
  SUMMARY: "Summary",
  EXPERIENCE: "Experience",
  PROJECT: "Projects / Programs",
  SKILLS: "Skills",
  EDUCATION: "Education",
  OTHER: "Summary",
  RAW: "Raw",
};

type GroupedSections = Record<string, BaselineSectionDto[]>;

const displayOrder = [
  "SUMMARY",
  "EXPERIENCE",
  "PROJECT",
  "SKILLS",
  "EDUCATION",
  "OTHER",
  "RAW",
];

function organizeSections(sections: BaselineSectionDto[]): GroupedSections {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const grouped: Record<string, BaselineSectionDto[]> = {};

  sorted.forEach((section) => {
    const key = section.sectionType ?? "OTHER";
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(section);
  });

  return grouped;
}

function renderContentSections(
  groupedSections: Record<string, BaselineSectionDto[]>,
) {
  const keys = displayOrder.filter((key) => groupedSections[key]?.length);

  return keys.map((type) => (
    <div key={type} className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase text-gray-700">
          {friendlyTitles[type] ?? type}
        </span>
        <span className="text-xs text-gray-600">
          {groupedSections[type].length} section
          {groupedSections[type].length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-3">
        {groupedSections[type].map((section) => (
          <article
            key={section.id}
            className="rounded-md border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900"
          >
            <div className="mb-2 text-xs font-semibold uppercase text-gray-600">
              {section.title || friendlyTitles[type] || type}
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm text-gray-900">
              {section.content}
            </pre>
          </article>
        ))}
      </div>
    </div>
  ));
}

export default async function BaselineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: { suggestedSections?: string };
}) {
  const resolvedParams = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  if (!resolvedParams?.id) {
    notFound();
  }

  const baselineResult = await fetchBaseline(resolvedParams.id);

  if (baselineResult.notFound) {
    notFound();
  }

  const baseline = baselineResult.baseline;
  const baselineFetchError = baselineResult.error;
  const groupedSections: GroupedSections = baseline
    ? organizeSections(baseline.sections ?? [])
    : {};
  const suggestedSectionsRaw = searchParams?.suggestedSections ?? "";
  const filterSet = new Set(
    suggestedSectionsRaw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const filteredEntries = Object.entries(groupedSections)
    .map(([key, sections]) => [
      key,
      sections.filter((section) => matchesSuggestedSection(section, filterSet)),
    ] as const)
    .filter(([, sections]) => sections.length > 0);
  const filteredGroupedSections = Object.fromEntries(filteredEntries);
  const hasActiveFilter = filterSet.size > 0;
  const displayedGroupedSections: GroupedSections = hasActiveFilter
    ? filteredGroupedSections
    : groupedSections;
  const hasRenderableSections = baseline
    ? Object.values(displayedGroupedSections).some((sections) => sections.length > 0)
    : false;

  const fallbackContent =
    baseline && !hasRenderableSections && baseline.sections?.[0]?.content
      ? baseline.sections[0].content
      : null;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Baseline details
            </p>
            <h1 className="text-3xl font-bold text-gray-900">
              {baseline?.originalFilename ?? "Baseline details"}
            </h1>
            {baseline ? (
              <p className="text-sm text-gray-700">
                Uploaded {formatDateTime(baseline.createdAt)}
              </p>
            ) : null}
          </div>
          <Link
            href="/baseline"
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            Back to baselines
          </Link>
        </div>

        {baselineFetchError ? (
          <div className="space-y-3">
            <Alert intent="error" title="Unable to load baseline">
              <p>{baselineFetchError}</p>
              <p className="text-xs text-gray-600">
                Check your connection or try again, then reload this page.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <RetryButton label="Retry baseline" />
              </div>
            </Alert>
          </div>
        ) : null}

        {baseline ? (
          <>
            <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">
                Parsed sections
              </h2>
              {hasActiveFilter ? (
                <p className="text-sm text-gray-600">
                  Filtering to suggested areas: {suggestedSectionsRaw || "selected sections"}.
                  <Link href={getBaselineDetailsHref(resolvedParams.id ?? "")}>Clear filter</Link>
                </p>
              ) : null}
              {!hasRenderableSections && !fallbackContent ? (
                <p className="text-sm text-gray-700">
                  {hasActiveFilter ? "No sections match the suggested areas." : "No sections parsed for this baseline yet."}
                </p>
              ) : (
                <div className="space-y-6">
                  {hasRenderableSections &&
                    renderContentSections(displayedGroupedSections)}
                  {!hasRenderableSections && fallbackContent ? (
                    <article className="rounded-md border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900">
                      <pre className="whitespace-pre-wrap break-words text-sm text-gray-900">
                        {fallbackContent}
                      </pre>
                    </article>
                  ) : null}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <EmptyState
              title="Baseline unavailable"
              body="We couldn't load this baseline. Retry or return to the baseline library."
              cta={<RetryButton label="Retry baseline" />}
            />
          </section>
        )}
      </div>
    </main>
  );
}


function matchesSuggestedSection(
  section: BaselineSectionDto,
  filterSet: Set<string>,
): boolean {
  const typeKey = (section.sectionType ?? "").toLowerCase();
  if (typeKey && filterSet.has(typeKey)) {
    return true;
  }

  if (filterSet.has("leadership") && typeKey === "experience") {
    return true;
  }

  const title = (section.title ?? "").toLowerCase();
  if (title && filterSet.has(title)) {
    return true;
  }

  return false;
}
