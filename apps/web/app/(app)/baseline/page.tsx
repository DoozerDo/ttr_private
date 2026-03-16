import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import type { BaselineDto } from "@/lib/baselines";
import { BaselineStudioHome } from "./BaselineStudioHome";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function buildInternalApiUrl(path: string) {
  const headerList = await headers();
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL;
  const baseUrl = fallbackBase ?? (host ? `${protocol}://${host}` : null);

  return new URL(path, baseUrl ?? "http://localhost:3000").toString();
}

async function buildInternalFetchOptions(): Promise<RequestInit> {
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie");

  return {
    cache: "no-store",
    credentials: "include",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  };
}

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function fetchBaselines(): Promise<BaselineDto[]> {
  try {
    const res = await fetch(
      await buildInternalApiUrl("/api/baselines?includeArchived=true"),
      await buildInternalFetchOptions(),
    );

    if (res.status === 401) {
      redirect("/auth/login");
    }

    if (!res.ok) {
      throw new Error((await res.text()) || "Unable to load baselines");
    }

    return (await res.json()) as BaselineDto[];
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("Failed to fetch baselines", error);
    return [];
  }
}

export default async function BaselinePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const baselines = await fetchBaselines();

  return <BaselineStudioHome baselines={baselines} />;
}
