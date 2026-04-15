import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/app/api/_lib/backendFetch";
import { getApiBaseUrl, relayJsonResponse } from "@/app/api/baselines/helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const formData = await req.formData();

  try {
    const response = await backendFetch(`${baseUrl}/preview/extract-resume-text`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    return relayJsonResponse(response);
  } catch (error) {
    console.error("Failed to proxy preview extract resume text request", error);
    return NextResponse.json({ error: "Unable to reach preview service" }, { status: 502 });
  }
}

