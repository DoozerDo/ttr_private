import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../helpers";

async function handleArchiveRequest(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!token) {
    return error;
  }

  const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(id)}/archive`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}

export const POST = handleArchiveRequest;
export const PATCH = handleArchiveRequest;
