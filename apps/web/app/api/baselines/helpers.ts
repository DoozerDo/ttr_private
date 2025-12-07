import { NextRequest, NextResponse } from "next/server";

export function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? null;
}

export function requireAuthToken(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;

  if (!token) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  return { token };
}

export async function relayApiResponse(response: Response) {
  const text = await response.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return NextResponse.json(data, { status: response.status });
}
