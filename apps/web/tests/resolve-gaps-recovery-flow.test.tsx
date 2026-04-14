import { describe, expect, it, vi } from "vitest";

import ResolveGapsPage from "@/app/(app)/resolve-gaps/page";
import { getFitReviewHref } from "@/src/navigation/routes";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

describe("resolve gaps recovery flow", () => {
  it("redirects legacy resolve-gaps links to the canonical fit-review destination", async () => {
    const canonicalHref = getFitReviewHref({
      jobId: "job-1",
      baselineId: "baseline-1",
      analysisId: "analysis-blocked",
    });

    await expect(
      ResolveGapsPage({
        searchParams: {
          jobId: "job-1",
          baselineId: "baseline-1",
          analysisId: "analysis-blocked",
        },
      }),
    ).rejects.toThrow(`REDIRECT:${canonicalHref}`);
  });
});
