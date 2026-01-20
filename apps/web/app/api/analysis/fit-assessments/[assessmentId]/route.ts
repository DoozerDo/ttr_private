import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ assessmentId: string }> },
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

  const { assessmentId } = await context.params;
  const resolvedId = Array.isArray(assessmentId) ? assessmentId[0] : assessmentId;

  if (!resolvedId) {
    return NextResponse.json(
      { error: "Missing assessmentId parameter" },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${baseUrl}/analysis/fit-assessments/${encodeURIComponent(resolvedId)}`,
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
