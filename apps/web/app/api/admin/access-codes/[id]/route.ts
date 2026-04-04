import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAdminOrBypass } from "../../helpers";

export const runtime = "nodejs";

async function send(req: NextRequest, method: string, id: string) {
  const access = requireAdminOrBypass(req);
  if ("error" in access) return access.error;

  const base = getApiBaseUrl();
  if (!base) return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });

  const body = method === "PATCH" ? await req.text() : undefined;

  const response = await fetch(`${base}/admin/access-codes/${id}`, {
    method,
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      "x-dev-user-id": req.headers.get("x-dev-user-id") ?? "",
      authorization: req.headers.get("authorization") ?? "",
      cookie: req.headers.get("cookie") ?? "",
    },
    body,
    cache: "no-store",
  });

  return relayApiResponse(response);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return send(req, "PATCH", id);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return send(req, "DELETE", id);
}
