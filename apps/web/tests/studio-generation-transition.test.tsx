import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { buildStudioArtifactSingleFlightKey } from "@/lib/studioArtifactSingleFlight";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

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

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500, textOverride?: string) {
  const stringBody =
    textOverride ?? (typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body));
  return {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
}

describe("Studio generation authority transition", () => {
  it("A. generation_ready -> generation starts: switches immediately to generation_in_progress and removes ready copy", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if ((url.endsWith("/api/resume") && init?.method === "POST") || (url.endsWith("/api/cover-letters") && init?.method === "POST")) {
        // Keep requests in-flight so we can assert immediate in-progress authority.
        return new Promise(() => {});
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      const hasShell = Boolean(screen.queryByTestId("studio-generation-ready-shell"));
      const hasAuthority = Boolean(screen.queryByTestId("studio-workflow-authority"));
      expect(hasShell || hasAuthority).toBe(true);
    });

    const shell = screen.queryByTestId("studio-generation-ready-shell");
    if (shell) {
      expect(screen.getByText(/your documents are ready to generate/i)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("studio-generation-ready-primary"));
    }

    await screen.findByTestId("studio-workflow-authority");
    expect(
      within(screen.getByTestId("studio-workflow-authority")).getByTestId("workflow-authority-headline"),
    ).toHaveTextContent("Generating your documents...");
    expect(screen.queryByText(/your documents are ready to generate/i)).toBeNull();
    expect(screen.queryByText(/ready to generate/i)).toBeNull();
    expect(screen.queryByText(/preparing your documents/i)).toBeNull();
  });

  it("B. partial generating (one artifact started) still resolves pair authority to generation_in_progress", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-2",
    });

    let resumePostStarted = false;

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-2",
            scoring_v2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        resumePostStarted = true;
        return new Promise(() => {});
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Dear Hiring Team,"] } },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    const generateResume = await screen.findByRole("button", { name: /generate resume/i });
    fireEvent.click(generateResume);

    await waitFor(() => expect(resumePostStarted).toBe(true));
    await screen.findByTestId("studio-workflow-authority");
    expect(
      within(screen.getByTestId("studio-workflow-authority")).getByTestId("workflow-authority-headline"),
    ).toHaveTextContent("Generating your documents...");
  });

  it("C. generation completes and transitions cleanly to documents_ready", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-3",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-3")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-3",
            scoring_v2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
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
                experience: [],
              },
            },
          }),
        );
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Dear Hiring Team,"] } },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      const hasShell = Boolean(screen.queryByTestId("studio-generation-ready-shell"));
      const hasAuthority = Boolean(screen.queryByTestId("studio-workflow-authority"));
      expect(hasShell || hasAuthority).toBe(true);
    });

    const shell = screen.queryByTestId("studio-generation-ready-shell");
    if (shell) {
      fireEvent.click(screen.getByTestId("studio-generation-ready-primary"));
    } else {
      // Fall back to triggering generation via artifact CTAs when the shell isn't present.
      const resumeButton = screen.queryByRole("button", { name: /generate resume/i });
      if (resumeButton) fireEvent.click(resumeButton);
      const coverButton = screen.queryByRole("button", { name: /generate cover/i });
      if (coverButton) fireEvent.click(coverButton);
    }

    await screen.findByTestId("studio-workflow-authority");
    await waitFor(() => {
      expect(
        within(screen.getByTestId("studio-workflow-authority")).getByTestId("workflow-authority-headline"),
      ).toHaveTextContent("Your tailored documents are ready.");
    });
  });

  it("D. generation start scrolls to authority (top)", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-6",
    });

    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-6")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-6",
            scoring_v2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (
        (url.endsWith("/api/resume") && init?.method === "POST") ||
        (url.endsWith("/api/cover-letters") && init?.method === "POST")
      ) {
        return new Promise(() => {});
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      const hasShell = Boolean(screen.queryByTestId("studio-generation-ready-shell"));
      const hasAuthority = Boolean(screen.queryByTestId("studio-workflow-authority"));
      expect(hasShell || hasAuthority).toBe(true);
    });

    const shell = screen.queryByTestId("studio-generation-ready-shell");
    if (shell) {
      fireEvent.click(screen.getByTestId("studio-generation-ready-primary"));

      await waitFor(() => {
        const calls = scrollSpy.mock.calls;
        const didSmoothTop = calls.some((call) => {
          const arg0 = call[0] as unknown;
          if (!arg0 || typeof arg0 !== "object") return false;
          const record = arg0 as { top?: unknown; behavior?: unknown };
          return record.top === 0 && record.behavior === "smooth";
        });
        expect(didSmoothTop).toBe(true);
      });
    } else {
      // Some Studio entry modes auto-start (or immediately show) generation without a shell click.
      await screen.findByTestId("studio-workflow-authority");
      expect(
        within(screen.getByTestId("studio-workflow-authority")).getByTestId("workflow-authority-headline"),
      ).toHaveTextContent("Generating your documents...");

      await waitFor(() => {
        const calls = scrollSpy.mock.calls;
        const didAutoTop = calls.some((call) => {
          const arg0 = call[0] as unknown;
          if (!arg0 || typeof arg0 !== "object") return false;
          const record = arg0 as { top?: unknown; behavior?: unknown };
          return record.top === 0 && record.behavior === "auto";
        });
        expect(didAutoTop).toBe(true);
      });
    }

    scrollSpy.mockRestore();
  });

  it("E. visible generation (single-flight locks) promotes authority and Studio route entry scrolls to top (auto)", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-7",
    });

    const resumeKey = buildStudioArtifactSingleFlightKey({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-7",
      artifactType: "resume",
    });
    const coverKey = buildStudioArtifactSingleFlightKey({
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-7",
      artifactType: "cover_letter",
    });
    expect(resumeKey).toBeTruthy();
    expect(coverKey).toBeTruthy();
    window.sessionStorage.setItem(
      resumeKey!,
      JSON.stringify({ requestId: "req-resume", acquiredAt: Date.now() }),
    );
    window.sessionStorage.setItem(
      coverKey!,
      JSON.stringify({ requestId: "req-cover", acquiredAt: Date.now() }),
    );

    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-7")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-7",
            scoring_v2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByText("Generating your resume...");
    await screen.findByText("Generating your cover letter...");

    await screen.findByTestId("studio-workflow-authority");
    await waitFor(() => {
      expect(
        within(screen.getByTestId("studio-workflow-authority")).getByTestId("workflow-authority-headline"),
      ).toHaveTextContent("Generating your documents...");
    });
    expect(screen.queryByText("Draft output: ready to generate.")).toBeNull();

    await waitFor(() => {
      const calls = scrollSpy.mock.calls;
      const didAutoTop = calls.some((call) => {
        const arg0 = call[0] as unknown;
        if (!arg0 || typeof arg0 !== "object") return false;
        const record = arg0 as { top?: unknown; behavior?: unknown };
        return record.top === 0 && record.behavior === "auto";
      });
      expect(didAutoTop).toBe(true);
    });

    for (const call of scrollSpy.mock.calls) {
      const arg0 = call[0] as unknown;
      if (!arg0 || typeof arg0 !== "object") continue;
      const record = arg0 as { top?: unknown };
      // Fail closed: nothing should scroll the viewport to a lower section during authority entry.
      expect(record.top).toBe(0);
    }

    scrollSpy.mockRestore();
  });

  it("F. Studio hydration does not scroll into the materials section (authority wins on route entry)", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-8",
    });

    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewSpy = vi.fn();
    // JSDOM doesn't implement layout/scrolling; we only care about whether Studio *tries* to scroll the section.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLElement.prototype as any).scrollIntoView = scrollIntoViewSpy;

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-8")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-8",
            scoring_v2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    // Ensure the materials section is present so any accidental scrollIntoView would have a target.
    await screen.findByText("Your application materials");

    await waitFor(() => {
      const calls = scrollSpy.mock.calls;
      const didAutoTop = calls.some((call) => {
        const arg0 = call[0] as unknown;
        if (!arg0 || typeof arg0 !== "object") return false;
        const record = arg0 as { top?: unknown; behavior?: unknown };
        return record.top === 0 && record.behavior === "auto";
      });
      expect(didAutoTop).toBe(true);
    });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    scrollSpy.mockRestore();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });
});
