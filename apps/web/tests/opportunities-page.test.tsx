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
                savedFitScore: 74,
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
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return Promise.resolve(new Response(JSON.stringify({ score: 82 }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    setFetchImplementation(fetchMock);

    render(<OpportunitiesPage />);

    await waitFor(() => {
      expect(screen.getByText("Support Director")).toBeInTheDocument();
    });
    expect(screen.getByText("Saved fit")).toBeInTheDocument();
    expect(screen.getByText("Current fit")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Improved")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Update materials" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Results" }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/results?assessmentId=analysis-1&analysisId=analysis-1&jobId=job-1&baselineId=base-1",
    );

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
                savedFitScore: 82,
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
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return Promise.resolve(new Response(JSON.stringify({ score: 82 }), { status: 200 }));
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

  it("shows re-analyze action when baseline changed and routes to new results", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveUrl(input);
      if (url.includes("/api/opportunities") && !url.includes("/api/opportunities/") && init?.method !== "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "opp-1",
                jobId: "job-1",
                analysisId: "analysis-1",
                baselineId: "base-1",
                score: 64,
                savedFitScore: 64,
                company: "Acme",
                roleTitle: "Support Director",
                status: "improving_fit",
                updatedAt: new Date().toISOString(),
              },
            ]),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          new Response(JSON.stringify({ baselineVersionId: "base-version-1" }), { status: 200 }),
        );
      }
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return Promise.resolve(new Response(JSON.stringify({ score: 64 }), { status: 200 }));
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: "base-version-2", versionNumber: 2 }]), { status: 200 }),
        );
      }
      if (url.includes("/api/analysis/run") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ assessmentId: "analysis-2" }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    setFetchImplementation(fetchMock);

    render(<OpportunitiesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Re-analyze" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Re-analyze" }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/results?assessmentId=analysis-2&analysisId=analysis-2&jobId=job-1&baselineId=base-1",
      );
    });
  });

  it("does not show update materials when current fit is unavailable", async () => {
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
                score: 68,
                savedFitScore: 68,
                company: "Acme",
                roleTitle: "Support Director",
                status: "improving_fit",
                updatedAt: new Date().toISOString(),
              },
            ]),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    setFetchImplementation(fetchMock);

    render(<OpportunitiesPage />);

    await waitFor(() => {
      expect(screen.getByText("Current fit unavailable")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Update materials" })).toBeNull();
  });
});
