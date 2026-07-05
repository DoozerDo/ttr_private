import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("resolveBuildSha", () => {
  it("prefers GIT_SHA when present", async () => {
    vi.stubEnv("GIT_SHA", "commit-from-env");

    const { resolveBuildSha } = await import("../scripts/build-identity.cjs");

    expect(resolveBuildSha()).toEqual({
      sha: "commit-from-env",
      source: "GIT_SHA",
      resolvedFrom: "env",
    });
  });

  it("falls back to git rev-parse HEAD when env is missing", async () => {
    const { resolveBuildSha } = await import("../scripts/build-identity.cjs");

    expect(
      resolveBuildSha(
        vi.fn(() => "commit-from-git\n") as unknown as typeof import("node:child_process").execSync,
      ),
    ).toEqual({
      sha: "commit-from-git",
      source: "git rev-parse HEAD",
      resolvedFrom: "git",
    });
  });

  it("uses BUILD_SHA when present and env/git metadata are unavailable", async () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue("GIT_SHA=unavailable\n" as never);

    const { resolveBuildSha } = await import("../scripts/build-identity.cjs");
    expect(
      resolveBuildSha(
        vi.fn(() => {
          throw new Error("git unavailable");
        }) as unknown as typeof import("node:child_process").execSync,
      ),
    ).toEqual({
      sha: "unavailable",
      source: "BUILD_SHA",
      resolvedFrom: "file",
    });
  });

  it("fails closed when neither env nor git metadata is available", async () => {
    const { resolveBuildSha } = await import("../scripts/build-identity.cjs");

    expect(() =>
      resolveBuildSha(
        vi.fn(() => {
          throw new Error("git unavailable");
        }) as unknown as typeof import("node:child_process").execSync,
      ),
    ).toThrow(/Unable to resolve web build SHA/i);
  });
});
