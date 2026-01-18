import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string; baselineId: string }> },
) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!auth.token) return auth.error;

  const { jobId, baselineId } = await context.params;

  if (!jobId || !baselineId) {
    return NextResponse.json(
      { error: "Missing jobId or baselineId parameter" },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${baseUrl}/analysis/job/${encodeURIComponent(
      jobId,
    )}/baseline/${encodeURIComponent(baselineId)}/latest`,
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
