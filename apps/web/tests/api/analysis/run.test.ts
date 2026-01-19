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
      body: JSON.stringify({ baselineId: "baseline", jobId: "job" }),
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
  });
});
