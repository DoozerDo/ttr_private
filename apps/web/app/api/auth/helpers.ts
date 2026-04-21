import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { backendFetch, isBackendUnavailableResponse } from "../_lib/backendFetch";
import {
  getRequiredServerApiBaseUrl,
  UpstreamApiConfigError,
} from "../_lib/serverApiConfig";

const LEGACY_AUTH_COOKIE_NAME = "ttr_token";

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

  const cookieToken =
    req.cookies.get(AUTH_COOKIE_NAME)?.value ??
    req.cookies.get(LEGACY_AUTH_COOKIE_NAME)?.value ??
    "";
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
  let authApiBaseUrl: string;
  try {
    authApiBaseUrl = getRequiredServerApiBaseUrl();
  } catch (error) {
    const configError =
      error instanceof UpstreamApiConfigError
        ? error
        : new UpstreamApiConfigError(
            "UPSTREAM_API_URL_MALFORMED",
            "Unexpected server API base URL configuration error.",
          );
    console.error("Auth proxy upstream config error", {
      code: configError.code,
      message: configError.message,
      details: configError.details,
      endpoint,
    });
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable. Please retry shortly.",
      },
      { status: 503 },
    );
  }

  const apiUrl = `${authApiBaseUrl}${endpoint}`;
  const body = await req.text();
  let apiResponse: Response;

  try {
    apiResponse = await backendFetch(apiUrl, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        cookie: req.headers.get("cookie") ?? "",
        authorization: req.headers.get("authorization") ?? "",
      },
      body: body || undefined,
    });
  } catch (error) {
    console.error("Auth request failed", error);
    return NextResponse.json({ error: "Unable to reach API" }, { status: 500 });
  }

  if (await isBackendUnavailableResponse(apiResponse)) {
    return apiResponse;
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
