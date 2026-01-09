'use client';

import { useEffect, useMemo, useState } from "react";

import { ApiResponseError, apiFetchJson } from "../../lib/api";
import { Alert } from "@/components/Alert";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

type AccountType = "free" | "paid";

type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  accountType: AccountType;
};

type ConfirmState = {
  userId: string;
  email: string;
  current: AccountType;
  next: AccountType;
} | null;

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
];

function formatDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function accountTypeLabel(value: AccountType): string {
  return value === "paid" ? "Paid" : "Free";
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiResponseError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, AccountType>>({});
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await apiFetchJson<AdminUserRow[]>("/api/admin/users");
      setUsers(data);
      setDrafts(Object.fromEntries(data.map((user) => [user.id, user.accountType])));
    } catch (fetchError) {
      setError(resolveErrorMessage(fetchError, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function applyChange() {
    if (!confirmState) {
      return;
    }

    const { userId, email, next } = confirmState;
    setUpdatingId(userId);
    setError("");
    setNotice("");

    // Optional improvement: optimistic UI update
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, accountType: next } : user)),
    );

    try {
      // Some backends return a partial user; merge instead of replace.
      const updated = await apiFetchJson<Partial<AdminUserRow>>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ accountType: next }),
      });

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? {
                ...user,
                ...updated,
                accountType: (updated.accountType ?? next) as AccountType,
              }
            : user,
        ),
      );

      setDrafts((prev) => ({
        ...prev,
        [userId]: (updated.accountType ?? next) as AccountType,
      }));

      setNotice(`${email} is now ${accountTypeLabel((updated.accountType ?? next) as AccountType)}.`);
    } catch (updateError) {
      // Revert to server state by reloading if update failed.
      setError(resolveErrorMessage(updateError, "Failed to update account type"));
      void loadUsers();
    } finally {
      setUpdatingId(null);
      setConfirmState(null);
    }
  }

  function requestChange(user: AdminUserRow) {
    const next = drafts[user.id] ?? user.accountType;
    if (next === user.accountType) {
      return;
    }

    setConfirmState({
      userId: user.id,
      email: user.email,
      current: user.accountType,
      next,
    });
  }

  function handleAccountTypeChange(userId: string, value: AccountType) {
    setDrafts((prev) => ({ ...prev, [userId]: value }));
  }

  const navItems = useMemo(
    () => [{ label: "Users", href: "/admin/users", active: true, description: "Account types" }],
    [],
  );

  return (
    <PageShell className="space-y-6" navItems={navItems}>
      <div className="space-y-6">
        <PageHeader
          title="Admin users"
          description="Review all registered emails and switch between the free and paid tiers."
          rightSlot={
            <FormButton variant="ghost" onClick={() => void loadUsers()} disabled={loading}>
              Refresh
            </FormButton>
          }
        />

        {(error || notice) && (
          <div className="space-y-3">
            {error ? <Alert intent="error">{error}</Alert> : null}
            {notice ? <Alert intent="success">{notice}</Alert> : null}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-black/40">
          <div className="px-4 py-3 text-xs uppercase tracking-[0.25em] text-slate-400">Users</div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6">
                <EmptyState title="Loading users" body="Fetching records from the API..." />
              </div>
            ) : users.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No users yet"
                  body="Invite yourselves a few times or create accounts via the API."
                  cta={
                    <FormButton variant="ghost" onClick={() => void loadUsers()}>
                      Refresh
                    </FormButton>
                  }
                />
              </div>
            ) : (
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Sign up date</th>
                    <th className="px-4 py-3">Account type</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const selectedType = drafts[user.id] ?? user.accountType;
                    const hasChange = selectedType !== user.accountType;
                    const isBusy = updatingId === user.id;

                    return (
                      <tr key={user.id} className="border-t border-white/10">
                        <td className="max-w-[280px] px-4 py-3 text-slate-100">{user.email}</td>
                        <td className="px-4 py-3 text-slate-200">{formatDate(user.createdAt)}</td>
                        <td className="px-4 py-3 text-slate-200">{accountTypeLabel(user.accountType)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <select
                              className="w-full min-w-[140px] rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400 focus:bg-white/10"
                              value={selectedType}
                              onChange={(event) =>
                                handleAccountTypeChange(user.id, event.target.value as AccountType)
                              }
                              disabled={isBusy}
                            >
                              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <FormButton
                              variant="secondary"
                              disabled={!hasChange || isBusy}
                              onClick={() => requestChange(user)}
                              className="px-4 py-2 text-xs"
                            >
                              {isBusy ? "Saving..." : "Save"}
                            </FormButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title="Confirm tier change"
        description={
          confirmState
            ? `Change ${confirmState.email} from ${accountTypeLabel(confirmState.current)} to ${accountTypeLabel(
                confirmState.next,
              )}?`
            : undefined
        }
        onConfirm={() => void applyChange()}
        onCancel={() => setConfirmState(null)}
        confirmLabel="Apply change"
        cancelLabel="Cancel"
        busy={Boolean(updatingId)}
      />
    </PageShell>
  );
}

