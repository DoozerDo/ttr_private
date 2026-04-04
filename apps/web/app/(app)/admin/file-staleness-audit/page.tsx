import { FileStalenessAuditClient } from "./FileStalenessAuditClient";
import { readPersistedFileStalenessAuditSnapshot } from "@/src/lib/fileStalenessAudit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FileStalenessAuditPage() {
  const snapshot = await readPersistedFileStalenessAuditSnapshot();

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
