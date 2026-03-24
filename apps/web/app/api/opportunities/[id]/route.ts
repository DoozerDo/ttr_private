import { NextRequest, NextResponse } from "next/server";
import { relayApiResponse } from "../../baselines/helpers";
import {
  ensureOpportunitiesBaseUrl,
  resolveOpportunitiesProxyHeaders,
} from "../helpers";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const baseUrl = ensureOpportunitiesBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }
  const resolved = resolveOpportunitiesProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const { id } = await context.params;
  const body = await req.json();
  const response = await fetch(`${baseUrl}/opportunities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...resolved.headers,
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}

