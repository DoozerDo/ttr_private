import { NextRequest } from "next/server";
import { forwardAuthRequest } from "../helpers";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  return forwardAuthRequest(request, "/auth/register", payload);
}
