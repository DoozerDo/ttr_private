import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!token) {
    return error;
  }

  const upstreamUrl = new URL(`${baseUrl}/beta-feedback`);
  const severity = req.nextUrl.searchParams.get("severity");
  const category = req.nextUrl.searchParams.get("category");
  if (severity) upstreamUrl.searchParams.set("severity", severity);
  if (category) upstreamUrl.searchParams.set("category", category);

  const response = await fetch(upstreamUrl.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!token) {
    return error;
  }

  const body = await req.text();
  const response = await fetch(`${baseUrl}/beta-feedback`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    body,
  });

  return relayApiResponse(response);
}
