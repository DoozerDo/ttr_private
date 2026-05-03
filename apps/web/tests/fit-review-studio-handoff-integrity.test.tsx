import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FitReviewClient from "@/app/(app)/fit-review/FitReviewClient";
import { mockRouterPush, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("Fit Review -> Studio handoff integrity", () => {
  it("does not render placeholder verifiedClaim=next and does not include it in the Studio return link", async () => {
    overrideSearchParams({ jobId: "job-1", highlightClaim: "next" });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analysis/job/job-1/latest")) {
          return createResponse({
            jobId: "job-1",
            baselineId: "baseline-1",
            baselineVersionId: "baseline-version-1",
            assessmentId: "analysis-1",
            score: 77,
            verdict: "consider",
            summary: "Ok",
            verification_coverage: { unverifiedRequirements: [] },
          });
        }
        return createResponse({}, false, 404);
      }),
    );

    render(<FitReviewClient />);

    await screen.findByRole("heading", { name: "Fit Review" });
    expect(screen.queryByText("Claim to verify")).toBeNull();
    expect(screen.queryByText(/^next$/i)).toBeNull();
  });

  it("keeps user in Fit Review and offers re-analyze when return-to-studio context is missing", async () => {
    overrideSearchParams({ jobId: "job-1", highlightClaim: "I shipped a feature." });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analysis/job/job-1/latest")) {
          return createResponse({
            jobId: "job-1",
            baselineId: "baseline-1",
            baselineVersionId: "baseline-version-1",
            assessmentId: null,
            score: 77,
            verdict: "consider",
            summary: "Ok",
            verification_coverage: { unverifiedRequirements: [] },
          });
        }
        return createResponse({}, false, 404);
      }),
    );

    render(<FitReviewClient />);

    const confirm = await screen.findByRole("button", { name: "Confirm and return to Studio" });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(screen.getByText("We couldn’t load your analysis")).toBeInTheDocument();
    });
    expect(screen.getByText("Reload the role analysis before returning to Studio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Analyze again" })).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/studio?"));
  });
});
