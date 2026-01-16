import { NextRequest, NextResponse } from "next/server";
import { forwardAuthRequest } from "../helpers";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const upstreamRes = await forwardAuthRequest("/auth/login", body);

  const data = await upstreamRes.clone().json().catch(() => null);

  const token: string | undefined =
    data?.accessToken ?? data?.data?.accessToken ?? data?.token;

  const res = NextResponse.json(data, {
    status: upstreamRes.status,
  });

  if (token) {
    res.cookies.set("ttr_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return res;
}
