import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayApiResponse,
  requireAuthToken,
} from "../../../../baselines/helpers";

type ParamsShape = {
  params: Promise<{
    assessmentId: string;
  }>;
};

export async function GET(req: NextRequest, { params }: ParamsShape) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (error) {
    return error;
  }

  const { assessmentId } = await params;
  if (!assessmentId) {
    return NextResponse.json(
      { error: "assessmentId is required" },
      { status: 400 },
    );
  }

  const response = await fetch(`${baseUrl}/analysis/${encodeURIComponent(assessmentId)}/simulation`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}
