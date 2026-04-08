import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
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
      scenario: bundle!.scenario,
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
});
