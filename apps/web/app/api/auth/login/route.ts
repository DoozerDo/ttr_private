import { NextRequest } from "next/server";

import { forwardAuthRequest } from "../helpers";

export async function POST(req: NextRequest) {
  const body = await req.json();

  return forwardAuthRequest("/auth/login", body);
}
