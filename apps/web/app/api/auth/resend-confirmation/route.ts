import { NextRequest } from "next/server";

import { forwardAuthRequest } from "../helpers";

export async function POST(request: NextRequest) {
  return forwardAuthRequest(request, "/auth/resend-confirmation");
}
