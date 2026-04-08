import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { trackEvent } from "@/src/lib/analytics";

describe("analytics contract", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: "user-1" }),
      })) as unknown as typeof fetch,
    );
  });

  it("accepts artifact_viewed_with_confidence_level with the Studio payload shape", async () => {
    trackEvent("artifact_viewed_with_confidence_level", {
      source: "studio",
      baselineId: "base-1",
      jobId: "job-1",
      artifactType: "resume",
      confidence: "MEDIUM",
      artifactScore: 78,
      missingEvidenceCount: 2,
    }, { userId: "user-1" });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/analytics/event",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      eventName: string;
      properties: Record<string, unknown>;
    };

    expect(body.eventName).toBe("artifact_viewed_with_confidence_level");
    expect(body.properties).toEqual(
      expect.objectContaining({
        source: "studio",
        baselineId: "base-1",
        jobId: "job-1",
        artifactType: "resume",
        confidence: "MEDIUM",
        artifactScore: 78,
        missingEvidenceCount: 2,
      }),
    );
  });
});
