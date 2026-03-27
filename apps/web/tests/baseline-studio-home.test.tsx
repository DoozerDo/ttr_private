import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import { BaselineStudioHome } from "@/app/(app)/baseline/BaselineStudioHome";
import { publishBaselineUpdated } from "@/src/lib/baseline-sync";
import { setFetchImplementation } from "@/tests/setup";

function createBaseline(
  id: string,
  createdAt: string,
  filename = `${id}.pdf`,
  latestAssessmentSummary?: {
    latestAssessmentId: string | null;
    latestAssessmentCreatedAt: string | null;
    latestFitScore: number | null;
    hasCompletedAssessment: boolean;
  },
) {
  return {
    id,
    userId: "user-1",
    version: 1,
    originalFilename: filename,
    mimeType: "application/pdf",
    storagePath: `/tmp/${id}`,
    hash: null,
    status: "ACTIVE" as const,
    archivedAt: null,
    latestAssessmentSummary,
    createdAt,
    updatedAt: createdAt,
  };
}

function createAnalyzedBaseline(id: string, filename = `${id}.pdf`) {
  return {
    ...createBaseline(id, "2026-01-01T00:00:00.000Z", filename),
    latestAssessmentSummary: {
      latestAssessmentId: `assessment-${id}`,
      latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
      latestFitScore: 82,
      hasCompletedAssessment: true,
    },
    sections: [
      {
        id: "section-1",
        baselineId: id,
        sectionType: "EXPERIENCE" as const,
        title: "Director, Customer Operations",
        content:
          "2021-2025 Led customer operations, incident response, platform tooling, cross-functional coordination, and measured impact with CSAT and SLA improvements.",
        includePolicy: "always" as const,
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "section-2",
        baselineId: id,
        sectionType: "SUMMARY" as const,
        title: "Summary",
        content:
          "Customer operations leadership, process architecture, change leadership, support tooling ecosystems, and quantified business impact.",
        includePolicy: "always" as const,
        order: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function createJsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("BaselineStudioHome", () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renders baseline readiness summary and checklist when baseline is not yet certified", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    setFetchImplementation(fetchMock);

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Baseline readiness")).toBeInTheDocument();
    });

    expect(screen.getByText(/Strong signals:/i)).toBeInTheDocument();
    expect(screen.getByText(/Signals detected:/i)).toBeInTheDocument();
    expect(screen.getByText(/Developing signals:/i)).toBeInTheDocument();
    expect(screen.getByText(/Quantified impact:/i)).toBeInTheDocument();
    expect(screen.getByText(/Analyses completed:/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === "string" && url.includes("/api/baselines/base-1"),
      ),
    ).toBe(true);
  });

  it("renders developing-only diagnosis area and no signal effect panel", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Professional Signals Diagnosis")).toBeInTheDocument();
    });

    expect(screen.getByText("Signals Detected")).toBeInTheDocument();
    expect(screen.getByText("Strong Signals")).toBeInTheDocument();
    expect(screen.getAllByText("Developing Signals").length).toBeGreaterThan(0);
    expect(screen.queryByText("Signal Effect")).not.toBeInTheDocument();
  });

  it("renders strengthening entries from developing signals and supports modal proposal review", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]);
      }
      if (url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH") {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-1", "resume-1.pdf"),
          sections: [
            ...(createAnalyzedBaseline("base-1", "resume-1.pdf").sections ?? []),
            {
              id: "section-strengthening-1",
              baselineId: "base-1",
              sectionType: "OTHER",
              title: "Approved signal refinements",
              content: "Change Leadership: I led the escalation process redesign and reduced incident resolution time by 18%.",
              includePolicy: "always",
              order: 10,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      }
      if (url.includes("/api/baselines/base-1/analysis-score") && init?.method === "PATCH") {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-1", "resume-1.pdf"),
          originalBaselineScore: 79,
          latestBaselineScore: 81,
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    setFetchImplementation(fetchMock);

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Baseline Strengthening")).toBeInTheDocument();
    });

    const developingSignalButtons = screen.getAllByRole("button", { name: "Strengthen This Signal" });
    expect(developingSignalButtons.length).toBeGreaterThan(0);

    fireEvent.click(developingSignalButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Strengthen Signal" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "I led the escalation process redesign and reduced incident resolution time by 18%." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Proposed Update" }));

    await waitFor(() => {
      expect(screen.getByText("Proposed baseline update")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Approve and Apply" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).not.toBeInTheDocument();
    });
    const patchCall = fetchMock.mock.calls.find(
      ([url, requestInit]) =>
        typeof url === "string" &&
        url.includes("/api/baselines/base-1/strengthening-additions") &&
        requestInit?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const patchBody =
      patchCall && patchCall[1]?.body && typeof patchCall[1].body === "string"
        ? (JSON.parse(patchCall[1].body) as Record<string, unknown>)
        : null;
    expect(typeof patchBody?.signalType).toBe("string");
    expect(typeof patchBody?.rawText).toBe("string");
    expect(String(patchBody?.rawText ?? "")).toContain("reduced incident resolution time by 18%");
  });

  it("opens the matching strengthening flow when clicking a developing signal chip", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Professional Signals Diagnosis")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Change Leadership" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Strengthen Signal" })).toBeInTheDocument();
    });

    expect(
      screen.getByText("Describe a process, tooling, or support change you led and what changed because of it."),
    ).toBeInTheDocument();
  });

  it("shows career gravity locked under 3 completed role analyses", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([{ id: "run-1", status: "completed", score: 70 }]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Career Gravity is locked")).toBeInTheDocument();
    });
    expect(screen.getByText("1 of 3 completed")).toBeInTheDocument();
  });

  it("unlocks career gravity at 3 completed role analyses", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([
          { id: "run-1", status: "completed", score: 70 },
          { id: "run-2", status: "completed", score: 74 },
          { id: "run-3", status: "completed", score: 78 },
        ]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);

    await waitFor(() => {
      expect(screen.queryByText("Career Gravity is locked")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Your experience clusters strongly around:")).toBeInTheDocument();
  });

  it("keeps baseline record streamlined after analysis without score history chip blocks", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1/analysis-score")) {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-1", "resume-1.pdf"),
          originalBaselineScore: 72,
          latestBaselineScore: 78,
          firstAnalyzedAt: "2026-01-01T00:00:00.000Z",
          lastAnalyzedAt: "2026-01-02T00:00:00.000Z",
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Career Compatibility Analysis" }));

    await waitFor(() => {
      expect(screen.getByText("Professional Signals Diagnosis")).toBeInTheDocument();
    });
    expect(screen.queryByText(/% current/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/% original/i)).not.toBeInTheDocument();
  });

  it("renders analyzed state from server assessment summary", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <BaselineStudioHome
        baselines={[
          createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf", {
            latestAssessmentId: "assessment-1",
            latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Ready for targeting")).toBeInTheDocument();
    expect(screen.getByText(/Last baseline check/i)).toBeInTheDocument();
    expect(screen.queryByText(/Fit 82%/i)).not.toBeInTheDocument();
    expect(screen.getByText("Last role analysis: 82%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View baseline analysis" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Run Career Compatibility Analysis" })).not.toBeInTheDocument();
  });

  it("does not show secondary role-fit metadata when no role analysis score exists", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <BaselineStudioHome
        baselines={[
          createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf", {
            latestAssessmentId: "assessment-1",
            latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
            latestFitScore: null,
            hasCompletedAssessment: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Ready for targeting")).toBeInTheDocument();
    expect(screen.queryByText(/Last role analysis:/i)).not.toBeInTheDocument();
  });

  it("does not treat fit score as readiness when baseline analysis is incomplete", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <BaselineStudioHome
        baselines={[
          createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf", {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
            latestFitScore: 67,
            hasCompletedAssessment: false,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Not analyzed")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Last role analysis: 67%")).toBeInTheDocument();
    expect(screen.queryByText("Ready for targeting")).not.toBeInTheDocument();
  });

  it("replaces stale not-analyzed card state with canonical analyzed summary after canonical analyze and refetch", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          },
        });
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([createAnalyzedBaseline("base-1", "resume-1.pdf")]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <BaselineStudioHome
        baselines={[
          createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf", {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: null,
            latestFitScore: null,
            hasCompletedAssessment: false,
          }),
        ]}
      />,
    );

    const baselineArticle = within(screen.getByText("resume-1.pdf").closest("article") as HTMLElement);
    expect(baselineArticle.getByText("Not analyzed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Career Compatibility Analysis" }));

    await waitFor(() => {
      expect(baselineArticle.getByText("Ready for targeting")).toBeInTheDocument();
    });
    expect(baselineArticle.queryByText("Not analyzed")).toBeNull();
  });

  it("refetches authoritative baselines on baseline-updated event and updates only the analyzed baseline", async () => {
    const initialA = createBaseline("base-a", "2026-01-01T00:00:00.000Z", "resume-a.pdf", {
      latestAssessmentId: null,
      latestAssessmentCreatedAt: null,
      latestFitScore: null,
      hasCompletedAssessment: false,
    });
    const initialB = createBaseline("base-b", "2026-01-02T00:00:00.000Z", "resume-b.pdf", {
      latestAssessmentId: null,
      latestAssessmentCreatedAt: null,
      latestFitScore: null,
      hasCompletedAssessment: false,
    });
    const refreshedA = createBaseline("base-a", "2026-01-01T00:00:00.000Z", "resume-a.pdf", {
      latestAssessmentId: "assessment-a",
      latestAssessmentCreatedAt: "2026-03-25T12:00:00.000Z",
      latestFitScore: 88,
      hasCompletedAssessment: true,
    });
    const refreshedB = createBaseline("base-b", "2026-01-02T00:00:00.000Z", "resume-b.pdf", {
      latestAssessmentId: null,
      latestAssessmentCreatedAt: null,
      latestFitScore: null,
      hasCompletedAssessment: false,
    });

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([refreshedA, refreshedB]);
      }
      if (url.includes("/api/baselines/base-a")) {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-a", "resume-a.pdf"),
          latestAssessmentSummary: refreshedA.latestAssessmentSummary,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    setFetchImplementation(fetchMock);

    render(<BaselineStudioHome baselines={[initialA, initialB]} />);

    const baselineAArticle = within(screen.getByText("resume-a.pdf").closest("article") as HTMLElement);
    const baselineBArticle = within(screen.getByText("resume-b.pdf").closest("article") as HTMLElement);
    expect(baselineAArticle.getByText("Not analyzed")).toBeInTheDocument();
    expect(baselineBArticle.getByText("Not analyzed")).toBeInTheDocument();

    publishBaselineUpdated({ baselineId: "base-a", source: "analysis" });

    await waitFor(() => {
      expect(baselineAArticle.getByText("Ready for targeting")).toBeInTheDocument();
    });
    expect(baselineBArticle.getByText("Not analyzed")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === "string" && url.includes("/api/baselines?includeArchived=true"),
      ),
    ).toBe(true);
  });

  it("shows updated guidance state after baseline strengthening updates", async () => {
    let hasCompletedCanonicalAnalyze = false;

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        if (hasCompletedCanonicalAnalyze) {
          return createJsonResponse([
            {
              ...createAnalyzedBaseline("base-1", "resume-1.pdf"),
              originalBaselineScore: 79,
              latestBaselineScore: 81,
            },
          ]);
        }

        return createJsonResponse([
          {
            ...createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf"),
            originalBaselineScore: 79,
            latestBaselineScore: 79,
          },
        ]);
      }
      if (url.includes("/api/baselines/analyze")) {
        hasCompletedCanonicalAnalyze = true;
        return createJsonResponse({
          id: "base-1",
          latestAssessmentSummary: {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          },
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-1", "resume-1.pdf"),
          originalBaselineScore: 79,
          latestBaselineScore: 79,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf"),
            originalBaselineScore: 79,
            latestBaselineScore: 79,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Ready for targeting")).toBeInTheDocument();
    });

    expect(screen.getByText("Analyze your baseline to get started.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })).toHaveLength(1);
  });

  it("persists submitted detail, renders it back, and confirms unchanged score when recompute is flat", async () => {
    const persistedRefinementSection = {
      id: "section-strengthening-2",
      baselineId: "base-1",
      sectionType: "OTHER" as const,
      title: "Approved signal refinements",
      content: "Change Leadership: Led cross-functional change rollout with adoption milestones.",
      includePolicy: "always" as const,
      order: 11,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH") {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-1", "resume-1.pdf"),
          sections: [
            ...(createAnalyzedBaseline("base-1", "resume-1.pdf").sections ?? []),
            persistedRefinementSection,
          ],
          originalBaselineScore: 79,
          latestBaselineScore: 79,
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-1", "resume-1.pdf"),
          sections: [
            ...(createAnalyzedBaseline("base-1", "resume-1.pdf").sections ?? []),
            persistedRefinementSection,
          ],
          originalBaselineScore: 79,
          latestBaselineScore: 79,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    setFetchImplementation(fetchMock);

    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf"),
            originalBaselineScore: 79,
            latestBaselineScore: 79,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" })[0]);
    await waitFor(() => {
      expect(screen.getByText("Baseline Strengthening")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Strengthen This Signal" })[0]);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Strengthen Signal" })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Led cross-functional change rollout with adoption milestones." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Proposed Update" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve and Apply" }));

    await waitFor(() => {
      expect(screen.getByText("Ready for targeting")).toBeInTheDocument();
    });
    expect(screen.getByText("Saved baseline updates")).toBeInTheDocument();
    const savedUpdatesSection = screen.getByText("Saved baseline updates").closest("article") as HTMLElement;
    expect(
      within(savedUpdatesSection).getByText(/Led cross-functional change rollout with adoption milestones\./i),
    ).toBeInTheDocument();
  });

  it("does not surface score delta chips in streamlined baseline record list", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createBaseline("base-1", "2026-01-01T00:00:00.000Z", "improved.pdf"),
            originalBaselineScore: 71,
            latestBaselineScore: 79,
          },
          {
            ...createBaseline("base-2", "2026-01-02T00:00:00.000Z", "decreased.pdf"),
            originalBaselineScore: 79,
            latestBaselineScore: 74,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("improved.pdf")).toBeInTheDocument();
      expect(screen.getByText("decreased.pdf")).toBeInTheDocument();
    });
    expect(screen.queryByText("+8 since first analysis")).not.toBeInTheDocument();
    expect(screen.queryByText("-5 since first analysis")).not.toBeInTheDocument();
  });

  it("suppresses score history block when no successful analysis exists", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([{ baselineId: "base-1", status: "failed", score: 12 }]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <BaselineStudioHome
        baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/% current/i)).not.toBeInTheDocument();
    });
  });

  it("supports editable vs read-only baseline library rendering modes", () => {
    render(
      <BaselineStudioHome
        baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]}
        libraryMode="readonly"
      />,
    );

    expect(screen.queryByText("UPLOAD YOUR RESUME")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run Career Compatibility Analysis" }).length).toBeGreaterThan(0);
  });

  it("uploads successfully from wrapped API payload and does not persist score history prematurely", async () => {
    let analysisScoreCalled = false;

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines") && init?.method === "POST") {
        return createJsonResponse({
          baseline: createBaseline("uploaded-1", "2026-01-10T00:00:00.000Z", "uploaded.pdf"),
          baselineId: "uploaded-1",
          schemaVersion: "baseline_schema_v1",
          userVerified: false,
          rolesCount: 0,
          toolsCount: 0,
          flagsSummary: { missingFields: 0, lowConfidence: 0 },
        });
      }
      if (url.includes("/analysis-score")) {
        analysisScoreCalled = true;
        throw new Error(`Unexpected fetch: ${url}`);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { container } = render(<BaselineStudioHome baselines={[]} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["resume content"], "uploaded.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("uploaded.pdf")).toBeInTheDocument();
    });
    expect(analysisScoreCalled).toBe(false);
  });
});
