"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirming your email...");

  useEffect(() => {
    async function runConfirmation() {
      if (!token) {
        setStatus("error");
        setMessage("Missing confirmation token.");
        return;
      }

      try {
        const response = await fetch(`/api/auth/confirm?token=${encodeURIComponent(token)}`, {
          method: "GET",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setStatus("error");
          setMessage(data?.message ?? "Unable to confirm email.");
          return;
        }

        setStatus("success");
        setMessage(data?.message ?? "Email confirmed. You can now log in.");
      } catch (error) {
        console.error("Failed to confirm email", error);
        setStatus("error");
        setMessage("Unable to confirm email.");
      }
    }

    void runConfirmation();
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="mx-auto w-full max-w-md space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Email Confirmation</h1>
        <p
          className={
            status === "error"
              ? "rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"
          }
        >
          {message}
        </p>
        <Link href="/auth/login" className="inline-block text-sm font-semibold text-blue-600 hover:underline">
          Go to login
        </Link>
      </div>
    </main>
  );
}
