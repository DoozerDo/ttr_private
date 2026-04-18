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
    versionNumber: 1,
    isActive: true,
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

    await screen.findByRole("heading", { name: "Current baseline" });

    expect(screen.queryByText("Your baseline is ready")).toBeNull();
    expect(screen.queryByText("Your resume has been converted into a baseline.")).toBeNull();
    expect(screen.queryByText(/Your baseline is ready for targeting, but it still needs analysis/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Other baselines" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /target a role/i })).toBeNull();
    expect(screen.getAllByRole("link", { name: /view baseline details/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("baseline-upload-surface")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /upload another resume/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Used to create active baseline")).toBeNull();
    expect(screen.getByText(/No other baselines yet/i)).toBeInTheDocument();
  });

  it("shows the upload setup CTA when no baseline exists", async () => {
    const { container } = render(<BaselineStudioHome baselines={[]} />);

    await screen.findByText("Upload your resume to get started");
    expect(screen.getByText(/Upload the resume you want to work from/i)).toBeInTheDocument();
    expect(screen.getByText("Upload resume")).toBeInTheDocument();
    expect(screen.getByTestId("baseline-upload-surface")).toBeInTheDocument();
    expect(screen.getByText("Upload resume or drag and drop a PDF or DOCX here.")).toBeInTheDocument();
    expect(screen.getByText("Accepted file types: PDF and DOCX")).toBeInTheDocument();
    expect(screen.getByText("What is a baseline?")).toBeInTheDocument();
    expect(screen.getByText("Why not just use the resume file?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeInTheDocument();
    expect(screen.getByText("0 of 3 active baselines")).toBeInTheDocument();
    expect(screen.queryByText("Selected:")).toBeNull();
    expect(screen.queryByText(/Drag and drop a resume here, or use the button above/i)).toBeNull();
    expect(container.querySelectorAll('input[type="file"]').length).toBe(1);
  });

  it("archives a non-primary baseline with the canonical id and keeps the active baseline stable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }

      if (url.includes("/api/baselines/base-1/archive") && init?.method === "PATCH") {
        return createJsonResponse({
          ...createAnalyzedBaseline("base-1", "resume-1.pdf", 79),
          status: "ARCHIVED",
          archivedAt: "2026-04-01T00:00:00.000Z",
          isActive: false,
        });
      }

      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf", 79));
      }

      if (url.includes("/api/baselines/base-2")) {
        return createJsonResponse(createAnalyzedBaseline("base-2", "resume-2.pdf", 84));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    setFetchImplementation(fetchMock);

    render(
      <BaselineStudioHome
        baselines={[
          createAnalyzedBaseline("base-2", "resume-2.pdf", 84),
          createAnalyzedBaseline("base-1", "resume-1.pdf", 79),
        ]}
      />,
    );

    const targetRoleLink = () => screen.getAllByRole("link", { name: /target a role/i })[0];

    await screen.findByRole("heading", { name: "Current baseline" });
    await waitFor(() => {
      expect(targetRoleLink()).toHaveAttribute(
        "href",
        "/target?baselineId=base-2",
      );
    });

    const sourceSection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
    expect(sourceSection).toBeTruthy();
    const archivedCard = within(sourceSection as HTMLElement).getByText("resume-1.pdf").closest("article");
    expect(archivedCard).toBeTruthy();
    fireEvent.click(within(archivedCard as HTMLElement).getByRole("button", { name: /archive/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baselines/base-1/archive",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    await waitFor(() => {
      expect(targetRoleLink()).toHaveAttribute(
        "href",
        "/target?baselineId=base-2",
      );
      expect(within(sourceSection as HTMLElement).queryByText("resume-1.pdf")).toBeNull();
    });
  });

  it("shows the per-card targeting CTA when a baseline exists but no analysis is complete", async () => {
    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);

    await screen.findByText("Upload your resume to get started");
    expect(screen.queryByTestId("baseline-upload-surface")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /upload another resume/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /target a role/i })).toBeNull();
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

    expect(screen.queryByText("Your baseline is ready")).toBeNull();
    const activeSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
    expect(activeSection).toBeTruthy();
    expect(within(activeSection as HTMLElement).getByText("resume-1.pdf")).toBeInTheDocument();
    expect(within(activeSection as HTMLElement).queryByText("Validated baseline")).toBeNull();
    expect(within(activeSection as HTMLElement).getByText("Current")).toBeInTheDocument();
    expect(within(activeSection as HTMLElement).getByText("Ready for targeting")).toBeInTheDocument();
    expect(within(activeSection as HTMLElement).getByText("Version 1 (current)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "View baseline details" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /target a role/i }).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /target a role/i })[0]).toHaveAttribute(
        "href",
        "/target?baselineId=base-1",
      );
    });
    expect(screen.queryByRole("link", { name: "START FIT REVIEW" })).toBeNull();
    expect(screen.getByText("What is a baseline?")).toBeInTheDocument();
    expect(screen.getByText("Why not just use the resume file?")).not.toBeVisible();
  });

  it("does not expose downstream navigation (Studio/Results) from the baseline page", async () => {
    const baseline = createAnalyzedBaseline("base-1", "resume-1.pdf", 82);
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([baseline]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { container } = render(<BaselineStudioHome baselines={[baseline]} />);
    await screen.findByRole("heading", { name: "Current baseline" });

    const links = Array.from(container.querySelectorAll("a[href]"))
      .map((anchor) => anchor.getAttribute("href") ?? "")
      .filter(Boolean);

    expect(links.some((href) => href.startsWith("/studio") || href.includes("/studio?"))).toBe(false);
    expect(links.some((href) => href.startsWith("/results") || href.includes("/results?"))).toBe(false);

    expect(screen.queryByText(/open resume studio/i)).toBeNull();
    expect(screen.queryByText(/view latest results/i)).toBeNull();
  });

  it("uploads a second resume without replacing the current baseline", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([
          { status: "complete", score: 81 },
          { status: "complete", score: 78 },
          { status: "complete", score: 84 },
        ]);
      }
      if (url.includes("/api/baselines") && init?.method === "POST") {
        return createJsonResponse({
          baseline: createBaseline("base-2", "2026-01-04T00:00:00.000Z", "resume-2.pdf", {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: null,
            latestFitScore: null,
            hasCompletedAssessment: false,
          }),
          baselineId: "base-2",
          schemaVersion: "baseline_schema_v1",
          userVerified: false,
          rolesCount: 0,
          toolsCount: 0,
          flagsSummary: { missingFields: 0, lowConfidence: 0 },
        });
      }
      if (url.includes("/api/baselines/analyze")) {
        return createJsonResponse({
          id: "base-2",
          latestAssessmentSummary: {
            latestAssessmentId: "assessment-base-2",
            latestAssessmentCreatedAt: "2026-03-21T12:00:00.000Z",
            latestFitScore: 86,
            hasCompletedAssessment: true,
          },
        });
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([
          { ...createAnalyzedBaseline("base-1", "resume-1.pdf", 82), isActive: true },
          { ...createAnalyzedBaseline("base-2", "resume-2.pdf", 86), isActive: false },
        ]);
      }
      if (url.includes("/api/baselines/base-2")) {
        return createJsonResponse(createAnalyzedBaseline("base-2", "resume-2.pdf", 86));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    setFetchImplementation(fetchMock);

    const { container } = render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 82)]} />);

    await screen.findByRole("heading", { name: "Current baseline" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const clickSpy = vi.spyOn(fileInput as HTMLInputElement, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Upload another resume" }));
    expect(clickSpy).toHaveBeenCalled();

    const replacement = new File(["resume 2"], "resume-2.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [replacement] } });

    await waitFor(() => {
      expect(screen.getAllByText("resume-2.pdf").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      const currentSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
      expect(currentSection).toBeTruthy();
      expect(within(currentSection as HTMLElement).getByRole("link", { name: /target a role/i })).toHaveAttribute(
        "href",
        "/target?baselineId=base-1",
      );
    });
    expect(screen.getByRole("heading", { name: "Other baselines" })).toBeInTheDocument();
    clickSpy.mockRestore();
  });

  it("promotes a baseline to current only when Set Active is clicked", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          { ...createAnalyzedBaseline("base-1", "resume-1.pdf", 82), isActive: true },
          { ...createAnalyzedBaseline("base-2", "resume-2.pdf", 79), isActive: false },
        ]}
      />,
    );

    const currentSection = await screen.findByRole("heading", { name: "Current baseline" });
    const currentCard = currentSection.closest("section");
    expect(currentCard).toBeTruthy();
    expect(within(currentCard as HTMLElement).getByText("resume-1.pdf")).toBeInTheDocument();

    const librarySection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
    expect(librarySection).toBeTruthy();
    expect(within(librarySection as HTMLElement).getByText("resume-2.pdf")).toBeInTheDocument();

    const baseline2Card = within(librarySection as HTMLElement).getByText("resume-2.pdf").closest("article");
    expect(baseline2Card).toBeTruthy();
    fireEvent.click(within(baseline2Card as HTMLElement).getByRole("button", { name: /set current/i }));

    await waitFor(() => {
      const nextCurrentSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
      expect(nextCurrentSection).toBeTruthy();
      expect(within(nextCurrentSection as HTMLElement).getByText("resume-2.pdf")).toBeInTheDocument();
    });

    await waitFor(() => {
      const nextLibrarySection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
      expect(nextLibrarySection).toBeTruthy();
      expect(within(nextLibrarySection as HTMLElement).getByText("resume-1.pdf")).toBeInTheDocument();
    });
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

    await screen.findByText("3 of 3 active baselines");
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getAllByText("resume-1.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("resume-2.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("resume-3.pdf").length).toBeGreaterThan(0);
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

    await screen.findByText("Upload your resume to get started");
    expect(screen.queryByText("Uploaded resumes")).toBeNull();
    expect(screen.queryByText("resume-1.pdf")).toBeNull();
  });

  it("does not expose downstream generation actions for a low-fit analyzed baseline", async () => {
    render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 55)]} />);

    await screen.findByRole("heading", { name: "Current baseline" });
    await screen.findByText("Other baselines");
    expect(screen.queryByText(/Role fit score/i)).toBeNull();
    const activeSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
    expect(activeSection).toBeTruthy();
    expect(within(activeSection as HTMLElement).getByText("resume-1.pdf")).toBeInTheDocument();
    expect(within(activeSection as HTMLElement).queryByText("Validated baseline")).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload resume" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "View baseline details" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /target a role/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "OPEN RESUME STUDIO" })).toBeNull();
  });

  it("explains the upload flow as a structured source of truth for a new user", async () => {
    render(<BaselineStudioHome baselines={[]} />);

    await screen.findByText("Upload your resume to get started");
    await screen.findByText(/Upload the resume you want to work from/i);
    await screen.findByText("Upload your resume to create your baseline.");
    await screen.findByText("Resumes are written for people, not systems.");
    await screen.findByText(
      "The baseline translates your resume into a format that can be analyzed, scored, and reused across every job you target.",
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
    expect(screen.getByRole("heading", { name: "Current baseline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Other baselines" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /upload another resume/i })[0]);

    expect(screen.queryByText("Professional Signals Diagnosis")).not.toBeInTheDocument();
    expect(screen.queryByText("Signals Detected")).not.toBeInTheDocument();
    expect(screen.queryByText("Strong Signals")).not.toBeInTheDocument();
    expect(screen.queryByText("Developing Signals")).not.toBeInTheDocument();
    expect(screen.queryByText("Signal Effect")).not.toBeInTheDocument();
    await screen.findByText("Other baselines");
  });

  it("renders the major baseline sections in the intended order", async () => {
    render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 82)]} />);

    expect(screen.queryByRole("heading", { name: "Your baseline is ready" })).toBeNull();
    const activeHeading = screen.getByRole("heading", { name: "Current baseline" });
    const sourceHeading = screen.getByRole("heading", { name: "Other baselines" });

    const activeSection = activeHeading.closest("section");
    const explanationSection = screen.getByText("What is a baseline?").closest("details");
    const sourceSection = sourceHeading.closest("section");

    expect(activeSection).toBeTruthy();
    expect(explanationSection).toBeTruthy();
    expect(sourceSection).toBeTruthy();
    expect(activeSection!.compareDocumentPosition(explanationSection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(explanationSection!.compareDocumentPosition(sourceSection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      expect(screen.getByText("Other baselines")).toBeInTheDocument();
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
      expect(screen.getByText("Other baselines")).toBeInTheDocument();
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
      expect(screen.getByText("Other baselines")).toBeInTheDocument();
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
      expect(screen.getByText("Other baselines")).toBeInTheDocument();
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
      expect(screen.getByText("Other baselines")).toBeInTheDocument();
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
      expect(screen.getByText("Other baselines")).toBeInTheDocument();
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
    expect(screen.getByText("Other baselines")).toBeInTheDocument();
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
    await screen.findByText("Other baselines");
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

    await screen.findByRole("heading", { name: "Current baseline" });
    expect(screen.queryByText(/Last analyzed/i)).toBeNull();
    expect(screen.queryByText(/Role fit score/i)).toBeNull();
    expect(screen.getAllByRole("link", { name: "View baseline details" }).length).toBeGreaterThan(0);
    const activeSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
    expect(activeSection).toBeTruthy();
    expect(within(activeSection as HTMLElement).getByText("resume-1.pdf")).toBeInTheDocument();
    expect(within(activeSection as HTMLElement).queryByText("Validated baseline")).toBeNull();
    const sourceSection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
    expect(sourceSection).toBeTruthy();
    expect(within(sourceSection as HTMLElement).queryByText("resume-1.pdf")).toBeNull();
    expect(within(sourceSection as HTMLElement).getByText(/No other baselines yet/i)).toBeInTheDocument();
  });

  it("wires Upload another resume to the canonical upload input when a baseline exists", async () => {
    const inputClick = vi
      .spyOn(window.HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);

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

    await screen.findByRole("heading", { name: "Current baseline" });
    const uploadButtons = screen.getAllByRole("button", { name: /upload another resume/i });
    expect(uploadButtons.length).toBeGreaterThan(0);
    fireEvent.click(uploadButtons[0]);
    expect(inputClick).toHaveBeenCalled();

    inputClick.mockRestore();
  });

  it("keeps the active analyzed baseline authoritative when stale non-active baselines are still not analyzed", async () => {
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
          createBaseline("base-old", "2026-01-01T00:00:00.000Z", "resume-old.pdf", {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: null,
            latestFitScore: null,
            hasCompletedAssessment: false,
          }),
          createBaseline("base-new", "2026-01-03T00:00:00.000Z", "resume-new.pdf", {
            latestAssessmentId: "assessment-new",
            latestAssessmentCreatedAt: "2026-03-20T12:00:00.000Z",
            latestFitScore: 87,
            hasCompletedAssessment: true,
          }),
        ]}
      />,
    );

    await screen.findByRole("heading", { name: "Current baseline" });
    const activeSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
    expect(activeSection).toBeTruthy();
    expect(within(activeSection as HTMLElement).getAllByRole("link", { name: /target a role/i }).length).toBeGreaterThan(0);

    const activeCard = within(screen.getAllByText("resume-new.pdf")[0].closest("article") as HTMLElement);
    expect(activeCard.getByText(/ready for targeting/i)).toBeInTheDocument();
    expect(activeCard.queryByText(/not analyzed/i)).toBeNull();
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

    expect(screen.queryByText(/Last analyzed/i)).toBeNull();
    expect(screen.queryByText(/Last role analysis:/i)).toBeNull();
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

    await screen.findAllByText("resume-1.pdf");
    expect(screen.getAllByRole("button", { name: /upload another resume/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Last role analysis: 67%")).toBeNull();
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

    await screen.findByRole("heading", { name: "Current baseline" });
    const currentSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
    expect(currentSection).toBeTruthy();
    const baselineArticle = within(
      within(currentSection as HTMLElement).getByText("resume-1.pdf").closest("article") as HTMLElement,
    );
    expect(baselineArticle.queryByText(/not analyzed/i)).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /upload another resume/i })[0]);

    expect(baselineArticle.queryByText(/not analyzed/i)).toBeNull();
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

    const librarySection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
    expect(librarySection).toBeTruthy();
    const baselineAArticle = within(
      within(librarySection as HTMLElement).getByText("resume-a.pdf").closest("article") as HTMLElement,
    );
    const currentSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
    expect(currentSection).toBeTruthy();
    const baselineBArticle = within(
      within(currentSection as HTMLElement).getByText("resume-b.pdf").closest("article") as HTMLElement,
    );
    expect(baselineAArticle.queryByText(/not analyzed/i)).toBeNull();
    expect(baselineBArticle.queryByText(/not analyzed/i)).toBeNull();

    publishBaselineUpdated({ baselineId: "base-a", source: "analysis" });

    await waitFor(() => {
      expect(screen.getAllByText(/ready for targeting/i).length).toBeGreaterThan(0);
    });
    expect(baselineBArticle.queryByText(/not analyzed/i)).toBeNull();
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

    fireEvent.click(screen.getAllByRole("button", { name: "Upload another resume" })[0]);

    await waitFor(() => {
      expect(screen.queryByText("Your baseline is ready")).toBeNull();
    });

    expect(screen.queryByText("Upload another resume if you want to replace the source file.")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Upload another resume" }).length).toBeGreaterThanOrEqual(1);
  });

  it("persists submitted detail, renders it back, and confirms unchanged score when recompute is flat", async () => {
    render(<BaselineStudioHome baselines={[createAnalyzedBaseline("base-1", "resume-1.pdf", 82)]} />);
    await waitFor(() => {
      expect(screen.getByText("Other baselines")).toBeInTheDocument();
    });
    expect(screen.getByText("Baseline Strengthening")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Strengthen This Signal" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).toBeNull();
  });

  it("classifies duplicate strengthening as no-change and anchors feedback on the affected signal", async () => {
    const baseline = createAnalyzedBaseline("base-1", "resume-1.pdf", 82);
    baseline.latestBaselineScore = 79;

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([baseline]);
      }
      if (url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH") {
        return createJsonResponse({
          ...baseline,
          latestBaselineScore: 79,
          impactType: "duplicate",
          changeClassification: "no_change_duplicate",
          scoreDelta: 0,
          explanation: "This addition appears to already be covered by existing baseline evidence.",
          matchedRequirement: null,
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(baseline);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[baseline]} />);
    await screen.findByText("Baseline Strengthening");

    fireEvent.click(screen.getAllByRole("button", { name: "Strengthen This Signal" })[0]);
    expect(screen.getByRole("dialog", { name: "Strengthen Signal" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Add concrete evidence/i), {
      target: { value: "I reduced incident resolution time by 18% across the support team." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Proposed Update" }));
    await screen.findByText("Proposed baseline update");

    fireEvent.click(screen.getByRole("button", { name: "Approve and Apply" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).toBeNull();
    });

    expect(screen.queryByText("Signal strengthened")).toBeNull();
    const feedbackBlocks = screen.getAllByTestId(/baseline-strengthening-feedback-/);
    expect(feedbackBlocks.length).toBeGreaterThan(0);
    expect(feedbackBlocks[0]).toHaveTextContent("No changes made. This experience is already represented.");
  });

  it("classifies refined strengthening as improved and anchors feedback on the affected signal", async () => {
    const baseline = createAnalyzedBaseline("base-1", "resume-1.pdf", 82);
    baseline.latestBaselineScore = 79;

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([baseline]);
      }
      if (url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH") {
        return createJsonResponse({
          ...baseline,
          latestBaselineScore: 81,
          impactType: "strengthened_match",
          changeClassification: "refined_existing_signal",
          scoreDelta: 2,
          explanation: "This strengthens an existing requirement match: reduce incident resolution time",
          matchedRequirement: "reduce incident resolution time",
        });
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(baseline);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[baseline]} />);
    await screen.findByText("Baseline Strengthening");

    fireEvent.click(screen.getAllByRole("button", { name: "Strengthen This Signal" })[0]);
    fireEvent.change(screen.getByPlaceholderText(/Add concrete evidence/i), {
      target: { value: "Reduced incident resolution time by 18% by redesigning the escalation workflow." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Proposed Update" }));
    await screen.findByText("Proposed baseline update");
    fireEvent.click(screen.getByRole("button", { name: "Approve and Apply" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).toBeNull();
    });

    const feedbackBlocks = screen.getAllByTestId(/baseline-strengthening-feedback-/);
    expect(feedbackBlocks.length).toBeGreaterThan(0);
    expect(feedbackBlocks[0]).toHaveTextContent("Signal improved. We strengthened how this experience is described.");
    expect(feedbackBlocks[0]).toHaveTextContent("(reduce incident resolution time)");
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
      expect(screen.getAllByText("decreased.pdf").length).toBeGreaterThan(0);
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

    await screen.findByText("Other baselines");
    expect(screen.queryByText("UPLOAD YOUR RESUME")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /upload/i }).length).toBeGreaterThan(0);
  });

  it("shows a single primary upload action for empty baseline state", async () => {
    render(<BaselineStudioHome baselines={[]} />);

    await screen.findByText("Upload your resume to get started");
    expect(screen.getAllByRole("button", { name: "Upload resume" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Selected" })).not.toBeInTheDocument();
    expect(screen.getByText("Accepted file types: PDF and DOCX")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 active baselines")).toBeInTheDocument();
  });

  it("shows Archive only on non-current baseline library cards", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          createAnalyzedBaseline("base-1", "current.pdf", 90),
          createAnalyzedBaseline("base-2", "other.pdf", 84),
        ]}
      />,
    );

    const currentSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
    expect(currentSection).not.toBeNull();
    expect(within(currentSection as HTMLElement).queryByRole("button", { name: "Archive" })).toBeNull();

    const librarySection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
    expect(librarySection).not.toBeNull();
    expect(within(librarySection as HTMLElement).getByText("other.pdf")).toBeInTheDocument();
    expect(within(librarySection as HTMLElement).getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(within(librarySection as HTMLElement).queryByText("current.pdf")).toBeNull();
  });

  it("moves Archive visibility when changing current baseline", async () => {
    render(
      <BaselineStudioHome
        baselines={[
          createAnalyzedBaseline("base-1", "current.pdf", 90),
          createAnalyzedBaseline("base-2", "other.pdf", 84),
        ]}
      />,
    );

    const librarySection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
    expect(librarySection).not.toBeNull();

    const setCurrentButton = within(librarySection as HTMLElement).getByRole("button", { name: /set current/i });
    fireEvent.click(setCurrentButton);

    await waitFor(() => {
      const currentSection = screen.getByRole("heading", { name: "Current baseline" }).closest("section");
      expect(currentSection).not.toBeNull();
      expect(within(currentSection as HTMLElement).getByText("other.pdf")).toBeInTheDocument();
      expect(within(currentSection as HTMLElement).queryByRole("button", { name: "Archive" })).toBeNull();
    });

    const refreshedLibrarySection = screen.getByRole("heading", { name: "Other baselines" }).closest("section");
    expect(refreshedLibrarySection).not.toBeNull();
    expect(within(refreshedLibrarySection as HTMLElement).getByText("current.pdf")).toBeInTheDocument();
    expect(within(refreshedLibrarySection as HTMLElement).getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("uploads successfully from wrapped API payload and does not persist score history prematurely", async () => {
    let analyzeCalled = false;

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/analyze")) {
        analyzeCalled = true;
        return createJsonResponse({
          id: "uploaded-1",
          latestAssessmentSummary: {
            latestAssessmentId: "assessment-uploaded-1",
            latestAssessmentCreatedAt: "2026-01-10T00:05:00.000Z",
            latestFitScore: 82,
            hasCompletedAssessment: true,
          },
        });
      }
      if (url.includes("/api/baselines") && init?.method === "POST") {
        return createJsonResponse({
          baseline: createBaseline("uploaded-1", "2026-01-10T00:00:00.000Z", "uploaded.pdf", {
            latestAssessmentId: null,
            latestAssessmentCreatedAt: null,
            latestFitScore: null,
            hasCompletedAssessment: false,
          }),
          baselineId: "uploaded-1",
          schemaVersion: "baseline_schema_v1",
          userVerified: false,
          rolesCount: 0,
          toolsCount: 0,
          flagsSummary: { missingFields: 0, lowConfidence: 0 },
        });
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([
          createAnalyzedBaseline("uploaded-1", "uploaded.pdf", 82),
        ]);
      }
      if (url.includes("/api/baselines/uploaded-1")) {
        return createJsonResponse(createAnalyzedBaseline("uploaded-1", "uploaded.pdf", 82));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { container } = render(<BaselineStudioHome baselines={[]} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["resume content"], "uploaded.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getAllByText("uploaded.pdf").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(analyzeCalled).toBe(true);
    });
    expect(screen.queryByText("Your baseline is ready")).toBeNull();
  });
});





