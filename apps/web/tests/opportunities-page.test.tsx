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
        "Analyze a role to determine compatibility. When you choose to pursue it, it becomes an opportunity and is tracked here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Opportunities are created when you enter Resume Studio for roles scoring 70 or higher, or when you override from Fit Review.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Analyze a Job/i })).toBeInTheDocument();
    expect(screen.getByText("Actions Needed")).toBeInTheDocument();
    expect(screen.getByText("No actions needed right now.")).toBeInTheDocument();
  });

  it("renders grouped opportunity rows and required table columns", async () => {
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
      expect(screen.getAllByText("Opportunity Tracker").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /Acme/i }));
    expect(screen.getByText("Date Created")).toBeInTheDocument();
    expect(screen.getByText("Job Title")).toBeInTheDocument();
    expect(screen.getAllByText("Company").length).toBeGreaterThan(0);
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Next Action")).toBeInTheDocument();
  });
});
