import { NextResponse } from "next/server";
import { getApiBaseUrl as resolveApiBaseUrl } from "../baselines/helpers";

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

function cloneHeaders(response: Response) {
  const headers = new Headers();
  response.headers.forEach((value, key) => headers.set(key, value));
  return headers;
}

function isJsonContentType(contentType: string) {
  const ct = contentType.toLowerCase();
  return ct.includes("application/json") || ct.includes("+json");
}

export async function relayApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const headers = cloneHeaders(response);

  // Normalize so NextResponse does not accidentally treat upstream encodings weirdly
  // and so our UI can always get a readable payload.
  headers.delete("content-length");

  if (isJsonContentType(contentType)) {
    const raw = await response.text().catch(() => "");

    if (!raw) {
      return NextResponse.json(null, { status: response.status, headers });
    }

    try {
      const json = JSON.parse(raw);
      return NextResponse.json(json, { status: response.status, headers });
    } catch {
      // Upstream said JSON but lied or returned a stack trace or HTML
      return new NextResponse(raw, {
        status: response.status,
        headers: new Headers({
          ...Object.fromEntries(headers.entries()),
          "content-type": "text/plain; charset=utf-8",
        }),
      });
    }
  }

  // Non JSON responses (files, html, plain text)
  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    status: response.status,
    headers,
  });
}

export {
  requireAuthToken,
  type RequireAuthTokenFailure,
  type RequireAuthTokenResult,
  type RequireAuthTokenSuccess,
} from "../auth/helpers";
