import {
  buildCalibrationFeedback,
  type CalibrationFeedback,
} from "@/lib/calibrationFeedback";
import {
  buildGoldStandardCalibration,
  type GoldStandardBenchmarkCoverLetter,
  type GoldStandardBenchmarkFixture,
  type GoldStandardBenchmarkResume,
  type GoldStandardCalibration,
} from "@/lib/goldStandardCalibration";
import {
  buildDocumentStrategyPlan,
  type DocumentStrategyPlan,
  type DocumentStrategyPlanInput,
} from "@/lib/documentStrategyPlan";
import {
  buildLanguageStylePass,
  polishCoverLetterParagraphsText,
  polishResumeBulletsText,
  polishResumeSummaryText,
} from "@/lib/languageStylePass";

export type SelfImprovementCycleInput = {
  planInput: DocumentStrategyPlanInput;
  generatedResume: GoldStandardBenchmarkResume;
  generatedCoverLetter: GoldStandardBenchmarkCoverLetter;
  benchmark: GoldStandardBenchmarkFixture;
};

export type SelfImprovementCycleOutput = {
  initialPlan: DocumentStrategyPlan;
  feedback: CalibrationFeedback;
  refinedPlan: DocumentStrategyPlan;
  initialCalibration: GoldStandardCalibration;
  refinedCalibration: GoldStandardCalibration;
  improved: boolean;
  refinedResume: GoldStandardBenchmarkResume;
  refinedCoverLetter: GoldStandardBenchmarkCoverLetter;
};

export function runGoldStandardSelfImprovementCycle(
  input: SelfImprovementCycleInput,
): SelfImprovementCycleOutput {
  const initialPlan = buildDocumentStrategyPlan(input.planInput);
  const initialCalibration = buildGoldStandardCalibration({
    plan: initialPlan,
    generatedResume: input.generatedResume,
    generatedCoverLetter: input.generatedCoverLetter,
    benchmark: input.benchmark,
  });
  const feedback = buildCalibrationFeedback({
    calibration: initialCalibration,
    plan: initialPlan,
  });
  const refinedPlan = buildDocumentStrategyPlan(input.planInput, feedback);
  const languageStylePass = buildLanguageStylePass({
    plan: refinedPlan,
    roleLabel: refinedPlan.positioningFrame,
    resumeSummary: input.generatedResume.summary,
    resumeBullets: input.generatedResume.bullets,
    coverOpening: input.generatedCoverLetter.opening,
    coverParagraphs: [
      input.generatedCoverLetter.opening,
      ...input.generatedCoverLetter.bodyParagraphs,
      input.generatedCoverLetter.closingParagraph,
    ],
    feedback,
  });

  const refinedResumeSummary = polishResumeSummaryText(
    input.generatedResume.summary,
    {
      plan: refinedPlan,
      roleLabel: refinedPlan.positioningFrame,
      resumeSummary: input.generatedResume.summary,
      resumeBullets: input.generatedResume.bullets,
      coverOpening: input.generatedCoverLetter.opening,
      coverParagraphs: [
        input.generatedCoverLetter.opening,
        ...input.generatedCoverLetter.bodyParagraphs,
        input.generatedCoverLetter.closingParagraph,
      ],
      feedback,
    },
    languageStylePass,
  );
  const refinedResumeBullets = polishResumeBulletsText(
    input.generatedResume.bullets,
    languageStylePass,
    {
      plan: refinedPlan,
      roleLabel: refinedPlan.positioningFrame,
      resumeSummary: input.generatedResume.summary,
      resumeBullets: input.generatedResume.bullets,
      coverOpening: input.generatedCoverLetter.opening,
      coverParagraphs: [
        input.generatedCoverLetter.opening,
        ...input.generatedCoverLetter.bodyParagraphs,
        input.generatedCoverLetter.closingParagraph,
      ],
      feedback,
    },
  );
  const refinedCoverParagraphs = polishCoverLetterParagraphsText(
    [
      input.generatedCoverLetter.opening,
      ...input.generatedCoverLetter.bodyParagraphs,
      input.generatedCoverLetter.closingParagraph,
    ],
    {
      plan: refinedPlan,
      roleLabel: refinedPlan.positioningFrame,
      resumeSummary: input.generatedResume.summary,
      resumeBullets: input.generatedResume.bullets,
      coverOpening: input.generatedCoverLetter.opening,
      coverParagraphs: [
        input.generatedCoverLetter.opening,
        ...input.generatedCoverLetter.bodyParagraphs,
        input.generatedCoverLetter.closingParagraph,
      ],
      feedback,
    },
    languageStylePass,
  );

  const refinedResume: GoldStandardBenchmarkResume = {
    summary: refinedResumeSummary,
    bullets: refinedResumeBullets,
  };

  const refinedCoverLetter: GoldStandardBenchmarkCoverLetter = {
    opening: refinedCoverParagraphs[0] ?? input.generatedCoverLetter.opening,
    bodyParagraphs: refinedCoverParagraphs.slice(1, -1),
    closingParagraph:
      refinedCoverParagraphs[refinedCoverParagraphs.length - 1] ??
      input.generatedCoverLetter.closingParagraph,
  };

  const refinedCalibration = buildGoldStandardCalibration({
    plan: refinedPlan,
    generatedResume: refinedResume,
    generatedCoverLetter: refinedCoverLetter,
    benchmark: input.benchmark,
  });
  const improved =
    refinedCalibration.overallCalibration !== initialCalibration.overallCalibration ||
    refinedCalibration.dimensionScores.languageSharpness > initialCalibration.dimensionScores.languageSharpness ||
    refinedCalibration.dimensionScores.coverLetterSpecificity > initialCalibration.dimensionScores.coverLetterSpecificity ||
    refinedCalibration.dimensionScores.framingAlignment > initialCalibration.dimensionScores.framingAlignment;

  return {
    initialPlan,
    feedback,
    refinedPlan,
    initialCalibration,
    refinedCalibration,
    improved,
    refinedResume,
    refinedCoverLetter,
  };
}

