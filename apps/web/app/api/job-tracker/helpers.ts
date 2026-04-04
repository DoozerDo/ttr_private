import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, requireAuthToken } from "../baselines/helpers";

const DEV_USER_ID = process.env.DEV_USER_ID?.trim();
const IS_PROD = process.env.NODE_ENV === "production";

export function resolveJobTrackerProxyHeaders(req: NextRequest): {
  headers?: Record<string, string>;
  error?: NextResponse;
} {
  const auth = requireAuthToken(req);

  if (IS_PROD && !auth.token) {
    return { error: auth.error };
  }

  if (!IS_PROD && !auth.token && !DEV_USER_ID) {
    return { error: auth.error };
  }

  const headers: Record<string, string> = {};
  if (auth.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  if (DEV_USER_ID) {
    headers["x-dev-user-id"] = DEV_USER_ID;
  }

  return { headers };
}

export function ensureJobTrackerBaseUrl(): string | NextResponse {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  return baseUrl;
}
