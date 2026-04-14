import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";
import { UpstreamApiConfigError } from "../../_lib/serverApiConfig";
import { ClientRequestTimeoutError, fetchWithTimeout } from "@/lib/fetchWithTimeout";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { token, error } = requireAuthToken(req);

  if (!token) {
    return error;
  }

  try {
    const baseUrl = getApiBaseUrl();
    const body = await req.text();
    const response = await fetchWithTimeout(`${baseUrl}/support/report-bug`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": req.headers.get("content-type") ?? "application/json",
      },
      body,
    });

    return relayApiResponse(response);
  } catch (error) {
    if (error instanceof UpstreamApiConfigError) {
      return NextResponse.json(
        {
          status: "service_unavailable",
          code: error.code,
          message:
            "Bug reporting service is unavailable right now. Your draft is preserved in the browser, and you can still review support history from Settings.",
          supportPath: "/support/history",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        status: "service_unavailable",
        code: error instanceof ClientRequestTimeoutError ? "UPSTREAM_REQUEST_TIMEOUT" : "UPSTREAM_REQUEST_UNAVAILABLE",
        message:
          "Bug reporting service is unavailable right now. Your draft is preserved in the browser, and you can still review support history from Settings.",
        supportPath: "/support/history",
      },
      { status: 503 },
    );
  }
}
