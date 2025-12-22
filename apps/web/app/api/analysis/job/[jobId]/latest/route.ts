import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);
  const { jobId } = await params;

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (!token) {
    return error;
  }

  const response = await fetch(`${baseUrl}/analysis/job/${jobId}/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}
