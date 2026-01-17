import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";

function getApiBaseUrl() {
  const serverBaseUrl = process.env.API_BASE_URL;
  const clientBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  return serverBaseUrl ?? clientBaseUrl ?? null;
}

export function getAuthCookieName(): string {
  return AUTH_COOKIE_NAME;
}

function buildErrorMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    return message.join(", ");
  }

  return "Authentication failed";
}

function isSecureRequest(req?: NextRequest): boolean {
  if (!req) {
    return process.env.NODE_ENV === "production";
  }

  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  return req.nextUrl?.protocol === "https:";
}

export function setAuthCookie(
  response: NextResponse,
  token: string,
  req?: NextRequest,
): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    path: "/",
    httpOnly: true,
    maxAge: 0,
  });
}

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
  body: Record<string, unknown>,
) {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  let apiResponse: Response;

  try {
    apiResponse = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("Auth request failed", error);
    return NextResponse.json({ error: "Unable to reach API" }, { status: 500 });
  }

  type AuthApiResponse = {
    token?: string;
    accessToken?: string;
    data?: {
      token?: string;
      accessToken?: string;
    };
    user?: unknown;
    message?: unknown;
  } | null;

  let data: AuthApiResponse = null;

  try {
    data = await apiResponse.json();
  } catch (error) {
    console.error("Failed to parse auth response", error);
  }

  if (!apiResponse.ok) {
    const errorMessage = buildErrorMessage(data?.message);
    return NextResponse.json(
      { error: errorMessage },
      { status: apiResponse.status },
    );
  }

  const response = NextResponse.json({ user: data?.user ?? null });

  const token =
    data?.accessToken ??
    data?.token ??
    data?.data?.token ??
    data?.data?.accessToken ??
    "";

  if (token) {
    setAuthCookie(response, token, req);
  }

  return response;
}
