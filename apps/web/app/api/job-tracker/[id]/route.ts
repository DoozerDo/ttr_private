import { NextRequest, NextResponse } from "next/server";
import { relayApiResponse } from "../../baselines/helpers";
import {
  ensureJobTrackerBaseUrl,
  resolveJobTrackerProxyHeaders,
} from "../helpers";

export const runtime = "nodejs";

async function resolveEntryId(
  params: Promise<{ id: string }>,
): Promise<string | NextResponse> {
  const resolved = await params;
  if (!resolved?.id) {
    return NextResponse.json(
      { error: "Missing job tracker entry id" },
      { status: 400 },
    );
  }

  return resolved.id;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const entryId = await resolveEntryId(params);
  if (entryId instanceof NextResponse) {
    return entryId;
  }

  const baseUrl = ensureJobTrackerBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  const resolved = resolveJobTrackerProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const response = await fetch(`${baseUrl}/job-tracker/${entryId}`, {
    method: "GET",
    cache: "no-store",
    headers: resolved.headers,
  });

  return relayApiResponse(response);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const entryId = await resolveEntryId(params);
  if (entryId instanceof NextResponse) {
    return entryId;
  }

  const baseUrl = ensureJobTrackerBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  const resolved = resolveJobTrackerProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const body = await req.json();

  const response = await fetch(`${baseUrl}/job-tracker/${entryId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...resolved.headers,
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const entryId = await resolveEntryId(params);
  if (entryId instanceof NextResponse) {
    return entryId;
  }

  const baseUrl = ensureJobTrackerBaseUrl();
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  const resolved = resolveJobTrackerProxyHeaders(req);
  if (resolved.error) return resolved.error;

  const response = await fetch(`${baseUrl}/job-tracker/${entryId}`, {
    method: "DELETE",
    headers: resolved.headers,
  });

  return relayApiResponse(response);
}
