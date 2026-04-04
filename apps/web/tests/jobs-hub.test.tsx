import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { JobsHub } from "@/app/(app)/baseline/_components/JobsHub";
import { listJobs } from "@/lib/jobsClient";

vi.mock("@/src/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/jobsClient", () => ({
  archiveJob: vi.fn(),
  listJobs: vi.fn(),
}));

describe("JobsHub CTA hierarchy", () => {
  it("shows only one Add job CTA when there are no jobs", async () => {
    vi.mocked(listJobs).mockResolvedValue([]);

    render(<JobsHub />);

    await waitFor(() => {
      expect(screen.getByText("No jobs yet")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("button", { name: "Add job" })).toHaveLength(1);
  });
});
