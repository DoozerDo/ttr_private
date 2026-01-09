import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { RetryButton } from "@/components/RetryButton";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

import {
  BaselineDto,
  BaselineSectionDto,
  BaselineVersionDto,
} from "../../../lib/baselines";
import { formatDateTime } from "../../../lib/format-date";
import { BaselinePolicyEditor } from "./baseline-policy-editor";

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

    if (response.status === 401) {
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
    console.error("Failed to fetch baseline", error);
    const message =
      error instanceof Error ? error.message : "Unable to load baseline.";
    return { baseline: null, error: message, notFound: false };
  }
}

async function fetchBaselineVersions(
  id: string,
): Promise<BaselineVersionDto[] | null> {
  try {
    const response = await fetch(
      await buildInternalApiUrl(`/api/baselines/${id}/versions`),
      await buildInternalFetchOptions(),
    );

    if (response.status === 401) {
      redirect("/auth/login");
    }

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as BaselineVersionDto[];
  } catch (error) {
    console.error("Failed to fetch baseline versions", error);
    return null;
  }
}

const friendlyTitles: Record<string, string> = {
  SUMMARY: "Summary",
  EXPERIENCE: "Experience",
  PROJECT: "Projects / Programs",
  SKILLS: "Skills",
  EDUCATION: "Education",
  OTHER: "Other",
  RAW: "Raw",
};

const displayOrder = [
  "SUMMARY",
  "EXPERIENCE",
  "PROJECT",
  "SKILLS",
  "EDUCATION",
  "OTHER",
  "RAW",
];

function organizeSections(sections: BaselineSectionDto[]) {
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

function renderContentSections(groupedSections: Record<string, BaselineSectionDto[]>) {
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
}: {
  params: Promise<{ id: string }>;
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
  const versions = baseline ? await fetchBaselineVersions(resolvedParams.id) : null;

  const sortedVersions =
    versions?.slice().sort((a, b) => b.versionNumber - a.versionNumber) ?? [];
  const latestVersionId = sortedVersions[0]?.id ?? "";

  const groupedSections = baseline ? organizeSections(baseline.sections ?? []) : {};
  const hasRenderableSections = baseline
    ? Object.values(groupedSections).some((sections) => sections.length > 0)
    : false;

  const fallbackContent =
    baseline && !hasRenderableSections && baseline.sections?.[0]?.content
      ? baseline.sections[0].content
      : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
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
            <BaselinePolicyEditor
              baselineId={baseline.id}
              versions={sortedVersions}
              initialVersionId={latestVersionId}
            />

            <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">Version history</h2>
              {sortedVersions && sortedVersions.length > 0 ? (
                <ul className="space-y-2">
                  {sortedVersions.map((version) => (
                    <li
                      key={version.id}
                      className="rounded-md border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold">Version {version.versionNumber}</span>
                        <span className="text-xs text-gray-600">
                          {formatDateTime(version.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-700">Version hash: {version.fileHash}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-700">No version history available.</p>
              )}
            </section>

            <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">Parsed sections</h2>
              {!hasRenderableSections && !fallbackContent ? (
                <p className="text-sm text-gray-700">No sections parsed for this baseline yet.</p>
              ) : (
                <div className="space-y-6">
                  {hasRenderableSections && renderContentSections(groupedSections)}
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
