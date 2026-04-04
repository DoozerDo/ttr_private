import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);
  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!token) return error;
  const { id } = await context.params;
  const response = await backendFetch(`${baseUrl}/bug-reports/${id}`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  return relayApiResponse(response);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);
  if (!baseUrl) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  if (!token) return error;
  const { id } = await context.params;
  const body = await req.text();
  const response = await backendFetch(`${baseUrl}/bug-reports/${id}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    body,
  });
  return relayApiResponse(response);
}
