import { NextResponse } from "next/server";

export function getApiBaseUrl(): string | undefined {
  return process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
}

export async function relayApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await response.json();
    return NextResponse.json(json, { status: response.status });
  }

  const buffer = await response.arrayBuffer();
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    headers.set(key, value);
  });

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
