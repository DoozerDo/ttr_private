import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import {
  getApiBaseUrl,
  relayJsonResponse,
  requireAuthToken,
} from "../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (error || !token) {
    return error;
  }

  const days = req.nextUrl.searchParams.get("days");
  const qs = days ? `?days=${encodeURIComponent(days)}` : "";

  try {
    const response = await backendFetch(`${baseUrl}/analytics/summary${qs}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return relayJsonResponse(response);
  } catch (fetchError) {
    console.error("Failed to fetch analytics summary", fetchError);
    return NextResponse.json(
      { error: "Unable to reach analytics service" },
      { status: 502 },
    );
  }
}
