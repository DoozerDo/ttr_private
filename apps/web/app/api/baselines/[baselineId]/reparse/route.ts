import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
) {
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

  const { baselineId } = await context.params;

  const body = await req.json().catch(() => null);

  const response = await fetch(`${baseUrl}/baselines/${baselineId}/reparse`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return relayApiResponse(response);
}
