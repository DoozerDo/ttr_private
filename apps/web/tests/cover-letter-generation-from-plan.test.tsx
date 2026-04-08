import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import CoverLettersPage from "@/app/(app)/cover-letters/page";
import { LAST_ANALYSIS_STORAGE_KEY } from "@/app/(app)/lib/session";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "./setup";

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [
    {
      id: "job-1",
      company: "Acme",
      title: "Director of Support",
      rawDescription:
        "Lead support operations, workflow design, and cross-functional coordination for a SaaS platform.",
      normalizedRequirements: [
        "Own process and workflow improvements.",
        "Partner with product and engineering.",
      ],
      normalizedResponsibilities: [
        "Lead support operations programs.",
        "Coordinate service delivery across teams.",
      ],
      archivedAt: null,
      isArchived: false,
    },
  ]),
}));

function renderPage() {
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
      <CoverLettersPage />
    </EntitlementsProvider>,
  );
}

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody =
    typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body);
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
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/octet-stream" })),
  };
}

describe("cover letter generation from a shared strategy plan", () => {
  beforeEach(() => {
    overrideSearchParams({});
    const storage = {
      getItem: vi.fn((key: string) => {
        if (key === LAST_ANALYSIS_STORAGE_KEY) {
          return JSON.stringify({
            savedAt: "2026-03-31T10:00:00.000Z",
            analysis: {
              score: 84,
              summary: "Strong fit for support operations leadership.",
              verdict: "ready",
              jobId: "job-1",
              baselineId: "base-1",
              strengths: ["Support operations rigor", "Cross-functional leadership"],
              gaps: [],
              recommendedActions: [],
            },
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            jobTitle: "Director of Support",
            company: "Acme",
            jobSource: { type: "saved" },
            fitScore: 84,
            summary: "Strong fit for support operations leadership.",
            verdict: "ready",
          });
        }
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 1,
    };
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
    storage.setItem(
      LAST_ANALYSIS_STORAGE_KEY,
      JSON.stringify({
        savedAt: "2026-03-31T10:00:00.000Z",
        analysis: {
          score: 84,
          summary: "Strong fit for support operations leadership.",
          verdict: "ready",
          jobId: "job-1",
          baselineId: "base-1",
          strengths: ["Support operations rigor", "Cross-functional leadership"],
          gaps: [],
          recommendedActions: [],
        },
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        jobId: "job-1",
        jobTitle: "Director of Support",
        company: "Acme",
        jobSource: { type: "saved" },
        fitScore: 84,
        summary: "Strong fit for support operations leadership.",
        verdict: "ready",
      }),
    );
  });

  it("sends the shared document strategy plan into cover-letter generation", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1")) {
        return Promise.resolve(
          createResponse({
            id: "base-1",
            originalFilename: "Leadership Resume",
            version: 1,
            sections: [
              {
                id: "section-1",
                title: "Support Operations",
                sectionType: "EXPERIENCE",
                content:
                  "Led support operations programs, improved workflows, and partnered with engineering on service delivery.",
              },
            ],
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
            preview: {
              coverLetter: {
                paragraphs: [
                  "Dear Hiring Team,",
                  "I am applying for this role.",
                  "I have led support operations programs.",
                  "Sincerely,",
                  "Test Candidate",
                ],
              },
            },
          }),
        );
      }
      if (url.includes("/api/cover-letters/export?format=docx") && init?.method === "POST") {
        return Promise.resolve(createResponse({}));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    renderPage();

    await screen.findByTestId("studio-document-plan-summary");
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate draft cover letter" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate draft cover letter" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/cover-letters"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    const generateCall = fetchMock.mock.calls.find(
      ([url, init]) => typeof url === "string" && url.endsWith("/api/cover-letters") && init?.method === "POST",
    );
    expect(generateCall).toBeTruthy();
    const body = JSON.parse((generateCall?.[1]?.body as string) ?? "{}");
    expect(body.documentStrategyPlan.positioningFrame).toBe("Service delivery and incident operations leader");
    expect(body.documentStrategyPlan.selectedEvidence.length).toBeGreaterThan(0);
    expect(body.documentStrategyPlan.coverLetterThemes.length).toBeGreaterThan(0);
    expect(body.documentStrategyPlan.qualityPass.coverLetterDelta.length).toBeGreaterThan(0);
  });
});
