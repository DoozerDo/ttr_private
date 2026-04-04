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

function createAnalyzedBaseline(id: string, filename = `${id}.pdf`, latestFitScore = 82) {
  return {
    ...createBaseline(id, "2026-01-01T00:00:00.000Z", filename),
    latestAssessmentSummary: {
      latestAssessmentId: `assessment-${id}`,
      latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
      latestFitScore,
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
    fireEvent.click(screen.getAllByRole("button", { name: "CONTINUE BUILDING BASELINE" })[0]);

    await screen.findByText("Baseline library");

    expect(screen.getByText("Continue building your baseline")).toBeInTheDocument();
    expect(screen.getByText("You already have a baseline. Add the missing evidence to unlock analysis.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONTINUE BUILDING BASELINE" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })).toBeNull();
  });

  it("shows the upload setup CTA when no baseline exists", async () => {
    const { container } = render(<BaselineStudioHome baselines={[]} />);

    await screen.findByText("Upload your baseline to get started");
    expect(screen.getByText(/Upload the resume you want to work from/i)).toBeInTheDocument();
    expect(screen.getByText("Upload your resume")).toBeInTheDocument();
    expect(screen.getByTestId("baseline-upload-surface")).toBeInTheDocument();
    expect(screen.getByText("Upload resume or drag and drop a PDF or DOCX here.")).toBeInTheDocument();
    expect(screen.getByText("Accepted file types: PDF and DOCX")).toBeInTheDocument();
    expect(screen.getByText("We verify and structure your experience")).toBeInTheDocument();
    expect(screen.getByText("Primary action: upload your baseline.")).toBeInTheDocument();
    expect(screen.getByText("Why not use my resume as-is?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeInTheDocument();
    expect(screen.getByText("0 of 3 active resumes")).toBeInTheDocument();
    expect(screen.queryByText("Selected:")).toBeNull();
    expect(screen.queryByText(/Drag and drop a resume here, or use the button above/i)).toBeNull();
    expect(container.querySelectorAll('input[type="file"]').length).toBe(1);
  });

  it("shows the per-card targeting CTA when a baseline exists but no analysis is complete", async () => {
    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);

    await screen.findByText("Continue building your baseline");
    await screen.findByText("You already have a baseline. Add the missing evidence to unlock analysis.");
    expect(screen.getByText("Primary action: continue building baseline.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getByRole("button", { name: "CONTINUE BUILDING BASELINE" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ADD JOB" })).toBeNull();
    expect(screen.queryByRole("link", { name: "VIEW LATEST RESULTS" })).toBeNull();
  });

  it("shows the launch point for a qualified analyzed baseline", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([
          { status: "complete", score: 81 },
          { status: "complete", score: 78 },
          { status: "complete", score: 84 },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 82)]} />);

    expect(screen.getByText("Your verified baseline is ready")).toBeInTheDocument();
    expect(screen.getByText("Baseline library")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getByRole("link", { name: "VIEW BASELINE DETAILS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ADD JOB" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "ADD JOB" })).toHaveAttribute(
        "href",
        "/target?baselineId=base-1",
      );
    });
    expect(screen.getByRole("link", { name: "VIEW LATEST RESULTS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OPEN RESUME STUDIO" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "START FIT REVIEW" })).toBeNull();
    expect(screen.getByText("1 of 3 active resumes")).toBeInTheDocument();
    expect(screen.queryByText("Verified baseline")).toBeNull();
    expect(screen.getByText("Why not use my resume as-is?")).toBeVisible();
  });

  it("renders multiple resumes and blocks upload at the library cap", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf"),
          createBaseline("base-2", "2026-01-02T00:00:00.000Z", "resume-2.pdf"),
          createBaseline("base-3", "2026-01-03T00:00:00.000Z", "resume-3.pdf"),
        ]}
      />,
    );

    await screen.findByText("3 of 3 active resumes");
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getByText("resume-1.pdf")).toBeInTheDocument();
    expect(screen.getByText("resume-2.pdf")).toBeInTheDocument();
    expect(screen.getByText("resume-3.pdf")).toBeInTheDocument();
  });

  it("hides the targeting CTA for archived resumes", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf"),
            status: "ARCHIVED" as const,
            archivedAt: "2026-03-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    await screen.findByText("Baseline library");
    await screen.findByText("resume-1.pdf");
    expect(screen.queryByRole("button", { name: "CONTINUE BUILDING BASELINE" })).toBeNull();
  });

  it("shows the fit-review launch point for a low-fit analyzed baseline", async () => {
    render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 55)]} />);

    await screen.findByText("Your verified baseline is ready");
    await screen.findByText("Baseline library");
    await screen.findByText("Last role analysis: 55%");
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getByRole("link", { name: "VIEW BASELINE DETAILS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VIEW LATEST RESULTS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "START FIT REVIEW" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "OPEN RESUME STUDIO" })).toBeNull();
  });

  it("explains the upload flow as a structured source of truth for a new user", async () => {
    render(<BaselineStudioHome baselines={[]} />);

    await screen.findByText("Upload your baseline to get started");
    await screen.findByText(/Upload the resume you want to work from/i);
    await screen.findByText("Upload your resume to create your baseline file.");
    await screen.findByText(
      "Because resumes are written for people, not systems. TTR first turns your resume into a verified working baseline so scores and generated documents stay consistent, traceable, and grounded in what you have actually done.",
    );
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeInTheDocument();
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
    fireEvent.click(screen.getAllByRole("button", { name: "CONTINUE BUILDING BASELINE" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });

    expect(screen.queryByText("Professional Signals Diagnosis")).not.toBeInTheDocument();
    expect(screen.queryByText("Signals Detected")).not.toBeInTheDocument();
    expect(screen.queryByText("Strong Signals")).not.toBeInTheDocument();
    expect(screen.queryByText("Developing Signals")).not.toBeInTheDocument();
    expect(screen.queryByText("Signal Effect")).not.toBeInTheDocument();
    await screen.findByText("Baseline library");
  });

  it("renders strengthening entries from developing signals and supports modal proposal review", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createAnalyzedBaseline("base-1", "resume-1.pdf", 82),
            originalBaselineScore: 79,
            latestBaselineScore: 79,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("button", { name: "Strengthen This Signal" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).toBeNull();
    expect(screen.queryByText("Proposed baseline update")).toBeNull();
    expect(screen.queryByText(/Previous score 79%\. New score 82%\. Delta \+3%/i)).toBeNull();
    expect(screen.queryByText(/Added signal:/i)).toBeNull();
  });

  it("recomputes the score immediately after accepting a strengthening addition and shows the delta", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createAnalyzedBaseline("base-1", "resume-1.pdf", 82),
            originalBaselineScore: 79,
            latestBaselineScore: 79,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "Strengthen This Signal" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).toBeNull();
    expect(screen.queryByText("Signal strengthened")).toBeNull();
    expect(screen.queryByText(/Delta \+3%/i)).toBeNull();
  });

  it("shows an explicit no-change message when strengthening does not change the score", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createAnalyzedBaseline("base-1", "resume-1.pdf", 80),
            originalBaselineScore: 80,
            latestBaselineScore: 80,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "Strengthen This Signal" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Impact: no match/i)).toBeNull();
    expect(screen.queryByText(/This addition was saved/i)).toBeNull();
  });

  it("shows an error when strengthening recompute fails", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          {
            ...createAnalyzedBaseline("base-1", "resume-1.pdf", 79),
            originalBaselineScore: 79,
            latestBaselineScore: 79,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "Strengthen This Signal" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Unable to save update")).toBeNull();
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

    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });

    expect(screen.queryAllByRole("button", { name: "Change Leadership" })).toHaveLength(0);
    expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).toBeNull();
    expect(
      screen.queryByText("Describe a process, tooling, or support change you led and what changed because of it."),
    ).toBeNull();
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

    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });
    expect(screen.queryByText("Career Gravity is locked")).not.toBeInTheDocument();
    expect(screen.queryByText("Career Gravity")).not.toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.queryByText("Career Gravity is locked")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Career Gravity")).not.toBeInTheDocument();
    expect(screen.getByText("Baseline library")).toBeInTheDocument();
  });

  it("keeps baseline record streamlined after analysis without score history chip blocks", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
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

    render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 82)]} />);
    await screen.findByText("Baseline library");
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

    await screen.findByText("Your verified baseline is ready");
    await screen.findByText(/Last analyzed/i);
    expect(screen.queryByText(/Fit 82%/i)).not.toBeInTheDocument();
    expect(screen.getByText("Last role analysis: 82%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VIEW LATEST RESULTS" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "CONTINUE BUILDING BASELINE" })).not.toBeInTheDocument();
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

    await screen.findByText(/Last analyzed/i);
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

    await screen.findByText(/not analyzed/i);
    expect(screen.getAllByRole("button", { name: "CONTINUE BUILDING BASELINE" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Last role analysis: 67%")).toBeInTheDocument();
    expect(screen.queryByText(/your verified baseline is ready/i)).not.toBeInTheDocument();
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

    await screen.findByText("resume-1.pdf");
    const baselineArticle = within(screen.getByText("resume-1.pdf").closest("article") as HTMLElement);
    expect(baselineArticle.getByText(/not analyzed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "CONTINUE BUILDING BASELINE" }));

    await screen.findByText(/not analyzed/i);
    expect(baselineArticle.getByText(/not analyzed/i)).toBeInTheDocument();
    expect(baselineArticle.queryByText(/ready for targeting/i)).toBeNull();
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
    expect(baselineAArticle.getByText(/not analyzed/i)).toBeInTheDocument();
    expect(baselineBArticle.getByText(/not analyzed/i)).toBeInTheDocument();

    publishBaselineUpdated({ baselineId: "base-a", source: "analysis" });

    await waitFor(() => {
      expect(baselineAArticle.getByText(/ready for targeting/i)).toBeInTheDocument();
    });
    expect(baselineBArticle.getByText(/not analyzed/i)).toBeInTheDocument();
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
            ...createAnalyzedBaseline("base-1", "resume-1.pdf", 82),
            originalBaselineScore: 79,
            latestBaselineScore: 79,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Your verified baseline is ready")).toBeInTheDocument();
    });

    expect(screen.getByText("Add more evidence or replace the source file if you need to strengthen the baseline.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "RUN COMPATIBILITY ANALYSIS" })).toHaveLength(1);
  });

  it("persists submitted detail, renders it back, and confirms unchanged score when recompute is flat", async () => {
    render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 82)]} />);
    await waitFor(() => {
      expect(screen.getByText("Baseline library")).toBeInTheDocument();
    });
    expect(screen.getByText("Baseline Strengthening")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Strengthen This Signal" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).toBeNull();
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

  it("supports editable vs read-only baseline library rendering modes", async () => {
    render(
      <BaselineStudioHome
        baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]}
        libraryMode="readonly"
      />,
    );

    await screen.findByText("Baseline library");
    expect(screen.queryByText("UPLOAD YOUR RESUME")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "CONTINUE BUILDING BASELINE" }).length).toBeGreaterThan(0);
  });

  it("shows a single primary upload action for empty baseline state", async () => {
    render(<BaselineStudioHome baselines={[]} />);

    await screen.findByText("Upload your baseline to get started");
    expect(screen.getAllByRole("button", { name: "Upload resume" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Selected" })).not.toBeInTheDocument();
    expect(screen.getByText("Accepted file types: PDF and DOCX")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 active resumes")).toBeInTheDocument();
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



