import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_BASE = "http://api:3001";

function resolveApiBase() {
  const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (rawBase && rawBase.trim().length) {
    return rawBase.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await context.params;
  if (!assessmentId) {
    return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
  }

  const apiBase = resolveApiBase();
  const upstreamUrl = `${apiBase}/analysis/fit-assessments/${encodeURIComponent(
    assessmentId,
  )}`;

  const headers = new Headers();
  headers.set("accept", "application/json");
  const authorization = req.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
  }
  const cookie = req.headers.get("cookie");
  if (cookie) {
    headers.set("cookie", cookie);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers,
    });

    const payload = await upstreamResponse.text();
    const response = new NextResponse(payload, {
      status: upstreamResponse.status,
    });

    upstreamResponse.headers.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to proxy assessment request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
