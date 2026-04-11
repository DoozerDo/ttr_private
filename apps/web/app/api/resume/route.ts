import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

function shouldBypassTier() {
  return process.env.NODE_ENV !== "production" || process.env.TTR_BETA_BYPASS === "true";
}

function readStatus(payload: Record<string, unknown>): string {
  const status =
    (typeof payload.status === "string" ? payload.status : "").trim().toLowerCase() ||
    (typeof payload.generationStatus === "string" ? payload.generationStatus : "")
      .trim()
      .toLowerCase();
  return status;
}

function readOutcomeCode(payload: Record<string, unknown>): string {
  return typeof payload.code === "string" ? payload.code.trim().toLowerCase() : "";
}

function hasPreviewResume(payload: Record<string, unknown>): boolean {
  const preview = payload.preview;
  if (!preview || typeof preview !== "object") {
    return false;
  }
  const resume = (preview as Record<string, unknown>).resume;
  return Boolean(resume && typeof resume === "object");
}

function isValidResumeGenerationPayload(payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const status = readStatus(record);

  if (status === "success") {
    return hasPreviewResume(record) && record.exportReady === true && Boolean(readOutcomeCode(record));
  }

  if (status === "blocked" || status === "compliance_blocked") {
    return record.exportReady === false;
  }

  if (status === "error") {
    return record.exportReady === false && Boolean(readOutcomeCode(record));
  }

  return false;
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!auth.token) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
    "X-TTR-Request-Preview": "true",
  };

  if (shouldBypassTier()) {
    headers["X-TTR-Beta-Bypass"] = "true";
  }

  const upstreamResponse = await fetch(`${baseUrl}/resume/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => responseHeaders.set(key, value));
  responseHeaders.delete("content-length");

  if (!contentType.toLowerCase().includes("json")) {
    const bodyText = await upstreamResponse.text().catch(() => "");
    return new NextResponse(bodyText, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  }

  const raw = await upstreamResponse.text().catch(() => "");
  let payload: unknown = null;
  if (raw.trim().length) {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "RESUME_GENERATION_CONTRACT_MISMATCH",
            message: "Resume generation returned invalid JSON.",
          },
        },
        { status: 502 },
      );
    }
  }

  if (upstreamResponse.ok && !isValidResumeGenerationPayload(payload)) {
    return NextResponse.json(
      {
        error: {
          code: "RESUME_GENERATION_CONTRACT_MISMATCH",
          message: "Resume generation returned an unexpected payload shape.",
        },
      },
      { status: 502 },
    );
  }

  return NextResponse.json(payload, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}
