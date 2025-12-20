import { NextResponse } from "next/server";

export async function GET() {
  // Local-first: if the web app is running, the status endpoint should be healthy.
  // Later we can expand this to probe the real API service via env vars.
  return NextResponse.json({ ok: true, service: "web" }, { status: 200 });
}

