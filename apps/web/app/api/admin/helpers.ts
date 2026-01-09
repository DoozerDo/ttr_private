import { NextRequest, NextResponse } from "next/server";

export function getApiBaseUrl(): string | undefined {
  return process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
}

export async function relayApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes('application/json')) {
    const json = await response.json();
    return NextResponse.json(json, { status: response.status });
  }

  const buffer = await response.arrayBuffer();
 const headers = new Headers();
 response.headers.forEach((value, key) => {
   headers.set(key, value);
 });

  return new NextResponse(buffer, {
    status: response.status,
    headers,
  });
}

export type RequireAdminOrBypassSuccess = {
  allowed: true;
};

export type RequireAdminOrBypassFailure = {
  error: NextResponse;
};

export type RequireAdminOrBypassResult =
  | RequireAdminOrBypassSuccess
  | RequireAdminOrBypassFailure;

export function requireAdminOrBypass(
  _request: NextRequest,
): RequireAdminOrBypassResult {
  if (process.env.ADMIN_BYPASS === "true") {
    return { allowed: true };
  }

  // Future: inspect the authenticated user id and verify admin_users membership.
 return {
   error: NextResponse.json(
      { error: "Admin access is disabled until authentication is configured." },
      { status: 403 },
    ),
  };
}
