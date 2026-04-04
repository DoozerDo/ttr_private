import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

type CurrentUser = {
  id?: string | null;
  email?: string | null;
};

type BaselineRow = {
  id: string;
  userId?: string | null;
  originalFilename?: string | null;
};

async function fetchCurrentUser(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/users/me`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to resolve current user for purge.");
  }

  return (await response.json()) as CurrentUser;
}

async function fetchAllBaselines(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/admin/baselines?includeArchived=true`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load baselines for purge.");
  }

  return (await response.json()) as BaselineRow[];
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (!auth.token) {
    return auth.error;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedUserId =
      typeof body?.userId === "string" && body.userId.trim().length > 0 ? body.userId.trim() : null;
    const currentUser = await fetchCurrentUser(baseUrl, auth.token);
    const targetUserId = requestedUserId ?? currentUser.id ?? null;

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing userId for purge." }, { status: 400 });
    }

    const allBaselines = await fetchAllBaselines(baseUrl, auth.token);
    const targetBaselines = allBaselines.filter((baseline) => baseline.userId === targetUserId);

    const results = await Promise.all(
      targetBaselines.map(async (baseline) => {
        const response = await fetch(`${baseUrl}/admin/baselines/${encodeURIComponent(baseline.id)}`, {
          method: "DELETE",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        });

        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Failed to delete baseline ${baseline.id}`);
        }

        return {
          id: baseline.id,
          originalFilename: baseline.originalFilename ?? null,
        };
      }),
    );

    return NextResponse.json({
      purgedUserId: targetUserId,
      purgedCurrentUser: targetUserId === currentUser.id,
      deletedCount: results.length,
      deletedBaselines: results,
      note: "Linked baseline artifacts are removed via the backend baseline delete path.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to purge baselines.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
