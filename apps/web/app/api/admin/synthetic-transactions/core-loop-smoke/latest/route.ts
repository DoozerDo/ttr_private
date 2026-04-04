import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);
  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!token) return error;

  const response = await backendFetch(`${baseUrl}/admin/synthetic-transactions/core-loop-smoke/latest`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  return relayApiResponse(response);
}
