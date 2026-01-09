import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getApiBaseUrl,
  relayApiResponse,
  requireAdminOrBypass,
} from "../../helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const guard = requireAdminOrBypass(req);

  if ("error" in guard) {
    return guard.error;
  }

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  const body = await req.json();

  const response = await fetch(`${baseUrl}/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  return relayApiResponse(response);
}
