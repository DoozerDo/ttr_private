import { NextRequest } from "next/server";
import { vi } from "vitest";

import { GET } from "@/app/api/baselines/[baselineId]/route";
import { setFetchImplementation } from "@/tests/setup";

describe("baseline detail API route", () => {
  afterEach(() => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("normalizes upstream connection failures to a controlled 503", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    setFetchImplementation(fetchSpy as unknown as typeof fetch);
    process.env.API_BASE_URL = "http://upstream.test";

    const request = new NextRequest("http://localhost/api/baselines/base-1", {
      headers: {
        cookie: "access_token=test-token",
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ baselineId: "base-1" }),
    });

    expect(response.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toContain("/baselines/base-1");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    const payload = await response.json();
    expect(payload).toMatchObject({
      error: "UPSTREAM_UNAVAILABLE",
      message: "Service temporarily unavailable. Please retry shortly.",
    });
  });
});
