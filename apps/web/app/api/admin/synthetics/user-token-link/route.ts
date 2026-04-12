import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import { getApiBaseUrl, relayJsonResponse } from "../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  const ingestToken = process.env.SYNTHETIC_INGEST_TOKEN?.trim() || "synthetic-ingest-local";
  const response = await backendFetch(`${baseUrl}/admin/synthetics/user-token-link${request.nextUrl.search || ""}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "x-synthetic-ingest-token": ingestToken,
    },
  });
  return relayJsonResponse(response);
}
