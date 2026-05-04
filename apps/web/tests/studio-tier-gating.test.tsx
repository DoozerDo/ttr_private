import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";

import { overrideSearchParams, setFetchImplementation } from "./setup";

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

function renderStudio(subscriptionTier: "FREE" | "PRO") {
  return render(
    <EntitlementsProvider
      entitlements={{
        id: "u-1",
        email: "test@example.com",
        subscriptionTier,
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
    typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body);
  const response = {
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
    clone: () => response,
  };
  return response;
}

describe("Studio tier gate precedence", () => {
  it("renders a Pro tier gate for cover letters without mixing readiness blocked messaging", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 79 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "missing",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            resume: null,
            coverLetter: null,
          }),
        );
      }
      if (
        init?.method === "POST" &&
        url.includes("/api/cover-letters") &&
        !url.includes("/api/cover-letters/readiness") &&
        !url.includes("/api/cover-letters/export")
      ) {
        return Promise.resolve(
          createResponse(
            {
              errorCode: "TIER_GATED",
              requiredTier: "pro",
              currentTier: "free",
              message: "This feature is available on the Pro plan.",
            },
            false,
            403,
          ),
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
                experience: [],
              },
            },
          }),
        );
      }
      return Promise.resolve(createResponse({}, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio("FREE");

    await waitFor(() => {
      expect(screen.getByTestId("studio-cover-generate-button")).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId("studio-cover-generate-button"));

    const tierGate = await screen.findByTestId("studio-cover-tier-gate");
    expect(tierGate).toHaveTextContent(
      "Cover letter generation requires Pro",
    );
    expect(tierGate).toHaveTextContent(
      "This feature is available on the Pro plan.",
    );
    expect(
      screen.getAllByRole("link", { name: "Upgrade to Pro" }).some((link) => link.getAttribute("href") === "/pricing"),
    ).toBe(true);

    expect(screen.queryByText("Why generation is blocked")).toBeNull();
    expect(
      screen.queryByText((content) =>
        content.startsWith("We can’t generate strong documents yet because key experience isn’t clearly supported."),
      ),
    ).toBeNull();
    expect(screen.queryByText("We couldn't generate a reliable result")).toBeNull();
  });

  it("supports mixed states: resume readiness blocked + cover letter tier gated", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 79 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "ready",
            reasons: [],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (
        init?.method === "POST" &&
        url.includes("/api/resume") &&
        !url.includes("/api/resume/readiness") &&
        !url.includes("/api/resume/export")
      ) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                experience: [{ company: "Acme", roleTitle: "Manager", bullets: ["Led support operations."] }],
              },
            },
          }),
        );
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "missing",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            resume: null,
            coverLetter: null,
          }),
        );
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse(
            {
              errorCode: "TIER_GATED",
              requiredTier: "pro",
              currentTier: "free",
              message: "This feature is available on the Pro plan.",
            },
            false,
            403,
          ),
        );
      }
      return Promise.resolve(createResponse({}, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio("FREE");

    await screen.findByTestId("studio-decision-panel");

    fireEvent.click(await screen.findByTestId("studio-cover-generate-button"));
    expect(await screen.findByTestId("studio-cover-tier-gate")).toBeInTheDocument();
  });

  it("supports mixed states: resume draft_only + cover letter tier gated, without implying evidence unlocks the paywall", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 78 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "personalization_limitation", message: "limited" }],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({ status: "missing" }));
    });
    setFetchImplementation(fetchMock);

    renderStudio("FREE");

    expect(await screen.findByRole("link", { name: "Review fit gaps" })).toBeInTheDocument();
    expect(screen.getByTestId("studio-blocked-message")).toHaveTextContent(
      "We need clearer, verified examples of your experience",
    );
    const actionLinks = screen
      .getAllByRole("link")
      .filter((link) => (link.getAttribute("href") ?? "").includes("/fit-review"));
    expect(actionLinks.length).toBeGreaterThan(0);

    fireEvent.click(await screen.findByTestId("studio-cover-generate-button"));
    expect(await screen.findByTestId("studio-cover-tier-gate")).toHaveTextContent(
      "Cover letter generation requires Pro",
    );
    expect(screen.getByTestId("studio-cover-tier-gate")).toHaveTextContent(
      "This feature is available on the Pro plan.",
    );

    expect(screen.getByRole("button", { name: "Generate draft anyway" })).toBeInTheDocument();

    expect(screen.queryByText("Why generation is blocked")).toBeNull();
    expect(screen.queryByText("Limited output: not ready yet.")).toBeNull();
    expect(screen.queryByText("We couldn't generate a reliable result")).toBeNull();
  });
});
