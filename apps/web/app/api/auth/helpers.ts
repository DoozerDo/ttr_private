import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { getServerApiBaseUrl } from "@/lib/apiBase";

const AUTH_API_BASE_URL = getServerApiBaseUrl();

export type RequireAuthTokenSuccess = {
  token: string;
  error?: never;
};

export type RequireAuthTokenFailure = {
  token?: never;
  error: NextResponse;
};

export type RequireAuthTokenResult =
  | RequireAuthTokenSuccess
  | RequireAuthTokenFailure;

function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    return "";
  }

  return authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
}

export function requireAuthToken(req: NextRequest): RequireAuthTokenResult {
  const headerToken = extractBearerToken(
    req.headers.get("authorization") ?? req.headers.get("Authorization"),
  );

  const cookieToken = req.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
  const token = headerToken || cookieToken;

  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Missing Authorization token" },
        { status: 401 },
      ),
    };
  }

  return { token };
}

export async function forwardAuthRequest(
  req: NextRequest,
  endpoint: string,
) {
  const apiUrl = `${AUTH_API_BASE_URL}${endpoint}`;
  const body = await req.text();
  let apiResponse: Response;

  try {
    apiResponse = await fetch(apiUrl, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
      },
      body: body || undefined,
    });
  } catch (error) {
    console.error("Auth request failed", error);
    return NextResponse.json({ error: "Unable to reach API" }, { status: 500 });
  }

  const rawBody = await apiResponse.text();
  const response = new NextResponse(rawBody, {
    status: apiResponse.status,
  });

  const contentType = apiResponse.headers.get("content-type");
  if (contentType) {
    response.headers.set("content-type", contentType);
  }

  const setCookie = apiResponse.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
}
