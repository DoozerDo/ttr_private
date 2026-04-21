import { NextRequest, NextResponse } from "next/server";

import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../helpers";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
) {
  const { baselineId } = await context.params;
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  const auth = requireAuthToken(req);
  if (!auth.token) {
    return auth.error;
  }

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

  const response = await fetch(
    `${baseUrl}/baselines/${encodeURIComponent(baselineId)}/current`,
    {
      method: "PATCH",
      headers: proxiedHeaders,
    },
  );

  return relayApiResponse(response);
}

