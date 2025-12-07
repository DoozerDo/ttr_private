import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import Link from "next/link";

import { AuthStatus } from "./components/auth-status";
import { StatusSection } from "./components/status-section";
import { decodeJwt } from "../lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const payload = decodeJwt(token);

  if (!payload?.email) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-2 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-gray-900">
            Target This Role – Dashboard
          </h1>
          <p className="text-sm text-gray-700">
            Monitor your API status and manage your session.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">Navigate</p>
            <p className="text-xs text-gray-700">
              Jump to your baseline library to upload and review your résumé.
            </p>
          </div>
          <Link
            href="/baseline"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
          >
            Go to Baseline
          </Link>
        </div>

        <AuthStatus email={payload.email} />
        <StatusSection />
      </div>
    </main>
  );
}
