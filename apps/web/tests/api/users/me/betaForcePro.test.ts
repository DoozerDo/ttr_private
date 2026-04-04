import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { GET } from "@/app/api/users/me/route";

const stubRequest = {
  headers: {
    get: (_name: string) => "Bearer token",
  },
  cookies: {
    get: (_name: string) => ({ value: "token" }),
  },
} as unknown as NextRequest;

const createResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mockFetch(body: unknown, status = 200) {
  return vi.fn(() => Promise.resolve(createResponse(body, status)));
}

describe("GET /api/users/me beta override", () => {
  beforeEach(() => {
    process.env.API_BASE_URL = "http://api:3001";
    delete process.env.BETA_FORCE_PRO;
    delete process.env.NEXT_PUBLIC_BETA_FORCE_PRO;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.API_BASE_URL;
    delete process.env.BETA_FORCE_PRO;
    delete process.env.NEXT_PUBLIC_BETA_FORCE_PRO;
  });

  it("returns the upstream payload when the flag is off", async () => {
    const payload = {
      id: "user",
      subscriptionTier: "FREE",
      entitlements: {
        tier: "FREE",
        effectiveTier: "FREE",
        betaUnlockPro: false,
        reasons: [],
        isPro: false,
        source: "real",
      },
    };

    vi.stubGlobal("fetch", mockFetch(payload));

    const response = await GET(stubRequest);
    const data = await response.json();

    expect(data).toEqual(payload);
  });

  it("returns PRO payload when the flag is enabled", async () => {
    const payload = {
      id: "user",
      subscriptionTier: "FREE",
      entitlements: {
        tier: "FREE",
        effectiveTier: "FREE",
        betaUnlockPro: false,
        reasons: ["existing"],
        isPro: false,
        source: "real",
      },
    };

    process.env.BETA_FORCE_PRO = "yes";
    vi.stubGlobal("fetch", mockFetch(payload));

    const response = await GET(stubRequest);
    const data = await response.json();

    expect(data.subscriptionTier).toBe("PRO");
    expect(data.accountType).toBe("pro");
    expect(data.entitlements).toMatchObject({
      tier: "PRO",
      effectiveTier: "PRO",
      betaUnlockPro: true,
      isPro: true,
      source: "beta",
    });
    expect(data.entitlements.reasons).toEqual(["existing", "beta_force_pro"]);
  });
});
