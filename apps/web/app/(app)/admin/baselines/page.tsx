import { revalidatePath } from "next/cache";
import Link from "next/link";

import { adminServerFetch } from "../_lib/adminServerFetch";

type AdminBaselineRow = {
  id: string;
  originalFilename: string | null;
  status: "ACTIVE" | "ARCHIVED" | string;
  updatedAt: string;
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function lockedLabel(status: string): string {
  return status === "ACTIVE" ? "Unlocked" : "Locked";
}

async function loadBaselines(): Promise<AdminBaselineRow[]> {
  return adminServerFetch<AdminBaselineRow[]>("/admin/baselines?includeArchived=true", "Load baselines");
}

async function deleteBaselineAction(formData: FormData) {
  "use server";

  const baselineId = formData.get("baselineId");
  if (typeof baselineId !== "string" || !baselineId.trim()) {
    throw new Error("Missing baselineId");
  }

  await adminServerFetch(`/admin/baselines/${baselineId}`, "Delete baseline", {
    method: "DELETE",
  });

  revalidatePath("/admin/baselines");
}

export default async function AdminBaselinesPage() {
  try {
    const baselines = await loadBaselines();

    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Baselines</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Baseline catalogue
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Review baseline versions, locked status, and delete baselines with linked records.
          </p>
        </header>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-black/40">
          <div className="px-4 py-3 text-xs uppercase tracking-[0.25em] text-slate-400">
            Baselines
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name / ID</th>
                  <th className="px-4 py-3">Locked status</th>
                  <th className="px-4 py-3">Updated at</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {baselines.map((baseline) => (
                  <tr key={baseline.id} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      <Link
                        className="text-amber-300 hover:text-amber-200"
                        href={`/admin/baselines/${baseline.id}`}
                      >
                        {baseline.originalFilename ?? baseline.id}
                      </Link>
                      <p className="text-xs text-slate-500">{baseline.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {lockedLabel(baseline.status)}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {formatDate(baseline.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <form action={deleteBaselineAction}>
                        <input type="hidden" name="baselineId" value={baseline.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-rose-500/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-200 hover:bg-rose-600/20"
                        >
                          Delete baseline
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to load baselines.";

    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Baselines</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Baseline catalogue
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Review baseline versions and their locked status.
          </p>
        </header>

        <section className="rounded-3xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm font-medium text-rose-200">
          Unable to load baselines: {message}
        </section>
      </div>
    );
  }
}
