import { describe, expect, it } from "vitest";

import {
  buildCoverLetterParagraphs,
  formatPreview,
  getFilenameFromContentDisposition,
  presentCoverLetterGeneration,
  presentResumeGeneration,
} from "@/src/lib/studio/helpers";

describe("studio presenter helpers", () => {
  it("maps blocked resume payloads to a safe presenter model", () => {
    const payload = {
      status: "compliance_blocked",
      generationStatus: "blocked",
      safeDisplay: {
        title: "Resume blocked by compliance",
        description: "Verification required before this draft can be used.",
        reasons: ["Company reference needs verification"],
        cta: { label: "Review compliance in Results", href: "/results" },
      },
      internal: { auditId: "audit-123", baselineVersionHash: "hash-xyz" },
    };

    const presented = presentResumeGeneration(payload);
    expect(presented.status).toBe("blocked");
    expect(presented.hasExportableContent).toBe(false);
    expect(presented.display?.reasons).toEqual(["Company reference needs verification"]);
  });

  it("maps successful cover-letter payloads to exportable presenter state", () => {
    const payload = {
      status: "success",
      generationStatus: "success",
      exports: { docx: true, pdf: true },
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "I am excited to apply.",
            "I have led support operations programs.",
            "I would welcome the opportunity to discuss this role.",
            "Sincerely,",
            "Test Candidate",
          ],
        },
      },
      safeDisplay: {
        title: "Cover letter generated successfully",
        description: "Your draft is ready.",
      },
    };

    const presented = presentCoverLetterGeneration(payload);
    expect(presented.status).toBe("success");
    expect(presented.hasExportableContent).toBe(true);
  });

  it("maps successful resume payloads with typed preview model", () => {
    const payload = {
      status: "success",
      generationStatus: "success",
      exports: { docx: true, pdf: true },
      preview: {
        resume: {
          heading: { name: "Test Candidate", contactLine: "test@example.com" },
          experience: [{ company: "Acme", roleTitle: "Manager", bullets: ["Led support operations."] }],
        },
      },
    };

    const presented = presentResumeGeneration(payload);
    expect(presented.status).toBe("success");
    expect(presented.hasExportableContent).toBe(true);
  });

  it("does not treat section-only resume payloads as exportable success", () => {
    const payload = {
      status: "success",
      generationStatus: "success",
      exportReady: true,
      sections: [{ type: "SUMMARY", content: "fragment content" }],
    };

    const presented = presentResumeGeneration(payload);
    expect(presented.status).toBe("unknown");
    expect(presented.hasExportableContent).toBe(false);
  });

  it("maps resume error payloads to non-exportable error presenter state", () => {
    const payload = {
      status: "error",
      generationStatus: "error",
      exportReady: false,
      safeDisplay: {
        title: "Resume generation failed",
        description: "We could not build a valid resume structure from the available data.",
      },
      gapAnalysis: { criticalGaps: ["Needs stronger leadership examples"] },
    };

    const presented = presentResumeGeneration(payload);
    expect(presented.status).toBe("error");
    expect(presented.hasExportableContent).toBe(false);
    expect(presented.display?.title).toBe("Resume generation failed");
  });

  it("maps no-evidence resume payloads to explicit no-evidence state", () => {
    const payload = {
      status: "no_evidence",
      generationStatus: "error",
      safeDisplay: {
        title: "Additional baseline detail required",
        description:
          "We could not assemble strong role specific bullets from your baseline. You can still generate a draft using your existing verified experience.",
      },
    };

    const presented = presentResumeGeneration(payload);
    expect(presented.status).toBe("error");
    expect(presented.display?.title).toBe("Additional baseline detail required");
  });

  it("does not stringify arbitrary payload objects in preview text", () => {
    const preview = formatPreview({
      internal: {
        auditId: "audit-raw",
        payload: { nested: true },
      },
    });

    expect(preview).toBe("");
    expect(preview).not.toContain("audit-raw");
    expect(preview).not.toContain("{");
  });

  it("does not duplicate salutation when opening already starts with the greeting", () => {
    const payload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "Dear Hiring Team, I am applying for the role.",
            "I have led support operations programs.",
            "I would welcome the opportunity to discuss this role.",
            "Sincerely,",
            "Test Candidate",
          ],
        },
      },
    };

    const paragraphs = buildCoverLetterParagraphs(payload);
    expect(paragraphs[0]).toBe("Dear Hiring Team,");
    expect(paragraphs[1]).toBe("I am applying for the role.");
  });

  it("parses export filenames from content disposition headers", () => {
    expect(
      getFilenameFromContentDisposition("attachment; filename*=UTF-8''resume%20Leadership.docx"),
    ).toBe("resume Leadership.docx");
    expect(getFilenameFromContentDisposition('attachment; filename="cover-letter.pdf"')).toBe(
      "cover-letter.pdf",
    );
  });

  it("renders one closing paragraph and one signoff when structured payload has repeated closing tokens", () => {
    const payload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "I am applying for the role.",
            "I have led support operations programs.",
            "Sincerely,",
            "Test Candidate",
            "Sincerely, Test Candidate",
            "Sincerely,",
          ],
        },
      },
    };

    const paragraphs = buildCoverLetterParagraphs(payload);
    expect(paragraphs.filter((line) => /^dear hiring team[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^sincerely[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^test candidate$/i.test(line))).toHaveLength(1);
  });

  it("renders exactly one sincerely when signoff appears in opening, body, and closing fields", () => {
    const payload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "Dear Hiring Team, I am applying for this role.",
            "I have led support operations programs.",
            "Sincerely,",
            "Sincerely,",
            "Test Candidate",
            "Sincerely, Test Candidate",
          ],
        },
      },
    };

    const paragraphs = buildCoverLetterParagraphs(payload);
    expect(paragraphs.filter((line) => /^dear hiring team[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^sincerely[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^test candidate$/i.test(line))).toHaveLength(1);
  });

  it("does not duplicate closing paragraph when closing field contains embedded signoff and signature", () => {
    const payload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "I am applying for this role.",
            "I have led support operations programs.",
            "I would welcome the opportunity to discuss this role. Sincerely, Test Candidate",
          ],
        },
      },
    };

    const paragraphs = buildCoverLetterParagraphs(payload);
    expect(paragraphs.filter((line) => /^dear hiring team[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^sincerely[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^test candidate$/i.test(line))).toHaveLength(0);
    const contentParagraphs = paragraphs.filter(
      (line) =>
        !/^dear hiring team[,]?$/i.test(line) &&
        !/^sincerely[,]?$/i.test(line) &&
        !/^test candidate$/i.test(line),
    );
    expect(contentParagraphs.length).toBeGreaterThanOrEqual(1);
  });

  it("filters resume-like leakage and bullet markers from cover letter preview", () => {
    const payload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "Employment History",
            "• Led turnaround for support operations.",
            "- Assigned to take over incident queue.",
            "Cat Daddy Games | Seattle | 2020 - 2023",
            "I have led support operations programs.",
            "Sincerely,",
            "Test Candidate",
          ],
        },
      },
    };

    const paragraphs = buildCoverLetterParagraphs(payload);
    expect(paragraphs.filter((line) => /^dear hiring team[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.some((line) => /employment history/i.test(line))).toBe(false);
    expect(paragraphs.some((line) => /^[•*-]\s*/.test(line))).toBe(false);
    expect(paragraphs.some((line) => /\|\s*.*\b(?:19|20)\d{2}\b/.test(line))).toBe(false);
  });

  it("deduplicates greeting and signoff while dropping raw JD or baseline blobs", () => {
    const payload = {
      preview: {
        coverLetter: {
          paragraphs: [
            "Dear Hiring Team,",
            "Dear Hiring Team, I am applying for the role.",
            "Job Description",
            "Support Operations Leader | Acme | 2021 - Present",
            "I have led support operations programs.",
            "Sincerely,",
            "Sincerely,",
            "Test Candidate",
            "Test Candidate",
          ],
        },
      },
    };

    const paragraphs = buildCoverLetterParagraphs(payload);
    expect(paragraphs.filter((line) => /^dear hiring team[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^sincerely[,]?$/i.test(line))).toHaveLength(1);
    expect(paragraphs.filter((line) => /^test candidate$/i.test(line))).toHaveLength(1);
    expect(paragraphs.some((line) => /job description/i.test(line))).toBe(false);
    expect(paragraphs.some((line) => /\|/i.test(line))).toBe(false);
  });

  it("maps warning-only cover letter payloads to personalization-limited messaging", () => {
    const payload = {
      status: "success",
      generationStatus: "success",
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
      compliance_flags: [{ code: "style_warning", severity: "warn", message: "soft warning" }],
    };

    const presented = presentCoverLetterGeneration(payload);
    expect(presented.status).toBe("success");
    expect(presented.display?.description).toContain("Personalization may be limited");
  });
});
