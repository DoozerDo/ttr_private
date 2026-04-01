"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function ResetPasswordClient() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? "Unable to reset password.");
      setMessage(payload?.message ?? "Password reset successfully.");
      setTimeout(() => router.replace("/auth/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold">Reset password</h1>
        <label className="block space-y-2 text-sm font-semibold text-gray-700">
          <span>New password</span>
          <input type="password" className="w-full rounded-md border border-gray-300 px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-gray-700">
          <span>Confirm password</span>
          <input type="password" className="w-full rounded-md border border-gray-300 px-3 py-2" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {error ? <p className="text-sm text-amber-700">{error}</p> : null}
        <button className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Reset password</button>
      </form>
    </main>
  );
}
