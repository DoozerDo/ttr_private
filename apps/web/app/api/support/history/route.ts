import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

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

  if (!token) {
    return error;
  }

  const upstreamUrl = new URL(`${baseUrl}/support/history`);
  const page = req.nextUrl.searchParams.get("page");
  if (page) {
    upstreamUrl.searchParams.set("page", page);
  }

  const response = await fetch(upstreamUrl.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}
