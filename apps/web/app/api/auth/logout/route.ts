import { NextResponse } from "next/server";

import { clearAuthCookie } from "../helpers";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);
  return response;
}
