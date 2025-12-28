import { NextRequest, NextResponse } from "next/server";

export function getApiBaseUrl(): string | undefined {
  return process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
}

export async function relayApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await response.json();
    return NextResponse.json(json, { status: response.status });
  }

  const text = await response.text();
  return new NextResponse(text, { status: response.status });
}

export type RequireAuthTokenSuccess = {
  token: string;
  error?: never;
};

export type RequireAuthTokenFailure = {
  token?: never;
  error: NextResponse;
};

export type RequireAuthTokenResult = RequireAuthTokenSuccess | RequireAuthTokenFailure;

export function requireAuthToken(req: NextRequest): RequireAuthTokenResult {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) {
    return {
      error: NextResponse.json({ error: "Missing Authorization token" }, { status: 401 }),
    };
  }

  return { token };
}
