import { NextRequest, NextResponse } from "next/server";
import { relayApiResponse } from "../../baselines/helpers";
import {
  ensureOpportunitiesBaseUrl,
  resolveOpportunitiesProxyHeaders,
} from "../helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = ensureOpportunitiesBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  const resolved = resolveOpportunitiesProxyHeaders(req);
  if (resolved.error) {
    return resolved.error;
  }

  const response = await fetch(`${baseUrl}/opportunities/actions-needed`, {
    method: "GET",
    cache: "no-store",
    headers: resolved.headers,
  });

  return relayApiResponse(response);
}

