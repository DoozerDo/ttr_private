import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { POST } from "@/app/api/analysis/run/route";
import { NextRequest } from "next/server";

const apiUrl = "https://api.example.com";

describe("POST /api/analysis/run", () => {
  beforeEach(() => {
    process.env.API_BASE_URL = apiUrl;
  });

  afterEach(() => {
    delete process.env.API_BASE_URL;
    vi.restoreAllMocks();
  });

  function createRequest(token?: string) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) {
      headers.append("cookie", `${AUTH_COOKIE_NAME}=${token}`);
    }

    return new NextRequest("https://example.com/api/analysis/run", {
      method: "POST",
      headers,
      body: JSON.stringify({
        baselineId: "baseline",
        jobId: "job",
        triggerType: "manual",
      }),
    });
  }

  it("returns 401 when auth is missing", async () => {
    const response = await POST(createRequest());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Missing Authorization token",
    });
  });

  it("surfaces non-JSON upstream responses as 502", async () => {
    const htmlResponse = new Response("<!DOCTYPE html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(htmlResponse)));

    const response = await POST(createRequest("cookie-token"));
    expect(response.status).toBe(502);

    const payload = await response.json();
    expect(payload.error).toMatch("Upstream returned non-JSON");
    expect(payload.snippet).toBe("<!DOCTYPE html>".slice(0, 200));
    expect(payload.status).toBe(502);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("relays JSON success responses and keeps application/json header", async () => {
    const payload = { score: 78 };
    const jsonResponse = new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse)));

    const response = await POST(createRequest("cookie-token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    await expect(response.json()).resolves.toEqual(payload);
  });

  it("relays upstream cx_fit_zero_score_invariant_failed responses unchanged", async () => {
    const errorPayload = {
      error: {
        code: "cx_fit_zero_score_invariant_failed",
        message:
          "CX Fit scoring returned an impossible zero score for non-empty baseline and job inputs.",
        details: {
          baselineId: "baseline",
          jobId: "job",
          baselineSectionCount: 4,
          baselineTextLength: 1200,
          jobTextLength: 900,
          scorerVersion: "2026-06-25-cx-fit-scoring-v2",
          categoryBreakdown: {
            role_scope_and_seniority: 0,
            domain_and_business_context: 0,
          },
          resumeProjectBreakdown: {
            id: "resume_project_cx_fit_v1",
            totalScore: 90,
            categories: {
              experience_alignment: 30,
              leadership_level: 20,
              technical_and_platform_fit: 20,
              industry_and_context_fit: 15,
              strategic_vs_tactical_balance: 5,
            },
          },
        },
      },
    };

    const zeroResponse = new Response(
      JSON.stringify(errorPayload),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(zeroResponse)));

    const response = await POST(createRequest("cookie-token"));
    expect(response.status).toBe(502);

    const payload = await response.json();
    expect(payload).toEqual(errorPayload);
  });

  it("accepts snake_case payloads (baseline_id/job_id) and forwards as baselineId/jobId", async () => {
    const jsonResponse = new Response(JSON.stringify({ score: 83 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse));
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("https://example.com/api/analysis/run", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        cookie: `${AUTH_COOKIE_NAME}=cookie-token`,
      }),
      body: JSON.stringify({
        baseline_id: "baseline",
        job_id: "job",
        debug: true,
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const forwardedBody = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as any)?.body ?? "{}"));
    expect(forwardedBody).toEqual(expect.objectContaining({ baselineId: "baseline", jobId: "job", debug: true }));
  });
});
