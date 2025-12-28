// apps/web/app/api/baselines/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "./helpers";

function normalizeBaseUrl(input: string) {
  return input.replace(/\/+$/, "").replace(/\/api$/, "");
}

export async function GET(req: NextRequest) {
  const rawBaseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!rawBaseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!token) {
    return error;
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl);

  const response = await fetch(`${baseUrl}/baselines`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const rawBaseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!rawBaseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!token) {
    return error;
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  const formData = await req.formData();

  const response = await fetch(`${baseUrl}/baselines`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return relayApiResponse(response);
}
