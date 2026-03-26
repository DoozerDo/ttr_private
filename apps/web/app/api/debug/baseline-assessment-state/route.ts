import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayJsonResponse, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (error) {
    return error;
  }

  const baselineId = req.nextUrl.searchParams.get("baselineId")?.trim();
  if (!baselineId) {
    return NextResponse.json({ error: "baselineId is required" }, { status: 400 });
  }

  const url = `${baseUrl}/baselines/debug/baseline-assessment-state?baselineId=${encodeURIComponent(
    baselineId,
  )}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayJsonResponse(response);
}
