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
      const response = await fetch("/api/auth/logout", { method: "POST" });

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
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-gray-600">You are logged in as</p>
        <p className="text-lg font-semibold text-gray-900">{email}</p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoggingOut ? "Logging out..." : "Log out"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
