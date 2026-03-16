import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, requireAuthToken } from "../../helpers";

export const runtime = "nodejs";

type BaselineRecord = {
  id: string;
  userId?: string | null;
};

type CurrentUser = {
  id?: string | null;
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
    return null;
  }

  return (await response.json()) as CurrentUser;
}

async function fetchUserBaselines(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/baselines?includeArchived=true`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load baselines for deletion.");
  }

  return (await response.json()) as BaselineRecord[];
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ baselineId: string }> },
) {
  const { baselineId } = await context.params;
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (!auth.token) {
    return auth.error;
  }

  try {
    const [user, baselines] = await Promise.all([
      fetchCurrentUser(baseUrl, auth.token),
      fetchUserBaselines(baseUrl, auth.token),
    ]);

    const baseline = baselines.find((entry) => entry.id === baselineId);
    if (!baseline) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    if (user?.id && baseline.userId && baseline.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const response = await fetch(`${baseUrl}/admin/baselines/${encodeURIComponent(baselineId)}`, {
      method: "DELETE",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    });

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      return NextResponse.json(
        { error: text || "Unable to delete baseline." },
        { status: response.status },
      );
    }

    if (!text.trim()) {
      return NextResponse.json({ success: true });
    }

    try {
      return NextResponse.json(JSON.parse(text), { status: response.status });
    } catch {
      return NextResponse.json({ success: true, message: text }, { status: response.status });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete baseline.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
