import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../helpers";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
) {
  const { baselineId } = await context.params;

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

  // VERIFY: Proxy path and method for baseline versions.
  const response = await fetch(`${baseUrl}/baselines/${baselineId}/versions`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}
