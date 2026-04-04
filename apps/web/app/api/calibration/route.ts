import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!auth.token) return auth.error;

  const response = await fetch(`${baseUrl}/calibration`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!auth.token) return auth.error;

  const body = await req.json();

  if (!body.profileName || typeof body.profileName !== "string") {
    return NextResponse.json({ error: "profileName is required" }, { status: 400 });
  }

  if (!body.weights || typeof body.weights !== "object") {
    return NextResponse.json({ error: "weights are required" }, { status: 400 });
  }

  const response = await fetch(`${baseUrl}/calibration`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
