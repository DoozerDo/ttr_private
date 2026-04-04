// apps\web\app\api\admin\users\route.ts
import { NextResponse } from "next/server";

const DEV_USER_ID = process.env.DEV_USER_ID;

function getApiOrigin() {
  return process.env.API_ORIGIN;
}

export async function GET() {
  const API_ORIGIN = getApiOrigin();

  if (!API_ORIGIN) {
    return NextResponse.json(
      { error: "Server misconfigured", detail: "API_ORIGIN is not set" },
      { status: 500 },
    );
  }

  if (!DEV_USER_ID) {
    return NextResponse.json(
      { error: "Admin access required", detail: "Missing DEV_USER_ID" },
      { status: 403 },
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
