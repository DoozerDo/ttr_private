// apps\web\app\api\admin\users\[id]\route.ts
import { NextRequest, NextResponse } from "next/server";

const DEV_USER_ID = process.env.DEV_USER_ID;

type RouteContext = { params: Promise<{ id: string }> };

function getApiOrigin() {
  return process.env.API_ORIGIN;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const API_ORIGIN = getApiOrigin();

  if (!API_ORIGIN) {
    return NextResponse.json(
      { error: "Server misconfigured", detail: "API_ORIGIN is not set" },
      { status: 500 },
    );
  }

  try {
    if (!DEV_USER_ID) {
      return NextResponse.json(
        { error: "Admin access required", detail: "Missing DEV_USER_ID" },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const body = await request.json();

    const response = await fetch(`${API_ORIGIN}/admin/users/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-dev-user-id": DEV_USER_ID,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Internal server error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
