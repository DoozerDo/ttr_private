import { cookies, headers } from "next/headers";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { FileStalenessAuditClient } from "./FileStalenessAuditClient";
import type { PersistedFileStalenessAuditSnapshot } from "@/src/lib/fileStalenessAudit.shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function buildInternalUrl(path: string) {
  const headerList = await headers();
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const baseUrl = host ? `${protocol}://${host}` : "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

async function loadSnapshot(): Promise<PersistedFileStalenessAuditSnapshot | null> {
  const cookieStore = await cookies();
  if (!cookieStore.get(AUTH_COOKIE_NAME)?.value) return null;

  try {
    const response = await fetch(await buildInternalUrl("/api/admin/file-staleness-audit"), {
      cache: "no-store",
      headers: {
        cookie: (await headers()).get("cookie") ?? "",
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as PersistedFileStalenessAuditSnapshot | null;
  } catch {
    return null;
  }
}

export default async function FileStalenessAuditPage() {
  const snapshot = await loadSnapshot();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Administrator</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">File Staleness Audit</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">
          Monthly cleanup review for neglected repo files. This audit is read-only and helps the founder spot
          dormant, stale, and cold files without deleting anything.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-300">
        Scope: repository root only, excluding generated/vendor paths and secret-sensitive files. The scan is
        explicit and read-only.
      </section>

      <FileStalenessAuditClient persistedSnapshot={snapshot} />
    </div>
  );
}
