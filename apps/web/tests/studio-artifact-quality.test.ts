import { describe, expect, it } from "vitest";
import {
  validateCoverLetterQuality,
  validateResumeQuality,
} from "@/src/lib/studio/artifactQuality";

describe("Studio artifact quality", () => {
  describe("resume", () => {
    it("fails trailing fragment ending in The", () => {
      const model = {
        heading: { name: "Test Person", contactLine: "test@example.com" },
        summary: "Designed and built a full-stack production platform. The",
        competencies: ["TypeScript"],
        experience: [],
        education: [],
      } as any;

      const result = validateResumeQuality(model);
      expect(result.status).toBe("needs_refinement");
      expect(result.exportable).toBe(false);
    });

    it("fails trailing fragment ending in and", () => {
      const model = {
        heading: { name: "Test Person", contactLine: "test@example.com" },
        summary: "Solid summary.",
        experience: [
          {
            company: "Acme",
            roleTitle: "Operator",
            bullets: ["Led support operations for enterprise customers and"],
          },
        ],
        education: [],
      } as any;

      const result = validateResumeQuality(model);
      expect(result.status).toBe("needs_refinement");
      expect(result.exportable).toBe(false);
    });

    it("fails placeholder text", () => {
      const model = {
        heading: { name: "Test Person", contactLine: "test@example.com" },
        summary: "TODO: write summary",
        experience: [],
        education: [],
      } as any;

      const result = validateResumeQuality(model);
      expect(result.status).toBe("needs_refinement");
      expect(result.exportable).toBe(false);
    });

    it("passes a normal completed resume role/bullet", () => {
      const model = {
        heading: { name: "Test Person", contactLine: "test@example.com" },
        summary: "Operator and builder with a track record shipping production systems.",
        experience: [
          {
            company: "Acme",
            roleTitle: "Senior Engineer",
            bullets: ["Built a production pipeline that reduced cycle time by 30%."],
          },
        ],
        education: [{ degree: "B.S.", institution: "State University", location: "CA" }],
      } as any;

      const result = validateResumeQuality(model);
      expect(result.status).toBe("pass");
      expect(result.exportable).toBe(true);
    });
  });

  describe("cover letter", () => {
    it("fails operating context", () => {
      const result = validateCoverLetterQuality([
        "The strongest fit comes from the operating context I have already handled.",
      ]);
      expect(result.status).toBe("needs_refinement");
      expect(result.exportable).toBe(false);
    });

    it("fails strongest fit", () => {
      const result = validateCoverLetterQuality(["The strongest fit comes from execution systems."]);
      expect(result.status).toBe("needs_refinement");
      expect(result.exportable).toBe(false);
    });

    it("fails trailing fragment", () => {
      const result = validateCoverLetterQuality(["I built the system. The"]);
      expect(result.status).toBe("needs_refinement");
      expect(result.exportable).toBe(false);
    });

    it("passes a normal concise paragraph", () => {
      const result = validateCoverLetterQuality([
        "I have shipped production systems for high-traffic workflows and can translate ambiguous requirements into reliable delivery.",
      ]);
      expect(result.status).toBe("pass");
      expect(result.exportable).toBe(true);
    });
  });
});

