import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { BaselineDashboard } from "@/app/(app)/baseline/baseline-dashboard";
import { setFetchImplementation } from "./setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

describe("BaselineDashboard target mode", () => {
  it("hides baseline-building controls and keeps selection actions available", async () => {
    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/baselines/base-1")) {
          return createResponse({
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            status: "ACTIVE",
            sections: [],
            latestAssessmentSummary: null,
          });
        }
        return createResponse([]);
      }),
    );

    render(
      <BaselineDashboard
        initialBaselines={[
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: null,
          } as never,
        ]}
        selectedBaselineId="base-1"
        showBaselineCreationControls={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /Add resume/i })).toBeNull();
    expect(screen.queryByText(/Continue Building Baseline/i)).toBeNull();
    expect(screen.queryByText(/Completing more areas improves/i)).toBeNull();
    expect(screen.getByRole("link", { name: /View details/i })).toBeInTheDocument();
  });
});
