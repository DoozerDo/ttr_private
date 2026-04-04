import {
  evaluateStudioTrustGate,
  generateWithRetry,
  normalizeGenerationPayload,
  validateCoverLetterOutput,
  validateResumeOutput,
} from "@/lib/studioTrustGate";
import { vi } from "vitest";

describe("Studio trust gate", () => {
  it("blocks generation when score is below 70", () => {
    const decision = evaluateStudioTrustGate({
      score: 65,
      baselineId: "base-1",
      baselineVersionId: "ver-1",
      evidenceUnits: ["signal 1", "signal 2"],
      hasActiveComplianceViolations: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("You need to improve your fit before generating materials.");
  });

  it("blocks generation when baseline is incomplete", () => {
    const decision = evaluateStudioTrustGate({
      score: 82,
      baselineId: "",
      baselineVersionId: "",
      evidenceUnits: ["only one"],
      hasActiveComplianceViolations: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Your baseline is incomplete. Add more experience before generating.");
  });

  it("resume validation catches formatting and structure issues", () => {
    const result = validateResumeOutput({
      preview: {
        resume: {
          summary: "",
          experience: [
            {
              company: "Acme | Beta | Merged",
              roleTitle: "Director | Manager | Lead",
              bullets: [""],
            },
          ],
          education: [
            { degree: "BS", institution: "Uni", location: "CA" },
            { degree: "BS", institution: "Uni", location: "CA" },
          ],
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("merged"))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes("Duplicate education"))).toBe(true);
  });

  it("resume validation suppresses junk competency fragments and role drift", () => {
    const result = validateResumeOutput({
      preview: {
        resume: {
          summary: "Summary",
          competencies: ["Skills", "  ", "Operational leadership"],
          experience: [
            {
              company: "Acme | Support",
              roleTitle: "Director / Manager",
              bullets: ["Built support workflows with measurable outcomes."],
            },
          ],
        },
      },
    });

    expect(result.valid).toBe(true);
  });

  it("cover letter validation catches JD echo", () => {
    const jd = "We need a support operations leader to improve escalation workflows and lead customer support operations with KPI tracking and executive reporting.";
    const result = validateCoverLetterOutput(
      {
        preview: {
          coverLetter: {
            paragraphs: [
              "Dear Hiring Team,",
              "We need a support operations leader to improve escalation workflows and lead customer support operations with KPI tracking and executive reporting.",
              "We need a support operations leader to improve escalation workflows and lead customer support operations with KPI tracking and executive reporting.",
              "We need a support operations leader to improve escalation workflows and lead customer support operations with KPI tracking and executive reporting.",
              "Sincerely,",
              "Alex Candidate",
            ],
          },
        },
      },
      jd,
    );

    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("echo"))).toBe(true);
  });

  it("normalizes resume payload and enforces strict evidence source policy", () => {
    const normalized = normalizeGenerationPayload(
      {
        jobId: "job-1",
        baselineId: "base-1",
        editedResume: {
          experience: [
            {
              company: "Acme | Other Co",
              roleTitle: "Director / Lead",
              bullets: ["- Led team", "Own", "Built compliant support workflows with measurable outcomes"],
            },
          ],
        },
      },
      "resume",
    );

    expect(normalized.evidenceSourcePolicy).toBe(
      "verified_baseline_and_accepted_interview_additions_only",
    );
    expect(normalized.strictEvidenceOnly).toBe(true);
    expect(normalized.preventCrossRoleBleed).toBe(true);
    const editedResume = normalized.editedResume as { experience: Array<{ company: string; roleTitle: string; bullets: string[] }> };
    expect(editedResume.experience[0]?.company).toBe("Acme");
    expect(editedResume.experience[0]?.roleTitle).toBe("Director");
    expect(editedResume.experience[0]?.bullets).toEqual([
      "Built compliant support workflows with measurable outcomes",
    ]);
  });

  it("filters noise out of resume preview competencies", () => {
    const normalized = normalizeGenerationPayload(
      {
        editedResume: {
          competencies: ["Skills", "Customer strategy", "|", "Op"],
        },
      },
      "resume",
    );

    const editedResume = normalized.editedResume as { competencies?: string[] };
    expect(editedResume.competencies).toEqual(["Customer strategy"]);
  });

  it("blocks inflated scope and invented entity placeholders", () => {
    const result = validateResumeOutput({
      preview: {
        resume: {
          summary: "Summary",
          experience: [
            {
              company: "Confidential Company",
              roleTitle: "Director",
              bullets: ["Owned enterprise-wide operations across the entire company globally."],
            },
          ],
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("invented company"))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes("inflate scope"))).toBe(true);
  });

  it("retry executes once and then stops when validation keeps failing", async () => {
    const generate = vi.fn(async (_strictMode: boolean) => ({ value: "bad" }));
    const validate = vi.fn(() => ({ valid: false, reasons: ["invalid"] }));

    const result = await generateWithRetry({ generate, validate });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
  });

  it("returns failure state with reasons when retry cannot produce clean output", async () => {
    const result = await generateWithRetry({
      generate: async (strictMode: boolean) => ({ strictMode }),
      validate: () => ({ valid: false, reasons: ["Still invalid"] }),
    });

    expect(result).toEqual({ success: false, attempts: 2, reasons: ["Still invalid"] });
  });
});
