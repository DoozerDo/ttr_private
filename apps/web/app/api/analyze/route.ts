import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const baselineId = (body?.baselineId ?? "").toString();
  const jobDescription = (body?.jobDescription ?? "").toString();

  return NextResponse.json({
    ok: true,
    baselineId,
    score: 82,
    summary: "Mock API response. Real scoring will replace this endpoint next.",
    debug: {
      receivedChars: jobDescription.length
    }
  });
}

