import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayJsonResponse,
  requireAuthToken,
} from "../../baselines/helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (error) {
    return error;
  }

  try {
    const payload = await req.json();
    const response = await fetch(`${baseUrl}/analysis/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        baselineId: payload?.baselineId,
        jobId: payload?.jobId,
        debug: payload?.debug,
      }),
    });

    return relayJsonResponse(response);
  } catch (error) {
    console.error("Failed to run fit assessment", error);
    return NextResponse.json(
      {
        error: "Unable to reach the fit assessment service",
      },
      { status: 502 },
    );
  }
}
