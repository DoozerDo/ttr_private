import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../baselines/helpers";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  const auth = requireAuthToken(req);

  if (!("token" in auth)) {
    return auth.error;
  }

  const response = await fetch(`${baseUrl}/analysis/fit-scores`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  return relayApiResponse(response);
}
