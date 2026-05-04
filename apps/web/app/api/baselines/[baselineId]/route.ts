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

  // Diagnostics: occasionally upstream returns 200 with a non-JSON or empty body, which can break RSC loaders.
  // Keep behavior identical; only emit a server-side log to aid debugging.
  try {
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.toLowerCase().includes("application/json") || contentType.toLowerCase().includes("+json");
    if (response.status === 200) {
      const clone = response.clone();
      const raw = await clone.text().catch(() => "");
      const trimmed = raw.trim();
      const suspicious =
        !contentType ||
        !isJson ||
        trimmed.length === 0 ||
        (!trimmed.startsWith("{") && !trimmed.startsWith("["));

      if (suspicious) {
        const excerpt = trimmed.slice(0, 300);
        console.warn("baseline_proxy_suspicious_200_response", {
          baselineId,
          upstreamStatus: response.status,
          upstreamContentType: contentType || null,
          excerpt: excerpt || null,
        });
      }
    }
  } catch {
    // never let diagnostics impact the proxy response
  }

  return relayApiResponse(response);
}
