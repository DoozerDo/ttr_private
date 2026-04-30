import { NextRequest } from "next/server";

import { forwardAuthRequest } from "../../auth/helpers";

export async function POST(req: NextRequest) {
  return forwardAuthRequest(req, "/resume/generate");
}
