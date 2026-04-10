import { buildDocumentStrategyPlan } from "../shared/documentStrategyPlan";
import { evaluateSyntheticGenerationScenario } from "./generation/synthetic-generation.evaluator";
import { listSyntheticGenerationScenarioBundles } from "./generation/synthetic-generation.fixtures";

describe("Synthetic artifact usability", () => {
  it("fails when generated resume and cover letter are structurally incomplete", () => {
    const bundle = listSyntheticGenerationScenarioBundles().find(
      (entry) => entry.scenario.name === "Support operations director",
    );
    expect(bundle).toBeTruthy();

    const plan = buildDocumentStrategyPlan({
      fitScore: 82,
      jobTitle: bundle?.job.title ?? "",
      jobCompany: bundle?.job.company ?? "",
      jobDescription: bundle?.job.rawDescription ?? "",
      jobRequirements: bundle?.job.normalizedRequirements ?? [],
      jobResponsibilities: bundle?.job.normalizedResponsibilities ?? [],
      baselineSections: (bundle?.baseline.sections ?? []).map((section) => ({
        id: section.id,
        title: section.title,
        sectionType: section.sectionType,
        content: section.content,
      })),
    });

    const result = evaluateSyntheticGenerationScenario({
      scenario: bundle!,
      fitScore: 82,
      plan,
      generatedResume: {
        summary: "",
        experience: [
          {
            bullets: ["Placeholder bullet"],
          },
        ],
      },
      generatedCoverLetter: {
        opening: "Dear Hiring Team,",
        bodyParagraphs: [],
        closingParagraph: "Sincerely,",
      },
      jobDescription: bundle?.job.rawDescription ?? "",
      benchmark: bundle?.benchmark ?? null,
    });

    expect(result.status).toBe("fail");
    expect(result.resumeUsable).toBe(false);
    expect(result.coverLetterUsable).toBe(false);
    expect(result.failureReasons.some((reason) => reason.includes("Resume output is not usable"))).toBe(true);
    expect(result.failureReasons.some((reason) => reason.includes("Cover letter output is not usable"))).toBe(true);
  });

  it("reports the actual cover letter word count when a structured letter is still too short", () => {
    const bundle = listSyntheticGenerationScenarioBundles().find(
      (entry) => entry.scenario.name === "Incident and service delivery leader",
    );
    expect(bundle).toBeTruthy();

    const plan = buildDocumentStrategyPlan({
      fitScore: 82,
      jobTitle: bundle?.job.title ?? "",
      jobCompany: bundle?.job.company ?? "",
      jobDescription: bundle?.job.rawDescription ?? "",
      jobRequirements: bundle?.job.normalizedRequirements ?? [],
      jobResponsibilities: bundle?.job.normalizedResponsibilities ?? [],
      baselineSections: (bundle?.baseline.sections ?? []).map((section) => ({
        id: section.id,
        title: section.title,
        sectionType: section.sectionType,
        content: section.content,
      })),
    });

    const result = evaluateSyntheticGenerationScenario({
      scenario: bundle!,
      fitScore: 82,
      plan,
      generatedResume: {
        summary: "Service delivery leader focused on incident response and process clarity.",
        experience: [
          {
            bullets: ["Led incident response routines.", "Built escalation pathways."],
          },
        ],
      },
      generatedCoverLetter: {
        opening:
          "I am applying for this role because I have led service delivery work and incident response routines across support and engineering partners.",
        bodyParagraphs: [
          "I reduce handoff friction and keep escalation ownership visible.",
          "I use review cadences to keep the service motion organized.",
        ],
        closingParagraph:
          "I would welcome a conversation about how this background could support your goals.",
      },
      jobDescription: bundle?.job.rawDescription ?? "",
      benchmark: bundle?.benchmark ?? null,
    });

    expect(result.status).toBe("fail");
    expect(result.coverLetterUsable).toBe(false);
    expect(
      result.failureReasons.some((reason) =>
        /Cover letter word count \d+ must be between 250 and 400 words\./.test(reason),
      ),
    ).toBe(true);
  });
});
