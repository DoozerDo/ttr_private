import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, requireAuthToken } from "../../../../baselines/helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);
  const { jobId } = await params;

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (!token) {
    return error;
  }

  const response = await fetch(`${baseUrl}/analysis/job/${jobId}/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  const status = response.status;

  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  const complianceFlags = extractComplianceFlags(data);

  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    complianceFlags !== undefined &&
    complianceFlags !== null
  ) {
    data = { ...data, complianceFlags };
  }

  return NextResponse.json(data, { status });
}

function extractComplianceFlags(payload: any) {
  if (!payload || typeof payload !== "object") return undefined;
  if ("complianceFlags" in payload) return (payload as any).complianceFlags;
  if (payload.payload && typeof payload.payload === "object") {
    const nestedPayload = payload.payload as any;
    if ("complianceFlags" in nestedPayload) return nestedPayload.complianceFlags;
    if (nestedPayload.analysis && typeof nestedPayload.analysis === "object") {
      if ("complianceFlags" in nestedPayload.analysis) {
        return nestedPayload.analysis.complianceFlags;
      }
    }
  }
  if (payload.analysis && typeof payload.analysis === "object") {
    if ("complianceFlags" in payload.analysis) {
      return payload.analysis.complianceFlags;
    }
  }

  return undefined;
}
