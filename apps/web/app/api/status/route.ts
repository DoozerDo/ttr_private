import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? null;
}

export async function GET() {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/status`, { cache: "no-store" });
  } catch (error) {
    console.error("Status check failed", error);
    return NextResponse.json({ error: "Unable to reach API" }, { status: 503 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `API returned HTTP ${response.status}` },
      { status: response.status },
    );
  }

  try {
    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Unable to parse status response", error);
    return NextResponse.json(
      { error: "Invalid status response from API" },
      { status: 502 },
    );
  }
}
