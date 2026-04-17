import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { BaselineWorkspace } from "@/app/(app)/baseline/BaselineWorkspace";
import type { JobDto } from "@/lib/jobs";
import type { BaselineDto } from "@/lib/baselines";

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [] as JobDto[]),
  archiveJob: vi.fn(async () => ({})),
}));

describe("target no-jobs UI", () => {
  it("collapses workspace and hides compatibility result panel when there are no jobs", async () => {
    const baselines: BaselineDto[] = [
      { id: "base-1", userId: "user-1", originalFilename: "resume.pdf", createdAt: "2026-04-01T00:00:00.000Z" } as BaselineDto,
    ];

    render(<BaselineWorkspace initialBaselines={baselines} showBaselineCreationControls={false} />);

    await waitFor(() => {
      expect(screen.getByText("No jobs yet")).toBeInTheDocument();
    });
    expect(screen.getByText("Add a job description to run your compatibility score.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add job" })).toBeInTheDocument();

    expect(screen.queryByTestId("target-result-column")).toBeNull();
    expect(screen.queryByText(/Compatibility result/i)).toBeNull();
    expect(screen.queryByText(/Run compatibility score/i)).toBeNull();
  });
});

