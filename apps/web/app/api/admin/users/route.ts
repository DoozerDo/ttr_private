import { NextRequest, NextResponse } from "next/server";

const API_ORIGIN = process.env.API_ORIGIN;
const DEV_USER_ID = process.env.DEV_USER_ID;

if (!API_ORIGIN) {
  throw new Error("API_ORIGIN is not set");
}

export async function GET(_request: NextRequest) {
  if (!DEV_USER_ID) {
    return NextResponse.json(
      { error: "Admin access required", detail: "Missing DEV_USER_ID" },
      { status: 403 }
    );
  }

  const response = await fetch(`${API_ORIGIN}/admin/users`, {
    headers: {
      "x-dev-user-id": DEV_USER_ID,
    },
    cache: "no-store",
  });

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
