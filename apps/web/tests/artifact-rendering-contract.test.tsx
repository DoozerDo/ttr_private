import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import type { ResumeModel } from "@/lib/resumeModel";
import {
  RESULTS_RESUME_PREVIEW_LIMITS,
  ResumePreview,
  sliceResumeModelForPreview,
} from "@/app/(app)/studio/ResumePreview";
import { truncateForPreview } from "@/lib/previewTruncation";
import { selectResultsResumePreview } from "@/lib/resultsArtifactPreview";

describe("Artifact rendering contract", () => {
  it("bounds resume preview slices (experiences, bullets, and bullet length)", () => {
    const model: ResumeModel = {
      heading: {
        name: "Candidate Name",
        contactLine: "candidate@example.com | (555) 555-5555 | https://example.com",
      },
      summary: "S".repeat(2000),
      competencies: Array.from({ length: 40 }, (_, i) => `Competency ${i + 1}`),
      experience: Array.from({ length: 4 }, (_, i) => ({
        company: `Company ${i + 1}`,
        roleTitle: `Role ${i + 1}`,
        location: "Remote",
        dateRange: "2020 - 2024",
        bullets: Array.from({ length: 8 }, (_, j) => `Bullet ${i + 1}.${j + 1} ${"x".repeat(600)}`),
      })),
      education: [
        { degree: "B.S.", institution: "University", location: "CA" },
        { degree: "M.S.", institution: "University", location: "CA" },
        { degree: "Ph.D.", institution: "University", location: "CA" },
      ],
    };

    const sliced = sliceResumeModelForPreview(model, RESULTS_RESUME_PREVIEW_LIMITS);

    expect(sliced.truncated).toBe(true);
    expect(sliced.model.summary?.length).toBeLessThanOrEqual(RESULTS_RESUME_PREVIEW_LIMITS.maxSummaryChars);
    expect((sliced.model.competencies ?? []).length).toBeLessThanOrEqual(RESULTS_RESUME_PREVIEW_LIMITS.maxCompetencies);
    expect((sliced.model.experience ?? []).length).toBeLessThanOrEqual(RESULTS_RESUME_PREVIEW_LIMITS.maxExperiences);

    for (const entry of sliced.model.experience ?? []) {
      expect((entry.bullets ?? []).length).toBeLessThanOrEqual(RESULTS_RESUME_PREVIEW_LIMITS.maxBulletsPerExperience);
      for (const bullet of entry.bullets ?? []) {
        expect(bullet.length).toBeLessThanOrEqual(RESULTS_RESUME_PREVIEW_LIMITS.maxBulletChars);
      }
    }

    expect((sliced.model.education ?? []).length).toBeLessThanOrEqual(RESULTS_RESUME_PREVIEW_LIMITS.maxEducationEntries);
  });

  it("selects a bounded structured resume preview for Results (no full dumps)", () => {
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

    const selected = selectResultsResumePreview(payload);
    expect(selected.renderer).toBe("bounded_structured_preview");
    expect(selected.truncated).toBe(true);
    expect((selected.previewModel.experience ?? []).length).toBeLessThanOrEqual(RESULTS_RESUME_PREVIEW_LIMITS.maxExperiences);
    expect(((selected.previewModel.experience ?? [])[0]?.bullets ?? []).length).toBeLessThanOrEqual(
      RESULTS_RESUME_PREVIEW_LIMITS.maxBulletsPerExperience,
    );
  });

  it("selects a bounded text resume preview for Results when model is absent", () => {
    const payload = { text: "line\n".repeat(500) + "X".repeat(5000) };
    const selected = selectResultsResumePreview(payload);
    expect(selected.renderer).toBe("bounded_text_preview");
    expect(selected.previewText.length).toBeLessThanOrEqual(1200);
    expect(selected.truncated).toBe(true);
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
