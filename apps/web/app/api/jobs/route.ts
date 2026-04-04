import { NextRequest, NextResponse } from "next/server";
import { backendFetch, isBackendUnavailableResponse } from "../_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!auth.token) return auth.error;

  const response = await backendFetch(`${baseUrl}/jobs`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  if (await isBackendUnavailableResponse(response)) {
    return response;
  }

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!auth.token) return auth.error;

  const body = await req.json();

  const response = await backendFetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (await isBackendUnavailableResponse(response)) {
    return response;
  }

  return relayApiResponse(response);
}
