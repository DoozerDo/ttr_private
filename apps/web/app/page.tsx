import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthStatus } from "./components/auth-status";
import { StatusSection } from "./components/status-section";
import { decodeJwt } from "../lib/auth";

export default function Home() {
  const token = cookies().get("auth_token")?.value;

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
          <h1 className="text-3xl font-bold text-gray-900">Target This Role – Dashboard</h1>
          <p className="text-sm text-gray-700">
            Monitor your API status and manage your session.
          </p>
        </header>

        <AuthStatus email={payload.email} />
        <StatusSection />
      </div>
    </main>
  );
}
