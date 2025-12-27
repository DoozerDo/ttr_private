import { NextRequest, NextResponse } from "next/server";

import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../baselines/helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
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

  const response = await fetch(`${baseUrl}/jobs/${params.id}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}
