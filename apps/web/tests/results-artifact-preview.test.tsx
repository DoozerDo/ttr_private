import { act, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results artifact preview contract", () => {
  it("renders a bounded cover letter preview (not a raw full-body dump) after generation completes", async () => {
    overrideSearchParams({ assessmentId: "analysis-1" });

    const coverParagraphs = [
      "P1: Greeting.",
      "P2: Value proposition.",
      "P3: Evidence paragraph.",
      "P4: Role alignment paragraph.",
      "P5: This paragraph must not be rendered in Results preview by default.",
      "P6: Additional paragraph.",
    ];

    let artifactsCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return jsonResponse({
          assessmentId: "analysis-1",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 75,
          scoring_v2: { score: 75 },
          strengths: ["Incident management"],
          verification_coverage: {
            totalClaims: 1,
            verifiedClaims: 1,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Incident management"],
            unverifiedRequirements: [],
          },
        });
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({ status: "ready", blocked: false, reasons: [] });
      }

      if (url.includes("/api/studio/artifacts")) {
        artifactsCalls += 1;
        if (artifactsCalls < 2) {
          return jsonResponse({
            resume: { status: "missing", responseBody: null },
            coverLetter: { status: "missing", responseBody: null },
          });
        }
        return jsonResponse({
          resume: {
            status: "completed",
            responseBody: {
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
                      company: "Acme",
                      roleTitle: "Support Lead",
                      location: "Remote",
                      dateRange: "2022 - Present",
                      bullets: ["Built support processes."],
                    },
                  ],
                  education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                  competencies: ["Customer strategy"],
                },
              },
            },
          },
          coverLetter: {
            status: "completed",
            responseBody: {
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                coverLetter: {
                  paragraphs: coverParagraphs,
                },
              },
            },
          },
        });
      }

      if (method === "POST" && url.endsWith("/api/resume")) {
        return jsonResponse({
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
                  company: "Acme",
                  roleTitle: "Support Lead",
                  location: "Remote",
                  dateRange: "2022 - Present",
                  bullets: ["Built support processes."],
                },
              ],
              education: [{ degree: "BA", institution: "State University", location: "Remote" }],
              competencies: ["Customer strategy"],
            },
          },
        });
      }

      if (method === "POST" && url.endsWith("/api/cover-letters")) {
        return jsonResponse({
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            coverLetter: {
              paragraphs: coverParagraphs,
            },
          },
        });
      }

      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    // Trigger generation.
    await screen.findByTestId("results-hero-primary-cta");
    await act(async () => {
      screen.getByTestId("results-hero-primary-cta").click();
    });

    // Wait for generated documents section to appear (requires artifacts poll to flip to completed).
    await waitFor(() => {
      expect(screen.getByTestId("results-generated-documents")).toBeInTheDocument();
    });

    const preview = await screen.findByTestId("results-cover-letter-preview-body");
    expect(preview.className).toContain("max-h-64");
    expect(preview.className).toContain("overflow-auto");

    // Ensure preview is truncated (does not dump full body into Results).
    expect(preview).toHaveTextContent(coverParagraphs[0]);
    expect(screen.queryByText(coverParagraphs[4])).toBeNull();
  });
});
