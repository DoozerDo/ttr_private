import { afterEach, describe, expect, it, vi } from "vitest";

describe("getServerApiBaseUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("prefers API_BASE_URL when provided", async () => {
    process.env.API_BASE_URL = "http://api:3001";
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";

    const mod = await import("@/lib/apiBase");
    expect(mod.getServerApiBaseUrl()).toBe("http://api:3001");
  });

  it("falls back to localhost in non-docker server runtime even when NEXT_RUNTIME is set", async () => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DOCKER = "false";
    process.env.HOSTNAME = "my-laptop";

    const mod = await import("@/lib/apiBase");
    expect(mod.getServerApiBaseUrl()).toBe("http://localhost:3001");
  });
});
