"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface AuthStatusProps {
  email: string;
}

export function AuthStatus({ email }: AuthStatusProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data?.error ?? "Logout failed");
        return;
      }

      router.push("/auth/login");
    } catch (logoutError) {
      console.error("Logout failed", logoutError);
      setError("Unable to log out right now");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      className="
        flex flex-col gap-3 rounded-xl
        border border-white/10
        bg-gradient-to-br from-slate-900/60 to-slate-800/40
        p-5 shadow-lg
        sm:flex-row sm:items-center sm:justify-between
      "
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Logged in as
        </p>
        <p className="text-lg font-semibold text-slate-100">
          {email}
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="
            rounded-lg bg-slate-700/70 px-4 py-2
            text-sm font-semibold text-slate-100
            shadow hover:bg-slate-600/80
            disabled:cursor-not-allowed disabled:opacity-60
          "
        >
          {isLoggingOut ? "Logging out…" : "Log out"}
        </button>

        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

