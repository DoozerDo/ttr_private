import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OpportunitiesPage from "@/app/(app)/opportunities/page";
import { setFetchImplementation } from "@/tests/setup";

const response = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  headers: { get: (_name: string) => "application/json" },
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  blob: () => Promise.resolve(new Blob([typeof body === "string" ? body : JSON.stringify(body)])),
});

describe("OpportunitiesPage", () => {
  it("renders empty-state possibility copy when no opportunities exist", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/opportunities/grouped")) return response([]);
      if (url.includes("/api/opportunities/actions-needed")) return response([]);
      return response({});
    });

    render(<OpportunitiesPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Your opportunities will appear here."),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Analyze roles to unlock opportunity intelligence and recommended next actions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Analyze a Job/i })).toBeInTheDocument();
    expect(screen.getByText("Actions Needed")).toBeInTheDocument();
    expect(screen.getByText("No actions needed right now.")).toBeInTheDocument();
    expect(screen.getByText("Opportunity Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Jobs Analyzed")).toBeInTheDocument();
    expect(screen.getByText("Sort By")).toBeInTheDocument();
  });

  it("renders intelligence cards and strategic action CTA", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/opportunities/grouped")) {
        return response([
          {
            companyName: "Acme",
            opportunities: [
              {
                id: "opp-1",
                companyName: "Acme",
                jobTitle: "Staff PM",
                salary: null,
                dateCreated: "2026-03-01T00:00:00.000Z",
                lastStatusChange: "2026-03-01T00:00:00.000Z",
                status: "SAVED",
                initialScore: 78,
                currentScore: 82,
                initialBand: "VIABLE",
                currentBand: "STRONG",
                baselineVersionUsed: null,
                dormant: false,
                nextAction: "Generate Resume",
              },
            ],
          },
        ]);
      }
      if (url.includes("/api/opportunities/actions-needed")) return response([]);
      return response({});
    });

    render(<OpportunitiesPage />);

    await waitFor(() => {
      expect(screen.getByText("Opportunity Intelligence")).toBeInTheDocument();
    });
    expect(screen.getByText("Staff PM")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Application Confidence:")).toBeInTheDocument();
    expect(screen.getByText("Competition Risk:")).toBeInTheDocument();
    expect(screen.getByText("Strength Signals")).toBeInTheDocument();
    expect(screen.getByText("Gap Signals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare Application Materials" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "highest_confidence" },
    });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("highest_confidence");
  });
});
