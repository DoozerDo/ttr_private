import { NextRequest, NextResponse } from "next/server";
import { backendFetch, isBackendUnavailableResponse } from "../_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "./helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  if (!auth.token) return auth.error;

  const search = req.nextUrl.search || "";
  const response = await backendFetch(`${baseUrl}/baselines${search}`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  if (await isBackendUnavailableResponse(response)) {
    return response;
  }

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }
  if (!auth.token) return auth.error;

  const contentType = req.headers.get("content-type") ?? "";
  let response: Response;

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const formData = await req.formData();

    response = await backendFetch(`${baseUrl}/baselines`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}` },
      body: formData,
    });
  } else {
    const body = await req.json();

    response = await backendFetch(`${baseUrl}/baselines`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (await isBackendUnavailableResponse(response)) {
    return response;
  }

  return relayApiResponse(response);
}
