import { describe, expect, it } from "vitest";

import {
  formatPreview,
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
          salutation: "Dear Hiring Team,",
          opening: "I am excited to apply.",
          bodyParagraphs: ["I have led support operations programs."],
          closingParagraph: "I would welcome the opportunity to discuss this role.",
          signoff: "Sincerely,",
          signatureName: "Test Candidate",
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
});
