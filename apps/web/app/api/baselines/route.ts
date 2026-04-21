import { NextRequest, NextResponse } from "next/server";
import { backendFetch, isBackendUnavailableResponse } from "../_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "./helpers";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  if (!auth.token) return auth.error;

  const search = req.nextUrl.search || "";
  const response = await backendFetch(`${baseUrl}/baselines${search}`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  if (await isBackendUnavailableResponse(response)) {
    return response;
  }

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  if (!auth.token) return auth.error;

  const contentType = req.headers.get("content-type") ?? "";
  let response: Response;

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    // For multipart uploads, preserve the original stream + boundary.
    // Parsing via `req.formData()` can destroy the boundary and/or buffer the payload.
    const incomingAuthHeader = req.headers.get("authorization");
    const incomingCookieHeader = req.headers.get("cookie");
    const csrfHeader = req.headers.get("x-csrf-token");

    const tokenFromCookie =
      req.cookies.get(AUTH_COOKIE_NAME)?.value ?? auth.token ?? "";
    const outgoingAuth =
      incomingAuthHeader?.trim() || (tokenFromCookie ? `Bearer ${tokenFromCookie}` : "");

    const proxiedHeaders: Record<string, string> = {};
    if (outgoingAuth) {
      proxiedHeaders.Authorization = outgoingAuth;
    }
    if (incomingCookieHeader) {
      proxiedHeaders.Cookie = incomingCookieHeader;
    }
    if (csrfHeader) {
      proxiedHeaders["x-csrf-token"] = csrfHeader;
    }
    // Preserve multipart boundary exactly.
    proxiedHeaders["content-type"] = contentType;
    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      proxiedHeaders["content-length"] = contentLength;
    }

    response = await backendFetch(`${baseUrl}/baselines`, {
      method: "POST",
      headers: proxiedHeaders,
      // @ts-expect-error - undici requires duplex when streaming request bodies in Node.
      duplex: "half",
      body: req.body,
    });
  } else {
    const body = await req.json();

    response = await backendFetch(`${baseUrl}/baselines`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (await isBackendUnavailableResponse(response)) {
    return response;
  }

  return relayApiResponse(response);
}
