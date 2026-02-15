"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";

function extractMessage(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "Unable to redeem access code.";
  }

  const payload = value as { message?: unknown; error?: unknown };
  if (typeof payload.message === "string" && payload.message.length) {
    return payload.message;
  }
  if (typeof payload.error === "string" && payload.error.length) {
    return payload.error;
  }

  return "Unable to redeem access code.";
}

function needsProfileCompletion(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return true;
  }

  const user = value as {
    roleTitle?: unknown;
    intendedUse?: unknown;
    profileCompletedAt?: unknown;
  };

  return !(
    typeof user.profileCompletedAt === "string" &&
    user.profileCompletedAt.length > 0 &&
    typeof user.roleTitle === "string" &&
    user.roleTitle.trim().length > 0 &&
    typeof user.intendedUse === "string" &&
    user.intendedUse.trim().length > 0
  );
}

export function AccessCodeForm({ initialEmail, returnPath }: { initialEmail: string; returnPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password || !code.trim()) {
      setError("Email, password, and access code are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/redeem-access-code-and-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password, code: code.trim() }),
      });

      const raw = await response.text();
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = null;
        }
      }
      if (!response.ok) {
        setError(extractMessage(body));
        return;
      }

      const targetPath = sanitizeReturnPath(returnPath) ?? "/baseline";
      const meResponse = await fetch("/api/users/me", {
        method: "GET",
        credentials: "include",
      });
      const mePayload = meResponse.ok ? await meResponse.json().catch(() => null) : null;

      if (needsProfileCompletion(mePayload)) {
        const params = new URLSearchParams();
        params.set("next", targetPath);
        router.replace(`/onboarding/profile?${params.toString()}`);
        router.refresh();
        return;
      }

      router.replace(targetPath);
      router.refresh();
    } catch {
      setError("Unable to reach authentication service");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Enter Access Code</h1>
        <p className="text-sm text-gray-600">Your account needs an access code before login.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase" type="text" placeholder="TTR-XXXX-XXXX-XXXX" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} required />
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {isSubmitting ? "Working..." : "Redeem code and log in"}
        </button>
      </form>
    </div>
  );
}
