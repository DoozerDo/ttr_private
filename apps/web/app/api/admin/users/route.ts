import { NextRequest, NextResponse } from "next/server";

import {
  getApiBaseUrl,
  relayApiResponse,
  requireAdminOrBypass,
} from '../helpers';

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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

  const response = await fetch(`${baseUrl}/admin/users`, {
    method: "GET",
    cache: "no-store",
  });

  return relayApiResponse(response);
}
