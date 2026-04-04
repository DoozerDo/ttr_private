import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import { getApiBaseUrl, relayJsonResponse } from "../../baselines/helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    const response = await backendFetch(`${baseUrl}/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return relayJsonResponse(response);
  } catch (error) {
    console.error("Failed to proxy analytics event", error);
    return NextResponse.json(
      { error: "Unable to reach analytics service" },
      { status: 502 },
    );
  }
}
