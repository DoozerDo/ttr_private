import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [
    {
      id: "job-1",
      company: "Acme",
      title: "Director of Support",
      archivedAt: null,
      isArchived: false,
    },
  ]),
}));

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => [
      {
        id: "base-1",
        originalFilename: "Leadership Resume",
        version: 1,
      },
    ]),
  };
});

function renderStudio() {
  return render(
    <EntitlementsProvider
      entitlements={{
        id: "u-1",
        email: "test@example.com",
        subscriptionTier: "PRO",
        role: "user",
        entitlements: null,
      }}
    >
      <StudioPage />
    </EntitlementsProvider>,
  );
}

describe("Studio page UX", () => {
  it("hides internal terms and metadata", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Targeting")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Job$/)).toBeNull();
    expect(screen.queryByText(/^Baseline$/)).toBeNull();
    expect(screen.queryByText("Baseline Version ID:")).toBeNull();
    expect(screen.queryByText("Artifact Readiness")).toBeNull();
    expect(screen.queryByText(/Using baseline/i)).toBeNull();
    expect(screen.queryByText(/^Confidence$/)).toBeNull();
  });

  it("renders why-this-focus and download options for both generation panels", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Why this focus")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Generate Resume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Generate Cover Letter").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Download: DOCX | PDF").length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Download DOCX" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { name: "Download PDF" }).length).toBeGreaterThanOrEqual(2);
  });
});
