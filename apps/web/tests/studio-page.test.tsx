import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { listBaselines } from "@/lib/baselines";
import { listJobs } from "@/lib/jobsClient";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockRouterPush, overrideSearchParams, setFetchImplementation } from "./setup";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

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

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody =
    typeof body === "string"
      ? body
      : body === undefined
        ? ""
        : JSON.stringify(body);

  return {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") {
          return "application/json";
        }
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
}

describe("Studio page UX", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("hydrates Studio from Results analysisId and shows the ready banner", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
      jobId: "job-2",
      baselineId: "base-2",
      baselineVersionId: "base-version-2",
    });
    vi.mocked(listJobs).mockResolvedValueOnce([
      {
        id: "job-1",
        company: "Acme",
        title: "Director of Support",
        archivedAt: null,
        isArchived: false,
      },
      {
        id: "job-2",
        company: "Orbit",
        title: "Head of Customer Operations",
        archivedAt: null,
        isArchived: false,
      },
    ]);
    vi.mocked(listBaselines).mockResolvedValueOnce([
      {
        id: "base-1",
        originalFilename: "Leadership Resume",
        version: 1,
      },
      {
        id: "base-2",
        originalFilename: "Platform Resume",
        version: 2,
      },
    ]);
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            score: 84,
            jobId: "job-2",
            baselineId: "base-2",
            baselineVersionId: "base-version-2",
            company: "Orbit",
            jobTitle: "Head of Customer Operations",
            supportingSignals: ["Incident Management", "Cross Functional Coordination"],
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-results-ready-banner")).toBeInTheDocument();
    });

    expect(screen.getByText("Studio ready")).toBeInTheDocument();
    expect(screen.getByText("Context loaded")).toBeInTheDocument();
    expect(screen.getByText("Orbit — Head of Customer Operations")).toBeInTheDocument();
    expect(screen.getByText(/Using resume/i)).toHaveTextContent("Using resume Platform Resume");
    expect(fetchMock).toHaveBeenCalledWith("/api/analysis/fit-assessments/analysis-2");
  });

  it("uses top-band streamlined generation CTA when score is 90+", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 94,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    expect(await screen.findByRole("button", { name: "Generate My Application" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Resume" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Cover Letter" })).not.toBeInTheDocument();
  });

  it("shows guidance when analysisId is missing", async () => {
    overrideSearchParams({});

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Role analysis required")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Select a role from Results to generate documents.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Run a role compatibility analysis first.").length).toBeGreaterThan(0);
  });

  it("renders fit score when a valid analysisId is provided", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
    });
    vi.mocked(listJobs).mockResolvedValueOnce([
      {
        id: "job-2",
        company: "Orbit",
        title: "Head of Customer Operations",
        archivedAt: null,
        isArchived: false,
      },
    ]);
    vi.mocked(listBaselines).mockResolvedValueOnce([
      {
        id: "base-2",
        originalFilename: "Platform Resume",
        version: 2,
      },
    ]);
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            score: 84,
            jobId: "job-2",
            baselineId: "base-2",
            company: "Orbit",
            jobTitle: "Head of Customer Operations",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-results-ready-banner")).toBeInTheDocument();
    });

    expect(screen.getByText("84.0")).toBeInTheDocument();
  });

  it("enables document generation when role analysis is loaded", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
      jobId: "job-2",
      baselineId: "base-2",
      baselineVersionId: "base-version-2",
    });
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            score: 84,
            jobId: "job-2",
            baselineId: "base-2",
            baselineVersionId: "base-version-2",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);
    renderStudio();

    const resumeButton = await screen.findByRole("button", { name: "Generate Resume" });
    const coverLetterButton = await screen.findByRole("button", {
      name: "Generate Cover Letter",
    });
    await waitFor(() => {
      expect(resumeButton).toBeEnabled();
      expect(coverLetterButton).toBeEnabled();
    });
  });

  it("shows a concise analysis error when the analysis endpoint returns html", async () => {
    overrideSearchParams({
      analysisId: "analysis-2",
    });
    vi.mocked(listJobs).mockResolvedValueOnce([
      {
        id: "job-2",
        company: "Orbit",
        title: "Head of Customer Operations",
        archivedAt: null,
        isArchived: false,
      },
    ]);
    vi.mocked(listBaselines).mockResolvedValueOnce([
      {
        id: "base-2",
        originalFilename: "Platform Resume",
        version: 2,
      },
    ]);
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-2/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-2", fileHash: "hash-2", versionNumber: 2 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve({
          ok: false,
          status: 502,
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html" : null),
          },
          json: () => Promise.resolve(null),
          text: () =>
            Promise.resolve(
              "<!doctype html><html><body><h1>Application error</h1></body></html>",
            ),
          blob: () => Promise.resolve(new Blob()),
        });
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Unable to load role analysis")).toBeInTheDocument();
    });

    expect(
      screen.getAllByText(
        "Unable to load role analysis. Please return to Results and reopen the document generator.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Application error/i)).toBeNull();
    expect(screen.queryByText(/<!doctype html>/i)).toBeNull();
  });

  it("renders the Document Generator header", async () => {
    overrideSearchParams({});
    renderStudio();
    expect(screen.getByText("Document Generator")).toBeInTheDocument();
  });

  it("hides internal terms and metadata", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Targeting and Evidence")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Job$/)).toBeNull();
    expect(screen.queryByText(/^Baseline$/)).toBeNull();
    expect(screen.queryByText("Baseline Version ID:")).toBeNull();
    expect(screen.queryByText("Artifact Readiness")).toBeNull();
    expect(screen.queryByText(/Using baseline/i)).toBeNull();
    expect(screen.queryByText(/^Confidence$/)).toBeNull();
  });

  it("shows evidence summary and corrected focus recommendation", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Evidence used for this resume")).toBeInTheDocument();
    });

    expect(screen.getByText("Recommended: Leadership emphasis")).toBeInTheDocument();
    expect(screen.queryByText("Lead narrative")).toBeNull();
    expect(screen.getByText("View full baseline evidence")).toBeInTheDocument();
    expect(screen.getAllByText("Generate Resume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Generate Cover Letter").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Download: DOCX | PDF")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download DOCX" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  });

  it("renders resume preview with stronger hierarchy and preview label after generation", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  summary: "Support leader focused on scalable operations.",
                  competencies: ["Incident Management", "Support Operations"],
                  experience: [
                    {
                      company: "Cat Daddy Games",
                      roleTitle: "Senior Producer",
                      location: "Los Angeles, CA",
                      dateRange: "2020 - Present",
                      bullets: ["Led support operations programs.", "Built escalation workflows."],
                    },
                  ],
                },
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByTestId("resume-preview")).toBeInTheDocument();
    });
    expect(screen.getByText("Preview of tailored resume")).toBeInTheDocument();
    expect(screen.getByText("Alex Candidate")).toBeInTheDocument();
    expect(screen.getByText("Professional Experience")).toBeInTheDocument();
    expect(screen.getByText("Cat Daddy Games")).toBeInTheDocument();
    expect(screen.getByText("Senior Producer | Los Angeles, CA")).toBeInTheDocument();
    expect(screen.getByText("2020 - Present")).toBeInTheDocument();
  });

  it("shows a blocked compliance card without rendering raw JSON payloads", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 78,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume")) {
          return Promise.resolve(
            createResponse({
              status: "compliance_blocked",
              generationStatus: "blocked",
              safeDisplay: {
                title: "Resume blocked by compliance",
                description: "Verification required before this draft can be used.",
                reasons: ["Company reference needs verification"],
              },
              internal: {
                auditId: "audit-raw-123",
                baselineVersionHash: "internal-hash",
                complianceFlags: [{ code: "invented_company" }],
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getAllByText("Resume blocked by compliance").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("audit-raw-123")).toBeNull();
    expect(screen.queryByText(/internal-hash/)).toBeNull();
    expect(screen.queryByText(/\\{\"status\"/)).toBeNull();
  });

  it("enables downloads only after successful generation and keeps blocked documents disabled", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  experience: [
                    {
                      company: "Cat Daddy Games",
                      roleTitle: "Senior Producer",
                      bullets: ["Led support operations programs."],
                    },
                  ],
                },
              },
              safeDisplay: {
                title: "Resume generated successfully",
                description: "Resume ready.",
              },
            }),
          );
        }
        if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "blocked",
              generationStatus: "blocked",
              safeDisplay: {
                title: "Cover letter blocked by compliance",
                description: "Unsupported claims detected.",
                reasons: ["Role or title needs verification"],
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    const sections = screen.getAllByRole("heading", { name: /Generate/i });
    const resumeSection = sections[0]?.closest("section");
    const coverSection = sections[1]?.closest("section");
    if (!resumeSection || !coverSection) {
      throw new Error("Expected resume and cover sections");
    }

    expect(within(resumeSection).queryByRole("button", { name: "Download DOCX" })).toBeNull();
    expect(within(coverSection).queryByRole("button", { name: "Download DOCX" })).toBeNull();

    const resumeGenerateButton = within(resumeSection).getByRole("button", { name: "Generate Resume" });
    await waitFor(() => {
      expect(resumeGenerateButton).toBeEnabled();
    });
    fireEvent.click(resumeGenerateButton);
    await waitFor(() => {
      expect(within(resumeSection).getByText("Downloads are available.")).toBeInTheDocument();
    });
    expect(within(resumeSection).getByRole("button", { name: "Download DOCX" })).toBeEnabled();

    fireEvent.click(within(coverSection).getByRole("button", { name: "Generate Cover Letter" }));
    await waitFor(() => {
      expect(within(coverSection).getAllByText("Cover letter blocked by compliance").length).toBeGreaterThan(0);
    });
    expect(within(coverSection).getByText("Next step")).toBeInTheDocument();
    expect(within(coverSection).getByRole("button", { name: "Download DOCX" })).toBeDisabled();
  });

  it("shows retry UI when cover letter generation fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
          return Promise.reject(new Error("Service unavailable"));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Cover Letter" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Cover Letter" }));

    await waitFor(() => {
      expect(screen.getByText("Cover letter generation failed")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry generation" })).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("supports inline resume editing with save, cancel, export, and regeneration warning", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/") && url.includes("/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 82,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Support leader focused on scalable operations.",
                experience: [
                  {
                    company: "Cat Daddy Games",
                    roleTitle: "Senior Producer",
                    bullets: ["Led support operations programs."],
                  },
                ],
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/export") && init?.method === "POST") {
        return Promise.resolve(createResponse({}, true, 200));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit Resume" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit Resume" }));
    const bulletEditor = await screen.findByLabelText("Resume bullet 1-1");
    fireEvent.change(bulletEditor, { target: { value: "Led support operations across enterprise customers." } });
    expect(screen.getByText("Unsaved edits")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel edits" }));
    expect(screen.queryByLabelText("Resume bullet 1-1")).toBeNull();
    expect(screen.getByText("Led support operations programs.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Resume" }));
    fireEvent.change(await screen.findByLabelText("Resume bullet 1-1"), {
      target: { value: "Led support operations across enterprise customers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edits" }));

    await waitFor(() => {
      expect(screen.getByText("Led support operations across enterprise customers.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Download DOCX" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/resume/export?format=docx",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const exportCall = fetchMock.mock.calls.find(
      ([url, requestInit]) => url === "/api/resume/export?format=docx" && requestInit?.method === "POST",
    );
    const exportBody = JSON.parse(String(exportCall?.[1]?.body)) as Record<string, unknown>;
    expect(exportBody.editedResume).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));
    expect(confirmSpy).toHaveBeenCalledWith("Regenerating will replace your saved edits for this version.");
    confirmSpy.mockRestore();
  });

  it("shows a resume generation error when API returns non-resume payload", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 82,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse(
              {
                error: {
                  code: "RESUME_GENERATION_CONTRACT_MISMATCH",
                  message: "Resume generation returned an unexpected payload shape.",
                },
              },
              false,
              502,
            ),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Additional baseline detail required")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Resume generation returned an unexpected payload shape."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No resume generated yet")).toBeInTheDocument();
  });

  it("reframes insufficient baseline evidence as a guided progression state", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              score: 78,
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse(
              {
                message:
                  "Resume could not be generated because no verified baseline evidence could be assembled into role relevant experience bullets.",
              },
              false,
              400,
            ),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(
        screen.getByText("More detail needed to generate a strong resume"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("You're close - a few more details will unlock a strong resume."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add detail to generate resume" })).toBeInTheDocument();
    expect(screen.getByText("Generate a basic draft anyway")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Generate Resume$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add detail to generate resume" }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/baseline?analysisId=analysis-1&jobId=job-1&baselineId=base-1&baselineVersionId=base-version-1",
    );
    expect(
      screen.queryByText("Resume failed due to system error"),
    ).not.toBeInTheDocument();
  });

  it("allows generation in non-production when promotion artifacts are not ready", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/") && url.includes("/versions")) {
        return Promise.resolve(createResponse([]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse({ score: 82, jobId: "job-1", baselineId: "base-1" }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                experience: [],
                education: [],
              },
            },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getAllByText("Generation prerequisites").length).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/resume",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const postCall = fetchMock.mock.calls.find(
      ([url, requestInit]) => url === "/api/resume" && requestInit?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const requestBody = postCall?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    const parsedBody = JSON.parse(requestBody as string) as Record<string, unknown>;
    expect(parsedBody.baselineVersionId).toBeUndefined();
  });

  it("supports assessmentId query param as a backward-compatible fallback", async () => {
    overrideSearchParams({ assessmentId: "assessment-legacy" });
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/assessment-legacy")) {
        return Promise.resolve(
          createResponse({
            score: 81,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("81.0")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/analysis/fit-assessments/assessment-legacy");
  });
});
