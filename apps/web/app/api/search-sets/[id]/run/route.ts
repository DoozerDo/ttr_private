import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
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

  const body = await req.json();

  const response = await fetch(`${baseUrl}/search-sets/${id}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
