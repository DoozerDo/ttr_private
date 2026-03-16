import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/dev/purge-baselines/route";

describe("POST /api/dev/purge-baselines", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns JSON successfully in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith("/users/me")) {
        return Response.json({ id: "user-1", email: "founder@example.com" });
      }

      if (url.includes("/admin/baselines?includeArchived=true")) {
        return Response.json([
          { id: "base-1", userId: "user-1", originalFilename: "resume.pdf" },
        ]);
      }

      if (url.includes("/admin/baselines/base-1") && init?.method === "DELETE") {
        return Response.json({ success: true });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const request = new NextRequest("http://localhost:3000/api/dev/purge-baselines", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deletedCount).toBe(1);
    expect(payload.purgedCurrentUser).toBe(true);
  });
});
