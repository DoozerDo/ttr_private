import { NextRequest, NextResponse } from "next/server";

import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
): Promise<Response> {
  const { baselineId } = await context.params;
  const searchParams = req.nextUrl.searchParams.toString();

  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!auth.token) {
    return auth.error as Response;
  }

  const query = searchParams ? `?${searchParams}` : "";

  const response = await fetch(`${baseUrl}/baselines/${baselineId}/blocks${query}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  return relayApiResponse(response);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
): Promise<Response> {
  const { baselineId } = await context.params;

  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!auth.token) {
    return auth.error as Response;
  }

  const body = await req.json();

  const response = await fetch(`${baseUrl}/baselines/${baselineId}/blocks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
): Promise<Response> {
  const { baselineId } = await context.params;

  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!auth.token) {
    return auth.error as Response;
  }

  const body = await req.json();

  const response = await fetch(`${baseUrl}/baselines/${baselineId}/blocks`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
