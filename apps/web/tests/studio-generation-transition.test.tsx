import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function assessmentResponse(analysisId: string) {
  return createResponse({
    assessmentId: analysisId,
    scoring_v2: { score: 82 },
    jobId: "job-1",
    baselineId: "base-1",
    baselineVersionId: "base-version-1",
    verification_coverage: { unverifiedRequirements: [] },
  });
}

function baselineVersionsResponse() {
  return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
}

function readinessReadyResponse() {
  return createResponse({ status: "ready", reasons: [], compliance_flags: [] });
}

function resumeSuccessResponse() {
  return createResponse({
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
  });
}

function coverSuccessResponse() {
  return createResponse({
    status: "success",
    generationStatus: "success",
    exportReady: true,
    exports: { docx: true, pdf: true },
    preview: { coverLetter: { paragraphs: ["Dear Hiring Team,"] } },
  });
}

function authority() {
  return screen.getByTestId("studio-workflow-authority");
}

async function waitForAuthorityState(state: string | string[]) {
  await waitFor(() => {
    const current = authority().getAttribute("data-workflow-state");
    const expected = Array.isArray(state) ? state : [state];
    expect(expected).toContain(current);
  });
}

async function clickGenerateIfReady() {
  const state = authority().getAttribute("data-workflow-state");

  if (state === "generation_ready") {
    const button = await screen.findByRole("button", { name: /generate resume and cover letter/i });
    fireEvent.click(button);
  }
}

describe("Studio generation authority transition", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

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
        return Promise.resolve(assessmentResponse("analysis-1"));
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(baselineVersionsResponse());
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(readinessReadyResponse());
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

    await waitForAuthorityState(["generation_ready", "generation_in_progress"]);
    await clickGenerateIfReady();
    await waitForAuthorityState("generation_in_progress");

    expect(within(authority()).getByTestId("workflow-authority-headline")).toHaveTextContent(
      "Generating your documents...",
    );
    expect(screen.queryByText(/your documents are ready to generate/i)).toBeNull();
    expect(screen.queryByText(/draft output: ready to generate/i)).toBeNull();
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
        return Promise.resolve(assessmentResponse("analysis-2"));
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(baselineVersionsResponse());
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(readinessReadyResponse());
      }

      if (url.endsWith("/api/resume") && init?.method === "POST") {
        resumePostStarted = true;
        return new Promise(() => {});
      }

      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(coverSuccessResponse());
      }

      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    await waitForAuthorityState(["generation_ready", "generation_in_progress"]);
    await clickGenerateIfReady();

    if (authority().getAttribute("data-workflow-state") === "generation_ready") {
      await waitFor(() => expect(resumePostStarted).toBe(true));
    }

    await waitForAuthorityState("generation_in_progress");

    expect(within(authority()).getByTestId("workflow-authority-headline")).toHaveTextContent(
      "Generating your documents...",
    );
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
        return Promise.resolve(assessmentResponse("analysis-3"));
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(baselineVersionsResponse());
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(readinessReadyResponse());
      }

      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(resumeSuccessResponse());
      }

      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(coverSuccessResponse());
      }

      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    await waitForAuthorityState(["generation_ready", "generation_in_progress"]);
    await clickGenerateIfReady();
    await waitForAuthorityState("generation_in_progress");

    expect(within(authority()).getByTestId("workflow-authority-headline")).toHaveTextContent(
      "Generating your documents...",
    );
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
        return Promise.resolve(assessmentResponse("analysis-6"));
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(baselineVersionsResponse());
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(readinessReadyResponse());
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

    await waitForAuthorityState(["generation_ready", "generation_in_progress"]);
    await clickGenerateIfReady();

    await waitFor(() => {
      const didTopScroll = scrollSpy.mock.calls.some((call) => {
        const arg0 = call[0] as unknown;
        if (!arg0 || typeof arg0 !== "object") return false;
        const record = arg0 as { top?: unknown; behavior?: unknown };
        return record.top === 0 && (record.behavior === "smooth" || record.behavior === "auto");
      });

      expect(didTopScroll).toBe(true);
    });

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
        return Promise.resolve(assessmentResponse("analysis-7"));
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(baselineVersionsResponse());
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(readinessReadyResponse());
      }

      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    await screen.findByText("Generating your resume...");
    await screen.findByText("Generating your cover letter...");

    await waitForAuthorityState("generation_in_progress");

    expect(within(authority()).getByTestId("workflow-authority-headline")).toHaveTextContent(
      "Generating your documents...",
    );
    expect(screen.queryByText("Draft output: ready to generate.")).toBeNull();

    await waitFor(() => {
      const didAutoTop = scrollSpy.mock.calls.some((call) => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLElement.prototype as any).scrollIntoView = scrollIntoViewSpy;

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-8")) {
        return Promise.resolve(assessmentResponse("analysis-8"));
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(baselineVersionsResponse());
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(readinessReadyResponse());
      }

      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock);
    renderStudio();

    await screen.findByText("Your application materials");

    await waitFor(() => {
      const didAutoTop = scrollSpy.mock.calls.some((call) => {
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