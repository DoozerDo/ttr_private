import { NextRequest } from "next/server";
import { forwardAuthRequest } from "../helpers";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const endpoint = `/auth/confirm?${request.nextUrl.searchParams.toString()}`;
  return forwardAuthRequest(request, endpoint);
}
