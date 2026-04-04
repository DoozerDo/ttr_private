import { NextResponse } from "next/server";
import { getApiBaseUrl, requireAuthToken } from "../baselines/helpers";
import type { NextRequest } from "next/server";

export function ensureOpportunitiesBaseUrl(): string | NextResponse {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  return baseUrl;
}

export function resolveOpportunitiesProxyHeaders(req: NextRequest): {
  headers?: Record<string, string>;
  error?: NextResponse;
} {
  const auth = requireAuthToken(req);
  if (!auth.token) {
    return { error: auth.error };
  }

  return {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  };
}

