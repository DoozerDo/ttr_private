import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import JobTrackerPage from "@/app/(app)/job-tracker/page";
import { setFetchImplementation } from "./setup";

function createJsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody =
    typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body);

  return {
    ok,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
  };
}

function installTrackerFetch({
  entries = [],
  grouped = [],
  actions = [],
}: {
  entries?: unknown[];
  grouped?: unknown[];
  actions?: unknown[];
} = {}) {
  setFetchImplementation(
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/job-tracker")) {
        return Promise.resolve(createJsonResponse(entries));
      }

      if (url.includes("/api/opportunities/grouped")) {
        return Promise.resolve(createJsonResponse(grouped));
      }

      if (url.includes("/api/opportunities/actions-needed")) {
        return Promise.resolve(createJsonResponse(actions));
      }

      return Promise.resolve(createJsonResponse({}));
    }),
  );
}

describe("Job tracker page", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("defaults to Pipeline view, hides strongest opportunities for a single entry, and hides stage definitions in Table view", async () => {
    installTrackerFetch({
      entries: [
        {
          id: "entry-1",
          company: "Acme",
          roleTitle: "Director of Support",
          stage: "Targeted",
          cxFitScore: 84,
          createdAt: "2026-03-15T00:00:00.000Z",
        },
      ],
      grouped: [
        {
          companyName: "Acme",
          opportunities: [{ id: "opp-1", companyName: "Acme", jobTitle: "Director of Support", currentScore: 84 }],
        },
      ],
    });

    render(<JobTrackerPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tracked opportunities" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Pipeline" })).toHaveClass("bg-white/10");
    expect(screen.getByText("Role selected for pursuit and prep.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your strongest opportunities" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Table" }));

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    });

    expect(screen.queryByText("Role selected for pursuit and prep.")).toBeNull();
  });

  it("keeps the form hidden by default and reveals it from the empty state add opportunity CTA", async () => {
    installTrackerFetch();

    render(<JobTrackerPage />);

    await waitFor(() => {
      expect(screen.getByText("No entries yet")).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: "Create Entry" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Add opportunity" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create Entry" })).toBeInTheDocument();
    });
  });

  it("locks CX Fit Score when editing an entry that matches an analyzed opportunity", async () => {
    installTrackerFetch({
      entries: [
        {
          id: "entry-1",
          company: "Orbit",
          roleTitle: "Head of Customer Operations",
          stage: "Applied",
          cxFitScore: 88,
          createdAt: "2026-03-15T00:00:00.000Z",
        },
      ],
      grouped: [
        {
          companyName: "Orbit",
          opportunities: [
            {
              id: "opp-1",
              companyName: "Orbit",
              jobTitle: "Head of Customer Operations",
              currentScore: 88,
            },
          ],
        },
      ],
    });

    render(<JobTrackerPage />);

    await waitFor(() => {
      expect(screen.getByText("Head of Customer Operations")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Update Entry" })).toBeInTheDocument();
    });

    const scoreInput = screen.getByLabelText("CX Fit Score") as HTMLInputElement;
    expect(scoreInput.readOnly).toBe(true);
    expect(
      screen.getByText("Read-only because this score came from compatibility analysis."),
    ).toBeInTheDocument();
  });
});
