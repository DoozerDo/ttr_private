import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

function normalizeResponsesPayload(body: unknown): string[] {
  const source =
    body && typeof body === "object" && Array.isArray((body as { responses?: unknown }).responses)
      ? (body as { responses: unknown[] }).responses
      : Array.isArray(body)
        ? body
        : [];

  return source
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";
      const response = (entry as { response?: unknown }).response;
      return typeof response === "string" ? response.trim() : "";
    })
    .filter((entry) => entry.length > 0);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!token) {
    return error;
  }

  const body = await req.json();
  const responses = normalizeResponsesPayload(body);

  const response = await fetch(`${baseUrl}/interview-records/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ responses }),
  });

  return relayApiResponse(response);
}
