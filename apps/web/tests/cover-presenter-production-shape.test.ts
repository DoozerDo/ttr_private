import { describe, expect, it } from "vitest";

import { presentCoverLetterGeneration } from "@/src/lib/studio/helpers";

describe("cover letter presenter (production response shapes)", () => {
  it("treats top-level cover success with content/preview as usable", () => {
    const result = presentCoverLetterGeneration({
      id: "cover-1",
      status: "success",
      generationStatus: "success",
      exportReady: true,
      content: "Dear Hiring Team,\n\nBody paragraph.\n\nSincerely,\nCore Loop Candidate",
      preview: {
        coverLetter: {
          salutation: "Dear Hiring Team,",
          bodyParagraphs: ["Body paragraph."],
          closingParagraph: "Sincerely,",
        },
      },
      exports: { docx: true, pdf: true },
      display: { title: "Cover letter generated successfully", description: "Ready", reasons: [] },
      safeDisplay: { title: "Cover letter generated successfully", description: "Ready", reasons: [] },
    });

    expect(result.status).toBe("success");
    expect(result.failure).toBeNull();
  });

  it("treats wrapped payload cover success with content as usable", () => {
    const result = presentCoverLetterGeneration({
      payload: {
        status: "success",
        generationStatus: "success",
        exportReady: true,
        content: "Dear Hiring Team,\n\nBody paragraph.\n\nSincerely,\nCore Loop Candidate",
      },
    });

    expect(result.status).toBe("success");
  });
});

