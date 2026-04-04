import { NextRequest } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const baseUrl = getApiBaseUrl() || "http://api:3001";
  const { token, error } = requireAuthToken(req);

  if (error) {
    return error;
  }

  const response = await fetch(`${baseUrl}/applications/${id}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const baseUrl = getApiBaseUrl() || "http://api:3001";
  const { token, error } = requireAuthToken(req);

  if (error) {
    return error;
  }

  const response = await fetch(`${baseUrl}/applications/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: await req.text(),
  });

  return relayApiResponse(response);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const baseUrl = getApiBaseUrl() || "http://api:3001";
  const { token, error } = requireAuthToken(req);

  if (error) {
    return error;
  }

  const response = await fetch(`${baseUrl}/applications/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return relayApiResponse(response);
}
