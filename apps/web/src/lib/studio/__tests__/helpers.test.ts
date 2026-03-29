import { describe, expect, it } from "vitest";
import {
  presentResumeGeneration,
  presentCoverLetterGeneration,
} from "../helpers";

describe("studio artifact failure presentation", () => {
  it("renders unsupported_input as intentional guidance for resume generation", () => {
    const result = presentResumeGeneration({
      response: {
        code: "unsupported_input",
        category: "unsupported_input",
        message: "Resume could not be generated because verified content was insufficient.",
        detail: "The current resume input needs clearer bullet or section structure before generating.",
        retryable: false,
        userAction: {
          title: "Add more bullet-style accomplishments",
          description: "The current resume input needs clearer bullet or section structure before generating.",
        },
        diagnostics: {
          unsupportedEnvelope: "resume_structure_empty",
          missingRequirements: ["Add bullet-style accomplishments"],
        },
      },
    });

    expect(result.status).toBe("error");
    expect(result.failure).toMatchObject({
      category: "unsupported_input",
      headline: "This input shape is not yet supported",
      nextStep: "The current resume input needs clearer bullet or section structure before generating.",
      retryable: false,
    });
  });

  it("renders trace_failure as trust-preserving guidance for cover letter generation", () => {
    const result = presentCoverLetterGeneration({
      response: {
        code: "generation_failed",
        category: "trace_failure",
        message: "Cover letter generation failed validation.",
        detail: "Some body sentences could not be mapped back to baseline evidence.",
        retryable: false,
        userAction: {
          title: "Repair traceable baseline evidence",
          description: "Make sure every content line has source evidence before retrying.",
        },
        diagnostics: {
          traceCoverage: 87.5,
          failureReasons: ["Line body_2 has no source evidence."],
        },
      },
    });

    expect(result.status).toBe("error");
    expect(result.failure).toMatchObject({
      category: "trace_failure",
      headline: "Generation could not be safely traced",
      explanation: "Cover letter generation failed validation.",
      nextStep: "Make sure every content line has source evidence before retrying.",
    });
  });

  it("renders generation_blocked with next-step guidance", () => {
    const result = presentResumeGeneration({
      response: {
        code: "generation_blocked",
        category: "generation_blocked",
        message: "Generation is not available for this role due to insufficient verified evidence.",
        detail: "Readiness or compliance gates blocked generation.",
        retryable: false,
        userAction: {
          title: "Review baseline readiness",
          description: "Complete the missing verified requirements before generating again.",
        },
        diagnostics: {
          failureReasons: ["full_block: Missing verified evidence."],
          missingRequirements: ["Missing verified evidence."],
        },
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.failure).toMatchObject({
      category: "generation_blocked",
      headline: "Generation is blocked",
      nextStep: "Complete the missing verified requirements before generating again.",
      retryable: false,
    });
  });

  it("keeps success states intact for both artifact flows", () => {
    const resume = presentResumeGeneration({
      status: "success",
      generationStatus: "success",
      exportReady: true,
      preview: { resume: { sections: [] } },
      exports: { docx: true, pdf: true },
      safeDisplay: { title: "Resume generated", description: "Ready", reasons: [] },
    });
    const coverLetter = presentCoverLetterGeneration({
      status: "success",
      generationStatus: "success",
      exportReady: true,
      preview: { coverLetter: { paragraphs: ["Opening.", "Body.", "Closing."] } },
      exports: { docx: true, pdf: true },
      safeDisplay: { title: "Cover letter generated successfully", description: "Ready", reasons: [] },
    });

    expect(resume.status).toBe("success");
    expect(coverLetter.status).toBe("success");
    expect(resume.failure).toBeNull();
    expect(coverLetter.failure).toBeNull();
  });
});
