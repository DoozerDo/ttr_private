import { NextRequest } from "next/server";
import { vi } from "vitest";

import { PATCH } from "@/app/api/baselines/[baselineId]/current/route";
import { setFetchImplementation } from "@/tests/setup";

describe("baseline set-current API route", () => {
  afterEach(() => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("proxies PATCH /api/baselines/:id/current to the upstream baseline id", async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    setFetchImplementation(fetchSpy as unknown as typeof fetch);
    process.env.API_BASE_URL = "http://upstream.test";

    const request = new NextRequest("http://localhost/api/baselines/base-1/current", {
      headers: {
        cookie: "access_token=test-token",
      },
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ baselineId: "base-1" }),
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toContain("/baselines/base-1/current");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: {
        Authorization: "Bearer test-token",
      },
    });
  });

  it("does not treat version ids as baseline ids (upstream will 404)", async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Baseline not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });
    setFetchImplementation(fetchSpy as unknown as typeof fetch);
    process.env.API_BASE_URL = "http://upstream.test";

    const request = new NextRequest("http://localhost/api/baselines/v-123/current", {
      headers: {
        cookie: "access_token=test-token",
      },
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ baselineId: "v-123" }),
    });

    expect(response.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toContain("/baselines/v-123/current");
  });
});

