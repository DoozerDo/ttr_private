import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resolveWebBuildMarker", () => {
  it("prefers NEXT_PUBLIC_GIT_SHA when present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GIT_SHA", "abc123def456");

    const { resolveWebBuildMarker } = await import("../lib/webBuildMarker");

    expect(resolveWebBuildMarker()).toBe("abc123def456");
  });

  it("falls back to Railway commit metadata when NEXT_PUBLIC_GIT_SHA is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA", "railway-commit-789");

    const { resolveWebBuildMarker } = await import("../lib/webBuildMarker");

    expect(resolveWebBuildMarker()).toBe("railway-commit-789");
  });

  it("fails closed in production when no build marker is available", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { resolveWebBuildMarker } = await import("../lib/webBuildMarker");

    expect(() => resolveWebBuildMarker()).toThrow(
      /Missing production web build marker/i,
    );
  });
});
