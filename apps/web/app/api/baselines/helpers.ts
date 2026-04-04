import { NextResponse } from "next/server";
import { getRequiredServerApiBaseUrl } from "../_lib/serverApiConfig";

export function getApiBaseUrl(): string {
  return getRequiredServerApiBaseUrl();
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

export async function relayJsonResponse(response: Response) {
  const headers = cloneHeaders(response);
  headers.delete("content-length");

  const contentType = response.headers.get("content-type") || "";
  const isJson = isJsonContentType(contentType);
  const raw = await response.text().catch(() => "");
  const snippet = raw.slice(0, 200);

  if (!isJson) {
    return NextResponse.json(
      {
        error: "Upstream returned non-JSON response",
        status: response.status,
        snippet,
      },
      { status: 502 },
    );
  }

  if (!raw.trim()) {
    return NextResponse.json(null, { status: response.status, headers });
  }

  try {
    const json = JSON.parse(raw);
    return NextResponse.json(json, { status: response.status, headers });
  } catch {
    return NextResponse.json(
      {
        error: "Upstream returned invalid JSON",
        status: response.status,
        snippet,
      },
      { status: 502 },
    );
  }
}

export {
  requireAuthToken,
  type RequireAuthTokenFailure,
  type RequireAuthTokenResult,
  type RequireAuthTokenSuccess,
} from "../auth/helpers";
