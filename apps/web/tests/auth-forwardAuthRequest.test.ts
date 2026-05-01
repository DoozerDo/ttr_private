import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AUTH_COOKIE_NAME } from "@/lib/auth";

vi.mock("../app/api/_lib/serverApiConfig", () => {
  return {
    getRequiredServerApiBaseUrl: () => "https://api.example.com",
    UpstreamApiConfigError: class UpstreamApiConfigError extends Error {
      code = "UPSTREAM_API_URL_MALFORMED";
      details = null;
      constructor(code: string, message: string, details?: unknown) {
        super(message);
        this.code = code;
        this.details = details ?? null;
      }
    },
  };
});

const backendFetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
vi.mock("../app/api/_lib/backendFetch", () => {
  return {
    backendFetch: (...args: any[]) => backendFetchMock(...args),
    isBackendUnavailableResponse: async () => false,
  };
});

import { forwardAuthRequest } from "../app/api/auth/helpers";

describe("forwardAuthRequest", () => {
  beforeEach(() => {
    backendFetchMock.mockClear();
  });

  it("forwards cookie auth as Bearer Authorization header", async () => {
    const token = "test-token";
    const req = new NextRequest("https://example.com/api/resume/generate", {
      method: "POST",
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ baselineId: "b", jobId: "j" }),
    } as any);

    await forwardAuthRequest(req, "/resume/generate");

    expect(backendFetchMock).toHaveBeenCalledTimes(1);
    const [, init] = backendFetchMock.mock.calls[0] as any[];
    expect(String(init.headers.authorization)).toBe(`Bearer ${token}`);
  });
});

