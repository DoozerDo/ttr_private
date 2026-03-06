import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminServerFetch } from "../_lib/adminServerFetch";
import { CopyCodeButton } from "./CopyCodeButton";

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

type AdminUserRow = {
  id: string;
  email: string | null;
};

type SearchParamsShape = {
  generatedCode?: string | string[];
};

type GeneratedAccessCodeResponse = {
  id: string;
  code: string;
  codePrefix: string;
  createdAt: string;
  assignedUserId: string | null;
  notes: string | null;
};

function unwrapArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as { data?: unknown; items?: unknown };

    if (Array.isArray(candidate.data)) {
      return candidate.data as T[];
    }

    if (Array.isArray(candidate.items)) {
      return candidate.items as T[];
    }
  }

  return [];
}

async function loadCodes() {
  const payload = await adminServerFetch<unknown>("/admin/access-codes", "Load access codes");
  return unwrapArrayPayload<AccessCodeRow>(payload);
}

async function loadUsers() {
  const payload = await adminServerFetch<unknown>(
    "/admin/users",
    "Load admin users for access code assignment",
  );
  return unwrapArrayPayload<AdminUserRow>(payload);
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
  searchParams?: SearchParamsShape | Promise<SearchParamsShape>;
}) {
  let rows: AccessCodeRow[] = [];
  let users: AdminUserRow[] = [];
  let resolvedSearchParams: SearchParamsShape = {};
  let loadError: string | null = null;

  try {
    [rows, users, resolvedSearchParams] = await Promise.all([
      loadCodes(),
      loadUsers(),
      Promise.resolve(searchParams ?? {}),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load access codes.";
  }

  const generatedCodeParam = resolvedSearchParams.generatedCode;
  const generatedCode =
    (Array.isArray(generatedCodeParam)
      ? generatedCodeParam[0]
      : generatedCodeParam
    )?.trim() || "";

  const assignedUserIds = new Set(
    rows
      .filter((row) => row?.status === "assigned")
      .map((row) => row?.assignedUserId)
      .filter((id): id is string => Boolean(id)),
  );

  const sortedAssignableUsers = users
    .filter((user) => !assignedUserIds.has(user.id))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Admins</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Access codes</h1>
        <p className="mt-2 text-sm text-slate-300">
          Generate and manage one-time access codes. Code values are hashed at rest and only visible right after generation.
        </p>
      </header>

      {loadError ? (
        <section className="rounded-3xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm font-medium text-rose-200">
          Unable to load access codes: {loadError}
        </section>
      ) : null}

      {generatedCode ? (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Code generated (shown once)</p>
          <p className="mt-2 font-mono text-lg text-emerald-100">{generatedCode}</p>
          <CopyCodeButton code={generatedCode} />
          <p className="mt-1 text-xs text-emerald-200/90">Copy and share this now. It cannot be revealed later.</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <form action={generateAction} className="grid gap-3 md:grid-cols-3">
          <select
            name="assignedUserId"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">Unassigned</option>
            {sortedAssignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email ?? user.id}
              </option>
            ))}
          </select>
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
            {rows.map((row) => {
              const availableUsers = users
                .filter((user) => !assignedUserIds.has(user.id))
                .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
              const canAssignInTable = row.status === "unused" && !row.assignedUserId;

              return (
                <tr key={row.id} className="border-t border-white/10 align-top">
                  <td className="px-4 py-3">{row.codeMasked}</td>
                  <td className="px-4 py-3">
                    {canAssignInTable ? (
                      <form action={updateAssignmentAction} className="space-y-2">
                        <input type="hidden" name="id" value={row.id} />
                        <select
                          name="assignedUserId"
                          defaultValue=""
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {availableUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.email ?? user.id}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="rounded border border-blue-500/60 px-2 py-1 text-xs text-blue-200"
                          >
                            Save
                          </button>
                        </div>
                        <p className="text-xs text-slate-400">Unassigned</p>
                      </form>
                    ) : (
                      <p className="text-xs text-slate-300">{row.assignedUserEmail ?? "Unassigned"}</p>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
