import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computeInterviewExpandedFit,
  InterviewApiError,
  promoteInterviewAcceptedAdditions,
} from "@/lib/interviewsClient";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("interviewsClient computeInterviewExpandedFit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces typed compute failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse(
          {
            status: "error",
            code: "computation_timeout",
            message: "This is taking longer than expected. Please try again.",
            retryable: true,
            nextAction: "retry_compute",
          },
          false,
          503,
        ),
      ),
    );

    const computePromise = computeInterviewExpandedFit("interview-1");
    await expect(computePromise).rejects.toBeInstanceOf(InterviewApiError);
    await expect(computePromise).rejects.toMatchObject({
      code: "computation_timeout",
      status: 503,
    });
  });

  it("returns the expanded fit payload from a typed success envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          status: "success",
          code: "expanded_fit_ready",
          message: "Expanded fit is ready.",
          retryable: false,
          nextAction: "review_results",
          payload: {
            id: "interview-1",
            baselineId: "baseline-1",
            baselineVersionId: "baseline-version-1",
            jobId: "job-1",
            status: "open",
            expandedFitAssessment: {
              expandedScore: 84,
              originalScore: 72,
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
    );

    await expect(computeInterviewExpandedFit("interview-1")).resolves.toMatchObject({
      expandedFitAssessment: expect.objectContaining({ expandedScore: 84 }),
    });
  });

  it("surfaces typed promotion failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse(
          {
            error: {
              code: "invalid_promotion_state",
              message: "Select at least one accepted addition before promoting this baseline.",
            },
          },
          false,
          400,
        ),
      ),
    );

    const promotePromise = promoteInterviewAcceptedAdditions("interview-1");
    await expect(promotePromise).rejects.toBeInstanceOf(InterviewApiError);
    await expect(promotePromise).rejects.toMatchObject({
      code: "invalid_promotion_state",
      status: 400,
    });
  });
});
