import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, ctx: RouteContext) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  if (!auth.token) return auth.error;

  const { id } = await ctx.params;

  const url = new URL(req.url);
  const baselineVersionId = url.searchParams.get("baselineVersionId")?.trim();

  if (!baselineVersionId) {
    return NextResponse.json(
      { error: "baselineVersionId is required" },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${baseUrl}/search-sets/${encodeURIComponent(id)}/run?baselineVersionId=${encodeURIComponent(
      baselineVersionId,
    )}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
      cache: "no-store",
    },
  );

  return relayApiResponse(response);
}
