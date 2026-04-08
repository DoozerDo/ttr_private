import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { type BaselineDto, getActiveBaselines } from "@/lib/baselines";
import { FirstRunClient } from "./FirstRunClient";

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

async function fetchBaselines(): Promise<BaselineDto[]> {
  try {
    const response = await fetch(
      await buildInternalApiUrl("/api/baselines?includeArchived=true"),
      await buildInternalFetchOptions(),
    );

    if (response.status === 401) {
      redirect("/auth/login");
      return [];
    }

    if (!response.ok) {
      throw new Error((await response.text()) || "Unable to load baselines");
    }

    return (await response.json()) as BaselineDto[];
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }

    console.error("Failed to fetch baselines for first-run", error);
    return [];
  }
}

export default async function FirstRunPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login?next=/first-run");
  }

  const baselines = await fetchBaselines();
  const activeBaselines = getActiveBaselines(baselines);

  if (activeBaselines.length > 0) {
    redirect("/baseline");
    return null;
  }

  return <FirstRunClient archivedBaselineCount={baselines.length - activeBaselines.length} />;
}
