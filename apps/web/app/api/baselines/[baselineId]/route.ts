import { NextRequest, NextResponse } from "next/server";

import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../helpers";
import {
  backendFetch,
  isBackendUnavailableResponse,
} from "../../_lib/backendFetch";

export const runtime = "nodejs";

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

  const response = await backendFetch(`${baseUrl}/baselines/${baselineId}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (await isBackendUnavailableResponse(response)) {
    return response;
  }

  return relayApiResponse(response);
}
