import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, requireAuthToken } from "../../baselines/helpers";
import {
  applyBetaForcePro,
  isBetaForceProEnabled,
} from "./betaForcePro";

const JSON_CONTENT = "application/json";

function isJsonResponse(contentType: string | null): boolean {
  const raw = contentType?.toLowerCase() ?? "";
  return raw.includes(JSON_CONTENT) || raw.includes("+json");
}

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

  const response = await fetch(`${baseUrl}/users/me`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  if (!isJsonResponse(response.headers.get("content-type"))) {
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, { status: response.status, headers });
  }

  const rawText = await response.text();

  if (!rawText) {
    return NextResponse.json(null, { status: response.status, headers });
  }

  try {
    const payload = JSON.parse(rawText);
    const transformed = isBetaForceProEnabled()
      ? applyBetaForcePro(payload as Record<string, unknown>)
      : payload;

    return NextResponse.json(transformed, { status: response.status, headers });
  } catch {
    const plainHeaders = new Headers({
      ...Object.fromEntries(headers.entries()),
      "content-type": "text/plain; charset=utf-8",
    });

    return new NextResponse(rawText, {
      status: response.status,
      headers: plainHeaders,
    });
  }
}
