import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { GET as getGrouped } from "@/app/api/opportunities/grouped/route";
import { GET as getActionsNeeded } from "@/app/api/opportunities/actions-needed/route";
import { GET as getExport } from "@/app/api/opportunities/export/route";
import { PATCH as patchStatus } from "@/app/api/opportunities/[id]/status/route";

const apiBaseUrl = "https://api.example.com";

function request(path: string, method = "GET", body?: unknown) {
  const headers = new Headers();
  headers.append("cookie", `${AUTH_COOKIE_NAME}=token-1`);
  if (body !== undefined) {
    headers.append("Content-Type", "application/json");
  }
  return new NextRequest(`https://web.example.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("opportunities proxy routes", () => {
  beforeEach(() => {
    process.env.API_BASE_URL = apiBaseUrl;
  });

  afterEach(() => {
    delete process.env.API_BASE_URL;
    vi.restoreAllMocks();
  });

  it("relays grouped opportunities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify([{ companyName: "Acme", opportunities: [] }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    const response = await getGrouped(request("/api/opportunities/grouped"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { companyName: "Acme", opportunities: [] },
    ]);
  });

  it("relays actions-needed cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify([{ type: "band_upgrade", opportunityId: "opp-1" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    const response = await getActionsNeeded(request("/api/opportunities/actions-needed"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { type: "band_upgrade", opportunityId: "opp-1" },
    ]);
  });

  it("relays status patch updates", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "opp-1", status: "APPLIED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await patchStatus(
      request("/api/opportunities/opp-1/status", "PATCH", { status: "APPLIED" }),
      { params: Promise.resolve({ id: "opp-1" }) },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/opportunities/opp-1/status`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "opp-1", status: "APPLIED" });
  });

  it("validates export format and returns 400 for invalid values", async () => {
    const response = await getExport(request("/api/opportunities/export?format=xml"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "format must be csv or json",
    });
  });
});

