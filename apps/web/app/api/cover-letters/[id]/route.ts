import { NextRequest, NextResponse } from "next/server";

import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!auth.token) {
    return auth.error;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing id parameter" },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${baseUrl}/cover-letters/${encodeURIComponent(id)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    },
  );

  return relayApiResponse(response);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!auth.token) {
    return auth.error;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing id parameter" },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${baseUrl}/cover-letters/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    },
  );

  return relayApiResponse(response);
}
