import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { backendFetch } from "@/app/api/_lib/backendFetch";

function buildLoginRequest(body: Record<string, unknown> = { email: "user@example.com", password: "pw" }) {
  return new NextRequest("https://web.example.com/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("auth proxy server upstream config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns controlled 503 when upstream API env is missing", async () => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await loginPost(buildLoginRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      error: "SERVICE_UNAVAILABLE",
      message: "Service temporarily unavailable. Please retry shortly.",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns controlled 503 when upstream API env is malformed", async () => {
    process.env.API_BASE_URL = "not-a-url";
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await loginPost(buildLoginRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      error: "SERVICE_UNAVAILABLE",
      message: "Service temporarily unavailable. Please retry shortly.",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("login proxy uses centralized server-side API base URL", async () => {
    process.env.API_BASE_URL = "http://api:3001";
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await loginPost(buildLoginRequest());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:3001/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("backendFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns controlled 503 on upstream fetch connection failure", async () => {
    const fetchMock = vi.fn(() =>
      Promise.reject(new Error("fetch failed: ECONNREFUSED 127.0.0.1:3001")),
    );
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await backendFetch("http://api:3001/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "pw" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "UPSTREAM_UNAVAILABLE",
      message: "Service temporarily unavailable. Please retry shortly.",
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});
