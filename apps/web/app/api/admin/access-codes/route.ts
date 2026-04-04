import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAdminOrBypass } from "../helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const access = requireAdminOrBypass(req);
  if ("error" in access) return access.error;

  const base = getApiBaseUrl();
  if (!base) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });

  const response = await fetch(`${base}/admin/access-codes`, {
    method: "GET",
    headers: {
      "x-dev-user-id": req.headers.get("x-dev-user-id") ?? "",
      authorization: req.headers.get("authorization") ?? "",
      cookie: req.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const access = requireAdminOrBypass(req);
  if ("error" in access) return access.error;

  const base = getApiBaseUrl();
  if (!base) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });

  const body = await req.text();

  const response = await fetch(`${base}/admin/access-codes`, {
    method: "POST",
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      "x-dev-user-id": req.headers.get("x-dev-user-id") ?? "",
      authorization: req.headers.get("authorization") ?? "",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: body || undefined,
    cache: "no-store",
  });

  return relayApiResponse(response);
}
