import { NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE = "auth_token";

function buildErrorMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    return message.join(", ");
  }

  return "Authentication failed";
}

export async function forwardAuthRequest(
  endpoint: string,
  body: Record<string, unknown>,
) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured" },
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
    accessToken?: string;
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
    return NextResponse.json({ error: errorMessage }, { status: apiResponse.status });
  }

  const response = NextResponse.json({ user: data?.user ?? null });

  if (data?.accessToken) {
    response.cookies.set({
      name: ACCESS_TOKEN_COOKIE,
      value: data.accessToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}

export function clearAuthCookie() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    maxAge: 0,
  });
  return response;
}
