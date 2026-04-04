import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_BASE = "http://api:3001";

const resolveApiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (raw && raw.trim().length) {
    return raw.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
) {
  const { baselineId } = await context.params;
  if (!baselineId) {
    return NextResponse.json(
      { error: "baselineId is required" },
      { status: 400 },
    );
  }

  const apiBase = resolveApiBase();
  const upstreamUrl = `${apiBase}/baselines/${encodeURIComponent(
    baselineId,
  )}/fit-review/clone`;

  const forwardedHeaders = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) {
    forwardedHeaders.set("content-type", contentType);
  }
  const authorization = req.headers.get("authorization");
  if (authorization) {
    forwardedHeaders.set("authorization", authorization);
  }
  const cookie = req.headers.get("cookie");
  if (cookie) {
    forwardedHeaders.set("cookie", cookie);
  }

  const body = await req.text();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: forwardedHeaders,
      body,
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
      error instanceof Error ? error.message : "Unable to proxy request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
