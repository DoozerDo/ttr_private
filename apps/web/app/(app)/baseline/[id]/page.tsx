import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/Alert";
import { RetryButton } from "@/components/RetryButton";
import type { BaselineDto, BaselineSectionDto } from "@/lib/baselines";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { formatDateTime } from "@/lib/format-date";
import { sanitizeRenderedTextValue } from "@/lib/renderedText";
import { getBaselineDetailsHref } from "@/src/navigation/routes";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import { getRequiredServerApiBaseUrl, UpstreamApiConfigError } from "@/app/api/_lib/serverApiConfig";
import { BaselineReviewPanel } from "./BaselineReviewPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BaselineDetailErrorKind =
  | "not_found"
  | "unauthorized_or_session_expired"
  | "server_error"
  | "network_error";

type BaselineDetailResult =
  | {
      kind: "success";
      baseline: BaselineDto;
      requestedId: string;
      resolvedId: string;
    }
  | {
      kind: "error";
      errorKind: BaselineDetailErrorKind;
      requestedId: string;
      resolvedId: string;
      status: number | null;
      internalMessage: string | null;
    };

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
    return sanitizeRenderedTextValue(fallbackBase, {
      endpoint: "baseline-detail",
      field: "fallbackBase",
    });
  }

  if (host) {
    const url = new URL("http://localhost:3000");
    url.protocol = protocol.endsWith(":") ? protocol : `${protocol}:`;
    url.host = host;
    return url.toString().replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

async function getRequestContext() {
  const headerList = await headers();
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL;
  const cookieHeader = headerList.get("cookie");

  return {
    baseUrl: computeBaseUrl({ protocol, host, fallbackBase }),
    fetchOptions: {
      cache: "no-store" as const,
      credentials: "include" as const,
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    },
    authState: (cookieHeader ? "present" : "missing") as "present" | "missing",
  };
}

function extractCookieValue(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return "";
  // Fast path for simple cookie strings (avoid bringing in a full parser in RSC code).
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part) continue;
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eqIndex + 1).trim());
  }
  return "";
}

function extractErrorMessage(bodyText: string, status: number) {
  if (!bodyText.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      message?: unknown;
      error?: unknown;
    };
    const parsedMessage =
      typeof parsed.message === "string"
        ? sanitizeRenderedTextValue(parsed.message, {
            endpoint: "baseline-detail",
            field: "error.message",
          })
        : typeof parsed.error === "string"
          ? sanitizeRenderedTextValue(parsed.error, {
              endpoint: "baseline-detail",
              field: "error.error",
            })
          : null;
    if (parsedMessage) {
      return parsedMessage;
    }
  } catch {
    // Non-JSON error bodies are expected from some proxy layers.
  }

  return sanitizeRenderedTextValue(bodyText, {
    endpoint: "baseline-detail",
    field: "error.body",
  }).slice(0, status >= 500 ? 240 : 120);
}

function logDetailLoadFailure(entry: {
  requestedId: string;
  resolvedId: string;
  status: number | null;
  failureClass: BaselineDetailErrorKind;
  authState: "present" | "missing";
  message: string | null;
}) {
  console.error("baseline_detail_load_failed", entry);
}

async function fetchBaseline(id: string): Promise<BaselineDetailResult> {
  const requestedId = sanitizeRenderedTextValue(id, {
    endpoint: "baseline-detail",
    field: "params.id",
  });
  const resolvedId = requestedId;
  const { authState, fetchOptions } = await getRequestContext();
  const cookieHeader = (fetchOptions.headers as { cookie?: string } | undefined)?.cookie ?? null;
  const token =
    extractCookieValue(cookieHeader, AUTH_COOKIE_NAME) ||
    extractCookieValue(cookieHeader, "ttr_token");

  try {
    let upstreamBaseUrl: string;
    try {
      upstreamBaseUrl = getRequiredServerApiBaseUrl();
    } catch (error) {
      const configError =
        error instanceof UpstreamApiConfigError ? error : null;
      const internalMessage = configError
        ? `${configError.code}: ${configError.message}`
        : error instanceof Error
          ? error.message
          : String(error);

      logDetailLoadFailure({
        requestedId,
        resolvedId,
        status: null,
        failureClass: "server_error",
        authState,
        message: internalMessage,
      });

      return {
        kind: "error",
        errorKind: "server_error",
        requestedId,
        resolvedId,
        status: null,
        internalMessage,
      };
    }

    const response = await backendFetch(
      `${upstreamBaseUrl}/baselines/${encodeURIComponent(resolvedId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );

    if (response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.toLowerCase().includes("application/json");

      let rawBody = "";
      try {
        rawBody = await response.text();
      } catch {
        rawBody = "";
      }

      if (!isJson || !rawBody.trim()) {
        const excerpt = rawBody.trim().slice(0, 280);
        const internalMessage = [
          "baseline_decode_failed",
          `status=${response.status}`,
          `contentType=${contentType || "unknown"}`,
          excerpt ? `excerpt=${excerpt}` : "excerpt=<empty>",
        ].join(" ");

        logDetailLoadFailure({
          requestedId,
          resolvedId,
          status: response.status,
          failureClass: "server_error",
          authState,
          message: internalMessage,
        });

        return {
          kind: "error",
          errorKind: "server_error",
          requestedId,
          resolvedId,
          status: response.status,
          internalMessage,
        };
      }

      try {
        const parsed = JSON.parse(rawBody) as BaselineDto;
        const hasId = typeof (parsed as { id?: unknown })?.id === "string";
        const hasSections = Array.isArray((parsed as { sections?: unknown })?.sections);
        if (!hasId || !hasSections) {
          const internalMessage = [
            "baseline_decode_failed",
            `status=${response.status}`,
            `contentType=${contentType || "unknown"}`,
            "shape=invalid",
          ].join(" ");

          logDetailLoadFailure({
            requestedId,
            resolvedId,
            status: response.status,
            failureClass: "server_error",
            authState,
            message: internalMessage,
          });

          return {
            kind: "error",
            errorKind: "server_error",
            requestedId,
            resolvedId,
            status: response.status,
            internalMessage,
          };
        }

        return {
          kind: "success",
          baseline: parsed,
          requestedId,
          resolvedId,
        };
      } catch (error) {
        const excerpt = rawBody.trim().slice(0, 280);
        const internalMessage = [
          "baseline_decode_failed",
          `status=${response.status}`,
          `contentType=${contentType || "unknown"}`,
          `error=${error instanceof Error ? error.message : String(error)}`,
          excerpt ? `excerpt=${excerpt}` : "excerpt=<empty>",
        ].join(" ");

        logDetailLoadFailure({
          requestedId,
          resolvedId,
          status: response.status,
          failureClass: "server_error",
          authState,
          message: internalMessage,
        });

        return {
          kind: "error",
          errorKind: "server_error",
          requestedId,
          resolvedId,
          status: response.status,
          internalMessage,
        };
      }
    }

    let errorKind: BaselineDetailErrorKind = "server_error";

    // Treat controlled upstream connection failures as network errors (even though we have an HTTP response).
    if (response.status === 503) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.toLowerCase().includes("application/json")) {
        try {
          const payload = (await response.clone().json()) as { error?: unknown; message?: unknown };
          if (payload?.error === "UPSTREAM_UNAVAILABLE") {
            errorKind = "network_error";
          }
        } catch {
          // ignore payload parse failures; fall back to server_error
        }
      }
    }

    const bodyText = await response.text().catch(() => "");
    const internalMessage = extractErrorMessage(bodyText, response.status);

    if (response.status === 404) {
      errorKind = "not_found";
    } else if (response.status === 401 || response.status === 403) {
      errorKind = "unauthorized_or_session_expired";
    }

    logDetailLoadFailure({
      requestedId,
      resolvedId,
      status: response.status,
      failureClass: errorKind,
      authState,
      message: internalMessage,
    });

    return {
      kind: "error",
      errorKind,
      requestedId,
      resolvedId,
      status: response.status,
      internalMessage,
    };
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : String(error);
    logDetailLoadFailure({
      requestedId,
      resolvedId,
      status: null,
      failureClass: "network_error",
      authState,
      message: internalMessage,
    });

    return {
      kind: "error",
      errorKind: "network_error",
      requestedId,
      resolvedId,
      status: null,
      internalMessage,
    };
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
              {sanitizeRenderedTextValue(section.title || friendlyTitles[type] || type, {
                endpoint: "baseline-detail",
                field: `sections.${type}.title`,
              })}
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm text-gray-900">
              {sanitizeRenderedTextValue(section.content, {
                endpoint: "baseline-detail",
                field: `sections.${type}.content`,
              })}
            </pre>
          </article>
        ))}
      </div>
    </div>
  ));
}

function getErrorCopy(errorKind: BaselineDetailErrorKind) {
  switch (errorKind) {
    case "not_found":
      return {
        title: "We couldn't find this baseline.",
        body: "The baseline may have been removed, archived in another session, or the link may be outdated.",
      };
    case "unauthorized_or_session_expired":
      return {
        title: "Your session expired. Refresh and try again.",
        body: "We couldn't verify your access to this baseline. Refresh the page and try again.",
      };
    case "network_error":
      return {
        title: "We couldn't reach the baseline service.",
        body: "Check your connection and try again.",
      };
    case "server_error":
    default:
      return {
        title: "We couldn't load this baseline. Try again.",
        body: "The baseline service returned an unexpected error. Please retry.",
      };
  }
}

function BaselineDetailErrorState({ errorKind }: { errorKind: BaselineDetailErrorKind }) {
  const copy = getErrorCopy(errorKind);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <Alert intent="error" title={copy.title}>
        <p>{copy.body}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <RetryButton label="Retry baseline" />
        </div>
      </Alert>
    </section>
  );
}

export default async function BaselineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: { suggestedSections?: string };
}) {
  const resolvedParams = await params;
  const resolvedId = sanitizeRenderedTextValue(resolvedParams?.id ?? "", {
    endpoint: "baseline-detail",
    field: "params.id",
  });

  if (!resolvedId) {
    notFound();
  }

  const baselineResult = await fetchBaseline(resolvedId);

  const suggestedSectionsRaw = searchParams?.suggestedSections ?? "";
  const filterSet = new Set(
    suggestedSectionsRaw
      .split(",")
      .map((value) =>
        sanitizeRenderedTextValue(value, {
          endpoint: "baseline-detail",
          field: "suggestedSections",
        }).toLowerCase(),
      )
      .filter(Boolean),
  );

  if (baselineResult.kind !== "success") {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                Baseline details
              </p>
              <h1 className="text-3xl font-bold text-gray-900">Baseline details</h1>
            </div>
            <Link href="/baseline" className="text-sm font-semibold text-blue-600 hover:underline">
              Back to baselines
            </Link>
          </div>

          <BaselineDetailErrorState errorKind={baselineResult.errorKind} />
        </div>
      </main>
    );
  }

  const baseline = baselineResult.baseline;
  const groupedSections: GroupedSections = organizeSections(baseline.sections ?? []);
  const review = (baseline as any).review ?? null;
  const filteredEntries = Object.entries(groupedSections)
    .map(
      ([key, sections]) =>
        [
          key,
          sections.filter((section) => matchesSuggestedSection(section, filterSet)),
        ] as const,
    )
    .filter(([, sections]) => sections.length > 0);
  const filteredGroupedSections = Object.fromEntries(filteredEntries);
  const hasActiveFilter = filterSet.size > 0;
  const displayedGroupedSections: GroupedSections = hasActiveFilter
    ? filteredGroupedSections
    : groupedSections;
  const hasRenderableSections = Object.values(displayedGroupedSections).some(
    (sections) => sections.length > 0,
  );

  const fallbackContent =
    !hasRenderableSections && baseline.sections?.[0]?.content
      ? sanitizeRenderedTextValue(baseline.sections[0].content, {
          endpoint: "baseline-detail",
          field: "baseline.sections[0].content",
        })
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
              {sanitizeRenderedTextValue(baseline.originalFilename ?? "Baseline details", {
                endpoint: "baseline-detail",
                field: "baseline.originalFilename",
              })}
            </h1>
            <p className="text-sm text-gray-700">Uploaded {formatDateTime(baseline.createdAt)}</p>
          </div>
          <Link href="/baseline" className="text-sm font-semibold text-blue-600 hover:underline">
            Back to baselines
          </Link>
        </div>

        <BaselineReviewPanel baselineId={resolvedId} review={review} />

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Parsed sections</h2>
          {hasActiveFilter ? (
            <p className="text-sm text-gray-600">
              Filtering to suggested areas: {suggestedSectionsRaw || "selected sections"}.
              <Link href={getBaselineDetailsHref(resolvedId)}>Clear filter</Link>
            </p>
          ) : null}
          {!hasRenderableSections && !fallbackContent ? (
            <p className="text-sm text-gray-700">
              {hasActiveFilter
                ? "No sections match the suggested areas."
                : "No sections parsed for this baseline yet."}
            </p>
          ) : (
            <div className="space-y-6">
              {hasRenderableSections ? renderContentSections(displayedGroupedSections) : null}
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
