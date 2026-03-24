import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../baselines/helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (error || !token) return error;

  const response = await backendFetch(`${baseUrl}/admin/run-trigger-evaluation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: await req.text(),
    cache: "no-store",
  });

  return relayApiResponse(response);
}

