import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "../../../_lib/backendFetch";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";

export const runtime = "nodejs";

function joinPath(parts: string[]) {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

type RouteContext = { params: { path?: string[] } };

type NextRouteContext = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: NextRouteContext, method: "GET" | "POST") {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);
  if (!auth.token) return auth.error;

  const params = await ctx.params;
  const suffix = joinPath(params?.path ?? []);
  const search = req.nextUrl.search || "";
  const url = `${baseUrl}/ops/beta/${suffix}${search}`;

  const init: RequestInit = {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  };

  if (method === "POST") {
    const body = await req.text();
    init.body = body;
    init.headers = {
      ...init.headers,
      "content-type": req.headers.get("content-type") || "application/json",
    };
  }

  const response = await backendFetch(url, init);
  return relayApiResponse(response);
}

export async function GET(req: NextRequest, ctx: NextRouteContext) {
  try {
    return await proxy(req, ctx, "GET");
  } catch (error) {
    console.error("ops beta proxy failed", {
      method: "GET",
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return NextResponse.json({ error: "Proxy error" }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: NextRouteContext) {
  try {
    return await proxy(req, ctx, "POST");
  } catch (error) {
    console.error("ops beta proxy failed", {
      method: "POST",
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return NextResponse.json({ error: "Proxy error" }, { status: 502 });
  }
}
