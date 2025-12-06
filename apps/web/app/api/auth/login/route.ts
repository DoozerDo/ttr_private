import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL;

export async function POST(req: NextRequest) {
  if (!API_BASE_URL) {
    console.error("API_BASE_URL is not configured");
    return NextResponse.json(
      { error: "API_BASE_URL is not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    console.log("[login] forwarding to API:", `${API_BASE_URL}/auth/login`);
    console.log("[login] payload:", body);

    const apiResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const apiJson = await apiResponse.json().catch(() => ({}));

    if (!apiResponse.ok) {
      console.error("[login] API returned error", apiResponse.status, apiJson);
      return NextResponse.json(
        { error: "Login failed", details: apiJson },
        { status: 500 }
      );
    }

    return NextResponse.json(apiJson, { status: 200 });
  } catch (err) {
    console.error("[login] Error reaching API", err);
    return NextResponse.json(
      { error: "Unable to reach API" },
      { status: 500 }
    );
  }
}
