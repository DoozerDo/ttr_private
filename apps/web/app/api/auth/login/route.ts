import { NextRequest } from "next/server";
import { forwardAuthRequest } from "../helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  return forwardAuthRequest("/auth/login", body);
}
