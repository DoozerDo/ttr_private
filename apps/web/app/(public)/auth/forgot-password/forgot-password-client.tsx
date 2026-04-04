"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Unable to request reset.");
      }
      setMessage(payload?.message ?? "If an account exists, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold">Forgot password</h1>
        <label className="block space-y-2 text-sm font-semibold text-gray-700">
          <span>Email</span>
          <input className="w-full rounded-md border border-gray-300 px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {error ? <p className="text-sm text-amber-700">{error}</p> : null}
        <button disabled={loading} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          {loading ? "Sending..." : "Send reset link"}
        </button>
        <p className="text-sm text-slate-200">
          Back to <Link href="/auth/login" className="font-semibold text-blue-300">log in</Link>
        </p>
      </form>
    </main>
  );
}
