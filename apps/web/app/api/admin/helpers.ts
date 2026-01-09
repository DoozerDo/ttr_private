import { NextRequest, NextResponse } from "next/server";

/**
 * Resolve the API base URL for server side route handlers.
 * Priority: API_BASE_URL, then NEXT_PUBLIC_API_BASE_URL, then http://localhost:3001
 */
export function getApiBaseUrl(): string | null {
  const fromServer = process.env.API_BASE_URL;
  if (fromServer && fromServer.trim()) return fromServer.trim();

  const fromPublic = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromPublic && fromPublic.trim()) return fromPublic.trim();

  // Safe default for local dev
  return "http://localhost:3001";
}

/**
 * Relay an upstream API response through Next.js route handlers without losing status.
 * Tries to preserve content type and body.
 */
export async function relayApiResponse(response: Response): Promise<NextResponse> {
  const contentType = response.headers.get("content-type") || "";

  // Copy a small, safe subset of headers
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);

  // If upstream returns no content, pass through cleanly
  if (response.status === 204) {
    return new NextResponse(null, { status: 204, headers });
  }

  // Prefer JSON when upstream says JSON
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    return NextResponse.json(data, { status: response.status, headers });
  }

  // Fallback: treat as text
  const text = await response.text().catch(() => "");
  return new NextResponse(text, { status: response.status, headers });
}

/**
 * Dev only admin requirement for Next.js proxy routes.
 * In production, this intentionally blocks all access until real auth is integrated.
 *
 * Dev behavior:
 * Requires x-dev-user-id header to be present so the proxy can forward it to the API,
 * where the API guard checks admin_users membership.
 */
export function requireAdminDevOnly(req: NextRequest):
  | { ok: true }
  | { error: NextResponse } {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    return {
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  const devUserId = req.headers.get("x-dev-user-id")?.trim();

  if (!devUserId) {
    return {
      error: NextResponse.json(
        {
          error: "Admin access required",
          detail: "Missing x-dev-user-id header in dev",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}

/**
 * Backwards compatible export name. This replaces the old bypass concept.
 * Keep route handlers importing requireAdminOrBypass from breaking.
 */
export function requireAdminOrBypass(req: NextRequest):
  | { ok: true }
  | { error: NextResponse } {
  return requireAdminDevOnly(req);
}

