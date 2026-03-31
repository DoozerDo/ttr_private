import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import CoverLettersPage from "@/app/(app)/cover-letters/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { LAST_ANALYSIS_STORAGE_KEY } from "@/app/(app)/lib/session";
import { setFetchImplementation } from "@/tests/setup";

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
        if (name.toLowerCase() === "content-disposition") {
          return `attachment; filename*=UTF-8''cover-letter.docx`;
        }
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/octet-stream" })),
  };
}

describe("Cover letters page export contract", () => {
  beforeEach(() => {
    const storage = {
      getItem: vi.fn((key: string) => {
        if (key === LAST_ANALYSIS_STORAGE_KEY) {
          return JSON.stringify({
            savedAt: "2026-03-31T10:00:00.000Z",
            analysis: {
              score: 84,
              summary: "Verified evidence generated a cover letter draft.",
              verdict: "ready",
              jobId: "job-1",
              baselineId: "base-1",
            },
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            jobTitle: "Director of Support",
            company: "Acme",
            jobSource: { type: "saved" },
            fitScore: 84,
            summary: "Verified evidence generated a cover letter draft.",
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
          summary: "Verified evidence generated a cover letter draft.",
          verdict: "ready",
          jobId: "job-1",
          baselineId: "base-1",
        },
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        jobId: "job-1",
        jobTitle: "Director of Support",
        company: "Acme",
        jobSource: { type: "saved" },
        fitScore: 84,
        summary: "Verified evidence generated a cover letter draft.",
        verdict: "ready",
      }),
    );
  });

  it("keeps trust UI and leaked preview text out of the exported cover-letter payload", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
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
                  "Generated from verified evidence",
                  "Verified baseline used. Aligned to this role. Unsupported claims remain blocked.",
                  "I have led support operations programs.",
                  "Sincerely,",
                  "Alex Candidate",
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

    await waitFor(() => expect(screen.getByRole("button", { name: "Download DOCX" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate draft cover letter" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/cover-letters"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Download DOCX" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/cover-letters/export?format=docx"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    const exportCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" && url.includes("/api/cover-letters/export?format=docx") && init?.method === "POST",
    );
    expect(exportCall).toBeTruthy();
    const body = JSON.parse((exportCall?.[1]?.body as string) ?? "{}");
    expect(JSON.stringify(body)).not.toContain("Generated from verified evidence");
    expect(JSON.stringify(body)).not.toContain("Verified baseline used");
    expect(JSON.stringify(body)).toContain('"documentType":"COVER_LETTER"');
    expect(JSON.stringify(body)).toContain('"jobId":"job-1"');
    expect(JSON.stringify(body)).toContain('"baselineId":"base-1"');
  });
});
