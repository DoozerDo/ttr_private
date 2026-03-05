import { NextRequest, NextResponse } from "next/server";
import { relayApiResponse } from "../../../baselines/helpers";
import {
  ensureOpportunitiesBaseUrl,
  resolveOpportunitiesProxyHeaders,
} from "../../helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const baseUrl = ensureOpportunitiesBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  const resolved = resolveOpportunitiesProxyHeaders(req);
  if (resolved.error) {
    return resolved.error;
  }

  const { id } = await context.params;
  const response = await fetch(`${baseUrl}/opportunities/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...resolved.headers,
    },
    body: await req.text(),
  });

  return relayApiResponse(response);
}

