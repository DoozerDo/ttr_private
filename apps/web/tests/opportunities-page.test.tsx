import OpportunitiesPage from "@/app/(app)/opportunities/page";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockRouterPush, setFetchImplementation } from "@/tests/setup";

describe("Opportunities page", () => {
  const resolveUrl = (input: RequestInfo | URL): string => {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input.url;
  };

  it("renders opportunities and navigates to results/studio", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = resolveUrl(input);
      if (url.includes("/api/opportunities")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "opp-1",
                jobId: "job-1",
                analysisId: "analysis-1",
                baselineId: "base-1",
                score: 82,
                company: "Acme",
                roleTitle: "Support Director",
                status: "ready_to_apply",
                updatedAt: new Date().toISOString(),
              },
            ]),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    setFetchImplementation(fetchMock);

    render(<OpportunitiesPage />);

    await waitFor(() => {
      expect(screen.getByText("Support Director")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Results" }));
    expect(mockRouterPush).toHaveBeenCalledWith("/results?assessmentId=analysis-1");

    fireEvent.click(screen.getByRole("button", { name: "Open Studio" }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/studio?analysisId=analysis-1&baselineId=base-1&jobId=job-1",
    );
  });

  it("updates status via row actions", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveUrl(input);
      if (url.includes("/api/opportunities") && init?.method !== "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "opp-1",
                jobId: "job-1",
                analysisId: "analysis-1",
                baselineId: "base-1",
                score: 82,
                company: "Acme",
                roleTitle: "Support Director",
                status: "ready_to_apply",
                updatedAt: new Date().toISOString(),
              },
            ]),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/opportunities/opp-1") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    setFetchImplementation(fetchMock);

    render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(screen.getByText("Support Director")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark Applied" }));
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          resolveUrl(url as RequestInfo | URL).includes("/api/opportunities/opp-1") &&
          init?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
    });
  });
});
