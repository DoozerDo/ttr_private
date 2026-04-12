import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);
  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!token) return error;

  const response = await backendFetch(`${baseUrl}/admin/synthetics${req.nextUrl.search || ""}`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const ingestToken = process.env.SYNTHETIC_INGEST_TOKEN?.trim() || "synthetic-ingest-local";
  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") ?? "application/json",
    "x-synthetic-ingest-token": ingestToken,
  };

  const response = await backendFetch(`${baseUrl}/admin/synthetics/runs`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: await req.text(),
  });
  return relayApiResponse(response);
}
