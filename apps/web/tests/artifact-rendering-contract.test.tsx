import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import type { ResumeModel } from "@/lib/resumeModel";
import { ResumePreview } from "@/app/(app)/studio/ResumePreview";
import { truncateForPreview } from "@/lib/previewTruncation";
import { getResultsCoverLetterTeaser, getResultsResumeTeaser } from "@/lib/resultsArtifactPreview";
import { ResultsCoverLetterTeaser, ResultsResumeTeaser } from "@/components/results/ResultsArtifactTeasers";
import { ResultsDocumentsTeaserSection } from "@/components/results/ResultsDocumentsTeaserSection";

describe("Artifact rendering contract", () => {
  it("Results documents section remains teaser-only across branch contexts (no Studio-grade rendering)", () => {
    const resumePayload = {
      preview: {
        resume: {
          heading: { name: "Candidate", contactLine: "c@example.com" },
          summary: "SUMMARY_SHOULD_BE_SNIPPET " + "s".repeat(5000),
          experience: [
            {
              company: "Company 1",
              roleTitle: "Role 1",
              location: "Remote",
              dateRange: "2022 - 2024",
              bullets: [
                "BULLET_1_OK",
                "BULLET_2_OK",
                "BULLET_3_OK",
                "BULLET_4_SHOULD_NOT_RENDER",
                "BULLET_5_SHOULD_NOT_RENDER",
              ],
            },
            {
              company: "Company 2 SHOULD_NOT_RENDER",
              roleTitle: "Role 2 SHOULD_NOT_RENDER",
              bullets: ["ROLE2_BULLET_SHOULD_NOT_RENDER"],
            },
          ],
        } satisfies ResumeModel,
      },
    };

    const coverPayload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "BODY_P1_OK " + "x".repeat(2000),
            "BODY_P2_SHOULD_NOT_RENDER",
            "Sincerely,",
          ],
        },
      },
    };

    const contexts = [
      { confidence: "HIGH", generationPhase: "generated", pairStatus: "generated" },
      { confidence: "LOW", generationPhase: "partial", pairStatus: "generated" },
      { confidence: "LOW", generationPhase: "failed", pairStatus: "generated" },
      { confidence: "MEDIUM", generationPhase: "generated", pairStatus: "generated" },
    ];

    for (const ctx of contexts) {
      const { container, unmount } = render(
        <ResultsDocumentsTeaserSection
          resumePayload={resumePayload}
          coverLetterPayload={coverPayload}
          studioHref="/studio"
          confidence={ctx.confidence}
          generationPhase={ctx.generationPhase}
          pairStatus={ctx.pairStatus}
        />,
      );

      expect(container.querySelector("[data-testid=\"results-documents-teaser-section\"]")).not.toBeNull();
      expect(container.querySelector("[data-testid=\"results-resume-preview-truncated\"]")).not.toBeNull();
      expect(container.querySelector("[data-testid=\"results-cover-letter-preview-truncated\"]")).not.toBeNull();
      expect(container.querySelector("a[href=\"/studio\"]")).not.toBeNull();

      // Resume: 1 role + max 3 bullets.
      expect(container.textContent).toContain("Company 1");
      expect(container.textContent).toContain("Role 1");
      expect(container.textContent).toContain("BULLET_1_OK");
      expect(container.textContent).toContain("BULLET_2_OK");
      expect(container.textContent).toContain("BULLET_3_OK");
      expect(container.textContent).not.toContain("BULLET_4_SHOULD_NOT_RENDER");
      expect(container.textContent).not.toContain("Company 2 SHOULD_NOT_RENDER");
      expect(container.textContent).not.toContain("ROLE2_BULLET_SHOULD_NOT_RENDER");

      // Cover letter: first body paragraph only.
      expect(container.textContent).toContain("BODY_P1_OK");
      expect(container.textContent).not.toContain("BODY_P2_SHOULD_NOT_RENDER");

      // No nested scroll traps in Results teaser rendering.
      const scrollRegions = Array.from(container.querySelectorAll(".overflow-auto"));
      expect(scrollRegions.length).toBeLessThanOrEqual(1);
      expect(scrollRegions.some((region) => region.querySelector(".overflow-auto"))).toBe(false);

      unmount();
    }
  });

  it("Results resume teaser renders exactly 1 role and at most 3 bullets", () => {
    const payload = {
      preview: {
        resume: {
          heading: { name: "Candidate", contactLine: "c@example.com" },
          summary: "S".repeat(2000),
          competencies: Array.from({ length: 30 }, (_, i) => `C${i}`),
          experience: Array.from({ length: 5 }, (_, i) => ({
            company: `Company ${i}`,
            roleTitle: `Role ${i}`,
            bullets: Array.from({ length: 10 }, (_, j) => `B${i}.${j} ${"x".repeat(600)}`),
          })),
          education: Array.from({ length: 5 }, (_, i) => ({ degree: `D${i}`, institution: `U${i}` })),
        } satisfies ResumeModel,
      },
    };

    const teaser = getResultsResumeTeaser(payload);
    expect(teaser.renderer).toBe("role_teaser");
    if (teaser.renderer !== "role_teaser") {
      throw new Error("Expected role_teaser renderer");
    }
    expect(teaser.role.bullets.length).toBeLessThanOrEqual(3);

    const { container } = render(<ResultsResumeTeaser teaser={teaser} studioHref="/studio" />);
    expect(container.querySelectorAll("[data-testid=\"results-resume-teaser-role\"]").length).toBe(1);
    expect(container.querySelectorAll("li").length).toBeLessThanOrEqual(3);
    expect(container.textContent).toContain("Preview truncated.");
    expect(container.textContent).toContain("Open Studio");
    const scrollRegions = Array.from(container.querySelectorAll(".overflow-auto"));
    expect(scrollRegions.length).toBeLessThanOrEqual(1);
    expect(scrollRegions.some((region) => region.querySelector(".overflow-auto"))).toBe(false);
  });

  it("Results cover letter teaser renders only the first paragraph", () => {
    const payload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "First paragraph. " + "x".repeat(2000),
            "Second paragraph.",
            "Third paragraph.",
          ],
        },
      },
    };

    const teaser = getResultsCoverLetterTeaser(payload);
    expect(teaser.renderer).toBe("paragraph_teaser");
    if (teaser.renderer === "none") {
      throw new Error("Expected cover letter teaser");
    }

    const { container } = render(<ResultsCoverLetterTeaser teaser={teaser} studioHref="/studio" />);
    expect(container.querySelectorAll("[data-testid=\"results-cover-letter-preview-body\"]").length).toBe(1);
    expect(container.textContent).toContain("First paragraph.");
    expect(container.textContent).not.toContain("Second paragraph.");
    expect(container.textContent).toContain("Preview truncated.");
    const scrollRegions = Array.from(container.querySelectorAll(".overflow-auto"));
    expect(scrollRegions.length).toBeLessThanOrEqual(1);
    expect(scrollRegions.some((region) => region.querySelector(".overflow-auto"))).toBe(false);
  });

  it("truncates ResumePreview fallbackText rendering (no full raw body dumps)", () => {
    const huge = "a".repeat(6000);
    const { container } = render(<ResumePreview fallbackText={huge} />);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent?.length).toBe(4000);
    expect(container.textContent).toContain("Preview truncated.");
  });

  it("truncates previews by both chars and lines", () => {
    const input = ["line1", "line2", "line3", "line4"].join("\n");
    const truncated = truncateForPreview(input + "X".repeat(2000), { maxChars: 20, maxLines: 2 });
    expect(truncated.truncated).toBe(true);
    expect(truncated.text.split("\n").length).toBe(2);
    expect(truncated.text.length).toBeLessThanOrEqual(20);
  });
});
