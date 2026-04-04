import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../baselines/helpers";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (error) {
    return error;
  }

  const search = req.nextUrl.search || "";
  const response = await fetch(`${baseUrl}/analysis/fit-assessments${search}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (error) {
    return error;
  }

  const response = await fetch(`${baseUrl}/analysis/fit-assessments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: await req.text(),
  });

  return relayApiResponse(response);
}

