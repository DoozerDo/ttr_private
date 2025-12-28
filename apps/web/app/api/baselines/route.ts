import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "./helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  if (!auth.token) return auth.error;

  const response = await fetch(`${baseUrl}/baselines`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  if (!auth.token) return auth.error;

  const contentType = req.headers.get("content-type") || "";

  // Primary: accept multipart/form-data and forward as-is to the API.
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();

    const response = await fetch(`${baseUrl}/baselines`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        // Do NOT set Content-Type here. Fetch will set the boundary for FormData.
      },
      body: formData,
    });

    return relayApiResponse(response);
  }

  // Fallback: support JSON for any callers that still POST JSON.
  // Note: backend upload expects multipart, so JSON callers may still fail server-side.
  // Keeping this prevents hard crashes if a client is still sending JSON.
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const response = await fetch(`${baseUrl}/baselines`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  return relayApiResponse(response);
}

