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

describe("FitReview primary unlock action", () => {
  it("renders exactly one primary gap and routes to Studio with context (score 70-84)", async () => {
    overrideSearchParams({ jobId: "job-1" });

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/job/job-1/latest")) {
        return createResponse({
          jobId: "job-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-4",
          assessmentId: "analysis-77",
          score: 77,
          verdict: "consider",
          summary: "Almost there, but one evidence gap is blocking generation.",
          score_breakdown: {
            total_score: 77,
            dimensions: [
              {
                key: "tooling_and_platform_experience",
                label: "Tooling/platform alignment",
                score: 12,
                weight: 30,
              },
              {
                key: "domain_and_business_context",
                label: "Customer environment alignment",
                score: 21,
                weight: 30,
              },
              {
                key: "role_scope_and_seniority",
                label: "Leadership scope alignment",
                score: 24,
                weight: 30,
              },
              {
                key: "support_operations_and_process_rigor",
                label: "Operational domain alignment",
                score: 24,
                weight: 30,
              },
              {
                key: "change_leadership_and_customer_advocacy",
                label: "Change leadership alignment",
                score: 21,
                weight: 30,
              },
            ],
          },
          verification_coverage: {
            unverifiedRequirements: [
              "Salesforce Service Cloud administration",
              "Zendesk configuration ownership",
              "HIPAA-regulated customer support context",
            ],
          },
          scoringReliability: "ok",
        });
      }

      return createResponse({}, false, 404);
    });
    setFetchImplementation(fetchMock);

    render(<FitReviewClient />);

    expect(await screen.findByText("Your fastest path to unlock")).toBeInTheDocument();
    expect(screen.getAllByText("Almost there").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("fit-review-score-reliability-warning")).toBeNull();

    const primaryGap = screen.getByTestId("fit-review-primary-gap");
    expect(primaryGap).toBeInTheDocument();
    expect(screen.getAllByTestId("fit-review-primary-gap")).toHaveLength(1);
    expect(screen.getByText("Tools and systems")).toBeInTheDocument();

    const missingEvidence = screen.getByTestId("fit-review-missing-evidence");
    expect(missingEvidence).toHaveTextContent("Salesforce Service Cloud");
    expect(missingEvidence).toHaveTextContent("Zendesk");

    expect(screen.queryByRole("button", { name: "Continue Evidence Review" })).toBeNull();

    const cta = screen.getByRole("button", { name: "Add this experience now" });
    fireEvent.click(cta);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalled();
    });

    const pushedHref = String(mockRouterPush.mock.calls.at(-1)?.[0] ?? "");
    expect(pushedHref).toContain("/studio?");
    expect(pushedHref).toContain("jobId=job-1");
    expect(pushedHref).toContain("baselineId=baseline-1");
    expect(pushedHref).toContain("baselineVersionId=baseline-version-4");
    expect(pushedHref).toContain("analysisId=analysis-77");
    expect(pushedHref).toContain("fromUnlock=true");
    expect(pushedHref).toContain("unlockDimension=Tools+and+systems");
    expect(pushedHref).toContain("missingEvidence=Salesforce+Service+Cloud+administration");
    expect(pushedHref).toContain("missingEvidence=Zendesk+configuration+ownership");
  });
});
