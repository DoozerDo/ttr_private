import { NextRequest } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return new Response(JSON.stringify({ error: "API base URL is not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!auth.token) {
    return auth.error;
  }

  const body = await req.text();

  const response = await fetch(`${baseUrl}/users/me/profile`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "content-type": req.headers.get("content-type") ?? "application/json",
    },
    body: body || undefined,
  });

  return relayApiResponse(response);
}
