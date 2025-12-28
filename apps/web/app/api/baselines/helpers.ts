// apps/web/app/api/baselines/helpers.ts
import { NextRequest, NextResponse } from "next/server";

export function getApiBaseUrl() {
  const raw =
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? null;

  if (!raw) {
    return null;
  }

  return normalizeApiBaseUrl(raw);
}

function normalizeApiBaseUrl(input: string) {
  return input.replace(/\/+$/, "").replace(/\/api$/, "");
}

export function requireAuthToken(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;

  if (!token) {
    return {
      token: null as string | null,
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  return { token, error: null as NextResponse | null };
}

export async function relayApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  let data: unknown = null;

  if (text) {
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
  }

  const isUserNotFoundUnauthorized =
    response.status === 401 &&
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    (data as any).message === "User not found";

  if (isUserNotFoundUnauthorized) {
    return NextResponse.json(
      {
        error: "User not found",
        hint:
          "Your auth token does not map to a user record in the API database. This usually happens after the DB volume is wiped. Re-register/login to mint a token for the current DB, or keep the DB volume persistent.",
        upstream: data,
      },
      { status: response.status },
    );
  }

  return NextResponse.json(data, { status: response.status });
}
