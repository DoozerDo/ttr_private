import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { BaselineWorkspace } from "@/app/(app)/baseline/BaselineWorkspace";
import { overrideSearchParams, setFetchImplementation } from "./setup";

vi.mock("@/app/(app)/baseline/baseline-dashboard", () => ({
  BaselineDashboard: () => <div>Baseline Dashboard Mock</div>,
}));

vi.mock("@/app/(app)/baseline/_components/JobsHub", () => ({
  JobsHub: () => <div>Jobs Hub Mock</div>,
}));

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody =
    typeof body === "string"
      ? body
      : body === undefined
        ? ""
        : JSON.stringify(body);

  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
  };
}

describe("BaselineWorkspace live score panel", () => {
  it("renders the redesigned score panel on the active Baseline page path", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    });

    overrideSearchParams({ baselineId: "base-1", jobId: "job-1" });

    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";

        if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-1",
              baselineId: "base-1",
              jobId: "job-1",
              score: 87,
              score_breakdown: {
                total_score: 87,
                dimensions: [
                  {
                    key: "role_scope_and_seniority",
                    label: "Led global support operations",
                    score: 23,
                    weight: 25,
                  },
                  {
                    key: "support_operations_and_process_rigor",
                    label: "Built escalation and incident workflows",
                    score: 21,
                    weight: 25,
                  },
                ],
              },
              strengths: [
                "Led global support operations",
                "Built escalation and incident workflows",
              ],
              criticalGaps: [
                {
                  title: "No direct firmware engineering experience",
                  requirementEvidence: "Firmware engineering leadership",
                  baselineEvidence: null,
                  severityScore: 0.88,
                },
              ],
            }),
          );
        }

        return Promise.resolve(createResponse({}));
      }),
    );

    render(
      <BaselineWorkspace
        initialBaselines={[
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            version: 1,
          } as never,
        ]}
        initialFetchError={null}
        initialBaselineId="base-1"
        initialJobId="job-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

    await waitFor(() => {
      expect(screen.getByText("Strong Match")).toBeInTheDocument();
    });

    expect(screen.getByText("Why this role fits you")).toBeInTheDocument();
    expect(screen.getByText("Where the gaps are")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Detailed Results" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Opportunities" })).toBeNull();
    expect(screen.queryByText("Why this score?")).toBeNull();
    expect(screen.queryByText("Evidence from your background")).toBeNull();
  });
});
