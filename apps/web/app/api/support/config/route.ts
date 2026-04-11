import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";
import { UpstreamApiConfigError } from "../../_lib/serverApiConfig";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { token, error } = requireAuthToken(req);

  if (!token) {
    return error;
  }

  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetchWithTimeout(`${baseUrl}/support/config`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return relayApiResponse(response);
  } catch (error) {
    if (error instanceof UpstreamApiConfigError) {
      return NextResponse.json(
        {
          status: "configuration_missing",
          code: error.code,
          message: "Support configuration is unavailable in this environment right now.",
        },
        { status: 503 },
      );
    }

    throw error;
  }
}
