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

    expect(resolveWebBuildMarker()).toEqual({
      marker: "abc123def456",
      source: "NEXT_PUBLIC_GIT_SHA",
      missing: false,
    });
  });

  it("falls back to Railway commit metadata when NEXT_PUBLIC_GIT_SHA is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA", "railway-commit-789");

    const { resolveWebBuildMarker } = await import("../lib/webBuildMarker");

    expect(resolveWebBuildMarker()).toEqual({
      marker: "railway-commit-789",
      source: "NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA",
      missing: false,
    });
  });

  it("returns an explicit production-missing marker state when no build marker is available", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { resolveWebBuildMarker } = await import("../lib/webBuildMarker");

    expect(resolveWebBuildMarker()).toEqual({
      marker: "unavailable",
      source: null,
      missing: true,
    });
  });

  it("treats the explicit unavailable marker as missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GIT_SHA", "unavailable");

    const { resolveWebBuildMarker } = await import("../lib/webBuildMarker");

    expect(resolveWebBuildMarker()).toEqual({
      marker: "unavailable",
      source: "NEXT_PUBLIC_GIT_SHA",
      missing: true,
    });
  });
});
