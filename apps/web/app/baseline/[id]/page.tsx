import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BaselineDto, BaselineSectionDto } from "../../../lib/baselines";
import { formatDateTime } from "../../../lib/format-date";

type BaselineVersionDto = {
  versionNumber: number;
  fileHash: string;
  createdAt: string;
};

async function fetchBaseline(id: string): Promise<BaselineDto | null> {
  try {
    const response = await fetch(`/api/baselines/${id}`, {
      cache: "no-store",
    });

    if (response.status === 401) {
      redirect("/auth/login");
    }

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as BaselineDto;
  } catch (error) {
    console.error("Failed to fetch baseline", error);
    return null;
  }
}

async function fetchBaselineVersions(
  id: string,
): Promise<BaselineVersionDto[] | null> {
  // VERIFY: ensure versions API returns expected shape
  try {
    const response = await fetch(`/api/baselines/${id}/versions`, {
      cache: "no-store",
    });

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
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    redirect("/auth/login");
  }

  if (!resolvedParams?.id) {
    notFound();
  }

  const baseline = await fetchBaseline(resolvedParams.id);
  const versions = await fetchBaselineVersions(resolvedParams.id);

  if (!baseline) {
    notFound();
  }

  const groupedSections = organizeSections(baseline.sections ?? []);
  const hasRenderableSections = Object.values(groupedSections).some(
    (sections) => sections.length > 0,
  );

  const fallbackContent =
    !hasRenderableSections && baseline.sections?.[0]?.content
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
              {baseline.originalFilename}
            </h1>
            <p className="text-sm text-gray-700">
              Uploaded {formatDateTime(baseline.createdAt)}
            </p>
          </div>
          <Link
            href="/baseline"
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            Back to baselines
          </Link>
        </div>

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Version history</h2>
          {versions && versions.length > 0 ? (
            <ul className="space-y-2">
              {versions.map((version) => (
                <li
                  key={version.versionNumber}
                  className="rounded-md border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900"
                >
                  {/* VERIFY: confirm fields display correctly */}
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold">Version {version.versionNumber}</span>
                    <span className="text-xs text-gray-600">
                      {formatDateTime(version.createdAt)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-700">File hash: {version.fileHash}</div>
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
      </div>
    </main>
  );
}
