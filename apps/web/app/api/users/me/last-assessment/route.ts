import { NextRequest } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!auth.token) return auth.error;

  const response = await fetch(`${baseUrl}/users/me/last-assessment`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  return relayApiResponse(response);
}

export async function PATCH(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!auth.token) return auth.error;

  const body = await req.text();

  const response = await fetch(`${baseUrl}/users/me/last-assessment`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "content-type": req.headers.get("content-type") ?? "application/json",
    },
    body: body || undefined,
  });

  return relayApiResponse(response);
}
