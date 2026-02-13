import { NextRequest } from "next/server";
import { forwardAuthRequest } from "../helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return forwardAuthRequest(req, "/auth/redeem-access-code-and-login");
}
