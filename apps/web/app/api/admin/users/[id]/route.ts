import { NextRequest, NextResponse } from "next/server";

const API_ORIGIN = process.env.API_ORIGIN;
const DEV_USER_ID = process.env.DEV_USER_ID;

if (!API_ORIGIN) {
  throw new Error("API_ORIGIN is not set");
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
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
