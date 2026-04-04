import { NextRequest, NextResponse } from "next/server";
import { relayApiResponse } from "../baselines/helpers";
import {
  ensureJobTrackerBaseUrl,
  resolveJobTrackerProxyHeaders,
} from "./helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = ensureJobTrackerBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  const resolved = resolveJobTrackerProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const response = await fetch(`${baseUrl}/job-tracker`, {
    method: "GET",
    cache: "no-store",
    headers: resolved.headers,
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = ensureJobTrackerBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  const resolved = resolveJobTrackerProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const body = await req.json();

  const response = await fetch(`${baseUrl}/job-tracker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...resolved.headers,
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
