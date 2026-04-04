import { NextRequest, NextResponse } from "next/server";
import { relayApiResponse } from "../baselines/helpers";
import {
  ensureOpportunitiesBaseUrl,
  resolveOpportunitiesProxyHeaders,
} from "./helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = ensureOpportunitiesBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }
  const resolved = resolveOpportunitiesProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const url = new URL(req.url);
  const query = url.searchParams.toString();
  const response = await fetch(
    `${baseUrl}/opportunities${query ? `?${query}` : ""}`,
    {
      method: "GET",
      cache: "no-store",
      headers: resolved.headers,
    },
  );
  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = ensureOpportunitiesBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }
  const resolved = resolveOpportunitiesProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const body = await req.json();
  const response = await fetch(`${baseUrl}/opportunities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...resolved.headers,
    },
    body: JSON.stringify(body),
  });
  return relayApiResponse(response);
}

