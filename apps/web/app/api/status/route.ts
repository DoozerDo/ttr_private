import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse } from "../baselines/helpers";
import { backendFetch } from "../_lib/backendFetch";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  let baseUrl = "";
  try {
    baseUrl = getApiBaseUrl();
  } catch {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  const response = await backendFetch(`${baseUrl}/status`, {
    method: "GET",
    cache: "no-store",
  });

  return relayApiResponse(response);
}

