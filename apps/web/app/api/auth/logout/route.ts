import { NextRequest } from "next/server";
import { forwardAuthRequest } from "../helpers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return forwardAuthRequest(request, "/auth/logout");
}
