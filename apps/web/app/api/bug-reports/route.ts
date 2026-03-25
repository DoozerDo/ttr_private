import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "../_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!token) return error;

  const contentType = req.headers.get("content-type") ?? "";
  let response: Response;

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const formData = await req.formData();
    response = await backendFetch(`${baseUrl}/bug-reports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } else {
    const body = await req.text();
    response = await backendFetch(`${baseUrl}/bug-reports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType || "application/json",
      },
      body,
    });
  }

  return relayApiResponse(response);
}
