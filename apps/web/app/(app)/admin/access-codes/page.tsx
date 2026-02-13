import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminServerFetch } from "../_lib/adminServerFetch";

type AccessCodeRow = {
  id: string;
  codeMasked: string;
  status: "unused" | "assigned" | "redeemed" | "revoked";
  assignedUserEmail: string | null;
  assignedUserId: string | null;
  createdAt: string;
  createdByEmail: string | null;
  redeemedAt: string | null;
  notes: string | null;
};

type GeneratedAccessCodeResponse = {
  id: string;
  code: string;
  codePrefix: string;
  createdAt: string;
  assignedUserId: string | null;
  notes: string | null;
};

async function loadCodes() {
  return adminServerFetch<AccessCodeRow[]>("/admin/access-codes", "Load access codes");
}

async function generateAction(formData: FormData) {
  "use server";
  const assignedUserId = (formData.get("assignedUserId") as string | null)?.trim();
  const notes = (formData.get("notes") as string | null)?.trim();

  const result = await adminServerFetch<GeneratedAccessCodeResponse>(
    "/admin/access-codes",
    "Generate access code",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignedUserId: assignedUserId || undefined, notes: notes || undefined }),
    },
  );

  redirect(`/admin/access-codes?generatedCode=${encodeURIComponent(result.code)}`);
}

async function updateAssignmentAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "").trim();
  const assignedUserId = String(formData.get("assignedUserId") || "").trim();

  if (!id) {
    throw new Error("Missing code id");
  }

  await adminServerFetch(`/admin/access-codes/${id}`, "Update access code assignment", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assignedUserId: assignedUserId || null }),
  });

  revalidatePath("/admin/access-codes");
}

async function revokeAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  await adminServerFetch(`/admin/access-codes/${id}`, "Revoke access code", { method: "DELETE" });
  revalidatePath("/admin/access-codes");
}

export default async function AdminAccessCodesPage({
  searchParams,
}: {
  searchParams?: { generatedCode?: string };
}) {
  const rows = await loadCodes();
  const generatedCode = searchParams?.generatedCode?.trim() || "";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Admins</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Access codes</h1>
        <p className="mt-2 text-sm text-slate-300">
          Generate and manage one-time access codes. Code values are hashed at rest and only visible right after generation.
        </p>
      </header>

      {generatedCode ? (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Code generated (shown once)</p>
          <p className="mt-2 font-mono text-lg text-emerald-100">{generatedCode}</p>
          <p className="mt-1 text-xs text-emerald-200/90">Copy and share this now. It cannot be revealed later.</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <form action={generateAction} className="grid gap-3 md:grid-cols-3">
          <input
            name="assignedUserId"
            placeholder="Assigned user id (optional)"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            name="notes"
            placeholder="Notes (optional)"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold">Generate code</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Redeemed</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-white/10 align-top">
                <td className="px-4 py-3">{row.codeMasked}</td>
                <td className="px-4 py-3">
                  <form action={updateAssignmentAction} className="space-y-2">
                    <input type="hidden" name="id" value={row.id} />
                    <input
                      name="assignedUserId"
                      defaultValue={row.assignedUserId ?? ""}
                      placeholder="user id or blank"
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                      disabled={row.status === "redeemed" || row.status === "revoked"}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={row.status === "redeemed" || row.status === "revoked"}
                        className="rounded border border-blue-500/60 px-2 py-1 text-xs text-blue-200 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">{row.assignedUserEmail ?? "Unassigned"}</p>
                  </form>
                </td>
                <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{row.createdByEmail ?? "-"}</td>
                <td className="px-4 py-3">{row.redeemedAt ? new Date(row.redeemedAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3 uppercase">{row.status}</td>
                <td className="px-4 py-3">
                  <form action={revokeAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button className="rounded border border-rose-500/60 px-2 py-1 text-xs">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
