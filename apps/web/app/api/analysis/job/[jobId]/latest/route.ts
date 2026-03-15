import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayJsonResponse,
  requireAuthToken,
} from "../../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
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

  const { jobId } = await context.params;

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId parameter" },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${baseUrl}/analysis/job/${encodeURIComponent(jobId)}/latest`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    },
  );

  return relayJsonResponse(response);
}
