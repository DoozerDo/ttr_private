import { revalidatePath } from "next/cache";
import { adminServerFetch } from "../_lib/adminServerFetch";

type AdminUserRow = {
  id: string;
  email: string | null;
  accountType: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

async function loadUsers(): Promise<AdminUserRow[]> {
  return adminServerFetch<AdminUserRow[]>("/admin/users", "Load admin users");
}

async function deleteUserAction(formData: FormData) {
  "use server";

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Missing userId");
  }

  await adminServerFetch(`/admin/users/${userId}`, "Delete user", {
    method: "DELETE",
  });

  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  try {
    const users = await loadUsers();

    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Admins</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Admin users
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            List of registered users and their account tiers.
          </p>
        </header>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-black/40">
          <div className="px-4 py-3 text-xs uppercase tracking-[0.25em] text-slate-400">Users</div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Account type</th>
                  <th className="px-4 py-3">Created at</th>
                  <th className="px-4 py-3">Updated at</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-white/10">
                    <td className="px-4 py-3 text-slate-100">{user.email ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-slate-200">{user.accountType ?? "free"}</td>
                    <td className="px-4 py-3 text-slate-200">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-200">{formatDate(user.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <form action={deleteUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-rose-500/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-200 hover:bg-rose-600/20"
                        >
                          Delete user
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
    const message = error instanceof Error ? error.message : "Unable to load users.";

    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Admins</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Admin users
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            List of registered users and their account tiers.
          </p>
        </header>

        <section className="rounded-3xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm font-medium text-rose-200">
          Unable to load users: {message}
        </section>
      </div>
    );
  }
}
