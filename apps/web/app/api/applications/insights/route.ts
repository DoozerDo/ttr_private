import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!auth.token) return auth.error;

  const response = await fetch(`${baseUrl}/applications/insights`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  return relayApiResponse(response);
}
