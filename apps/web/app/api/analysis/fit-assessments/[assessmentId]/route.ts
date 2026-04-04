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
  const { assessmentId } = await context.params;
  if (!assessmentId) {
    return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
  }

  const apiBase = getApiBaseUrl();
  const auth = requireAuthToken(req);
  if (!auth.token) return auth.error;

  const upstreamUrl = `${apiBase}/analysis/fit-assessments/${encodeURIComponent(
    assessmentId,
  )}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    });

    return relayApiResponse(upstreamResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to proxy assessment request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
