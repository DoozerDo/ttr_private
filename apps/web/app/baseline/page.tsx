import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BaselineDto } from "../../lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";

async function fetchBaselines(token: string): Promise<BaselineDto[]> {
  const baseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    return [];
  }

  const response = await fetch(`${baseUrl}/baselines`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/auth/login");
  }

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as BaselineDto[];
}

export default async function BaselinePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const baselines = await fetchBaselines(token);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
            Baseline library
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Manage your baselines</h1>
          <p className="max-w-3xl text-sm text-gray-700">
            Upload and review your locked baseline résumé. We will parse the document into sections
            that feed tailored résumés, cover letters, and interview prep flows.
          </p>
        </header>

        <BaselineDashboard initialBaselines={baselines} />
      </div>
    </main>
  );
}
