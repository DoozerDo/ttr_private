import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (process.env.NODE_ENV !== "production") {
    console.log("[GEN_PATH][WEB][studio.artifacts.route]", {
      nodeEnv: process.env.NODE_ENV ?? null,
      apiBaseUrl: baseUrl ?? null,
      apiBaseUrlEnv: process.env.API_BASE_URL ?? null,
      apiBaseUrlPublicEnv: process.env.NEXT_PUBLIC_API_BASE_URL ?? null,
      search: req.nextUrl.search ?? "",
    });
  }

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!auth.token) return auth.error;

  const search = req.nextUrl.search || "";
  const response = await fetch(`${baseUrl}/studio/artifacts${search}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  return relayApiResponse(response);
}
