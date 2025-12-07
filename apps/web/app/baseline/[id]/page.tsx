import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BaselineDto, BaselineSectionDto } from "../../../lib/baselines";
import { formatDateTime } from "../../../lib/format-date";

async function fetchBaseline(id: string, token: string): Promise<BaselineDto | null> {
  const baseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/baselines/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as BaselineDto;
}

function groupSections(sections: BaselineSectionDto[]) {
  const grouped: Record<string, BaselineSectionDto[]> = {};

  sections.forEach((section) => {
    if (!grouped[section.type]) {
      grouped[section.type] = [];
    }
    grouped[section.type].push(section);
  });

  return grouped;
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

  const baseline = await fetchBaseline(resolvedParams.id, token);

  if (!baseline) {
    notFound();
  }

  const groupedSections = groupSections(baseline.sections ?? []);

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
          <h2 className="text-xl font-semibold text-gray-900">Parsed sections</h2>
          {Object.keys(groupedSections).length === 0 ? (
            <p className="text-sm text-gray-700">No sections parsed for this baseline yet.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedSections).map(([type, sections]) => (
                <div key={type} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase text-gray-700">
                      {type}
                    </span>
                    <span className="text-xs text-gray-600">
                      {sections.length} section{sections.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {sections.map((section) => (
                      <article
                        key={section.id}
                        className="rounded-md border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900"
                      >
                        <pre className="whitespace-pre-wrap break-words text-sm text-gray-900">
                          {section.content}
                        </pre>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
