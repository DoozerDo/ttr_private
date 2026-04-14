import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { POST as reportBug } from "@/app/api/support/report-bug/route";
import { GET as supportConfig } from "@/app/api/support/config/route";

function request(path: string, method = "GET") {
  const headers = new Headers();
  headers.append("cookie", `${AUTH_COOKIE_NAME}=token-1`);
  return new NextRequest(`https://web.example.com${path}`, {
    method,
    headers,
  });
}

describe("support proxy routes", () => {
  afterEach(() => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    vi.restoreAllMocks();
  });

  it("returns a typed fallback when support reporting config is missing", async () => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const response = await reportBug(request("/api/support/report-bug", "POST"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      status: "service_unavailable",
      code: "UPSTREAM_API_URL_MISSING",
      supportPath: "/support/history",
    });
  });

  it("returns a typed fallback when support config is missing", async () => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const response = await supportConfig(request("/api/support/config"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      status: "service_unavailable",
      code: "UPSTREAM_API_URL_MISSING",
    });
  });
});
