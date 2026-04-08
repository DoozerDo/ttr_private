import { buildLanguageStylePass } from "../../language-style-pass";
import type { DocumentStrategyPlan } from "../../../../web/lib/documentStrategyPlan";
import {
  buildRoleMatchFinalPass,
  type RoleMatchFinalPass,
} from "../../../../web/lib/roleMatchFinalPass";
import {
  buildGoldStandardCalibration,
  meetsGoldStandardCalibrationMinimumBar,
  type GoldStandardCalibration,
  type GoldStandardBenchmarkFixture,
} from "../../../../web/lib/goldStandardCalibration";
import type { SyntheticGenerationEvaluationInput, SyntheticGenerationResult } from "./synthetic-generation.types";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function joinText(values: string[]): string {
  return values.map(normalizeText).filter(Boolean).join(" ").trim();
}

function normalizeCoverLetterParagraphs(paragraphs: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const paragraph of paragraphs) {
    const normalized = normalizeText(paragraph);
    if (!normalized) continue;
    const lowered = normalizeLower(normalized);
    if (seen.has(lowered)) continue;
    if (/^(dear hiring team|sincerely|regards|best|thank you)\b/i.test(normalized)) continue;
    seen.add(lowered);
    deduped.push(normalized);
  }
  return deduped;
}

function getResumeSummary(resume: SyntheticGenerationEvaluationInput["generatedResume"]): string {
  return normalizeText(resume?.summary ?? "");
}

function getResumeBullets(resume: SyntheticGenerationEvaluationInput["generatedResume"]): string[] {
  return (resume?.experience ?? [])
    .flatMap((entry) => entry.bullets ?? [])
    .map((bullet) => normalizeText(String(bullet ?? "")))
    .filter(Boolean);
}

function getCoverParagraphs(coverLetter: SyntheticGenerationEvaluationInput["generatedCoverLetter"]): string[] {
  if (!coverLetter) return [];
  return normalizeCoverLetterParagraphs([
    coverLetter.salutation ?? "",
    coverLetter.opening ?? "",
    ...(coverLetter.bodyParagraphs ?? []),
    coverLetter.closingParagraph ?? "",
    coverLetter.signoff ?? "",
    coverLetter.signatureName ?? "",
  ]);
}

function collectDetectedSignals(corpus: string, signals: string[]): string[] {
  const lowered = normalizeLower(corpus);
  const detected: string[] = [];

  for (const signal of signals) {
    const normalizedSignal = normalizeLower(signal);
    if (!normalizedSignal) continue;
    const tokens = normalizedSignal.split(/[^a-z0-9]+/i).filter((token) => token.length > 3);
    const exactHit = lowered.includes(normalizedSignal);
    const tokenHit = tokens.length > 0 && tokens.every((token) => lowered.includes(token));
    if (exactHit || tokenHit) {
      detected.push(signal);
    }
  }

  return Array.from(new Set(detected));
}

function matchesBannedFailureState(text: string, bannedFailureStates: string[]): string[] {
  const lowered = normalizeLower(text);
  return bannedFailureStates.filter((state) => lowered.includes(normalizeLower(state)));
}

function countHighSeverityCalibrationGaps(calibration: GoldStandardCalibration | null): number {
  return calibration?.topGaps.filter((gap) => gap.severity === "high").length ?? 0;
}

function buildRoleMatchSummary(
  input: SyntheticGenerationEvaluationInput,
  plan: DocumentStrategyPlan,
  resume: NonNullable<SyntheticGenerationEvaluationInput["generatedResume"]>,
  coverLetter: NonNullable<SyntheticGenerationEvaluationInput["generatedCoverLetter"]>,
): {
  pass: RoleMatchFinalPass;
  roleMatchReadiness: SyntheticGenerationResult["roleMatchReadiness"];
  detectedRoleSignals: string[];
} {
  const coverParagraphs = getCoverParagraphs(coverLetter);
  const roleMatchPass = buildRoleMatchFinalPass({
    plan,
    resumeModel: {
      summary: resume.summary ?? undefined,
      experience: (resume.experience ?? []).map((entry) => ({
        bullets: entry.bullets ?? [],
      })),
    },
    coverLetterParagraphs: coverParagraphs,
    jobDescription: input.jobDescription,
  });

  const readiness = roleMatchPass.overallMatchReadiness;
  const corpus = joinText([
    resume.summary ?? "",
    ...(resume.experience ?? []).flatMap((entry) => entry.bullets ?? []),
    ...coverParagraphs,
    input.jobDescription ?? "",
  ]);
  const detectedRoleSignals = collectDetectedSignals(
    corpus,
    Array.from(
      new Set([
        ...input.scenario.expected.requiredRoleSignals,
        ...plan.roleLens.priorities,
        ...plan.roleLens.requiredSignals,
      ]),
    ),
  );

  return {
    pass: roleMatchPass,
    roleMatchReadiness: readiness,
    detectedRoleSignals,
  };
}

export function evaluateSyntheticGenerationScenario(
  input: SyntheticGenerationEvaluationInput,
): SyntheticGenerationResult {
  const failures: string[] = [];
  const fitScore = input.fitScore ?? null;
  const requiredSignals = input.scenario.expected.requiredRoleSignals;
  const plan = input.plan;
  const resume = input.generatedResume;
  const coverLetter = input.generatedCoverLetter;
  const resumeSummary = getResumeSummary(resume);
  const resumeBullets = getResumeBullets(resume);
  const coverParagraphs = getCoverParagraphs(coverLetter);
  const coverageCorpus = joinText([
    resumeSummary,
    ...resumeBullets,
    ...coverParagraphs,
    input.jobDescription ?? "",
  ]);
  const languageStylePass = buildLanguageStylePass({
    plan,
    roleLabel: input.scenario.name,
    resumeSummary: resumeSummary || null,
    resumeBullets,
    coverOpening: coverParagraphs[0] ?? null,
    coverParagraphs,
  });
  const roleMatch = resume && coverLetter ? buildRoleMatchSummary(input, plan, resume, coverLetter) : null;
  const calibration = input.benchmark
    ? buildGoldStandardCalibration({
        plan,
        generatedResume: {
          summary: resumeSummary,
          bullets: resumeBullets,
        },
        generatedCoverLetter: {
          opening: coverParagraphs[0] ?? "",
          bodyParagraphs: coverParagraphs.slice(1, -1),
          closingParagraph: coverParagraphs[coverParagraphs.length - 1] ?? "",
        },
        benchmark: input.benchmark as GoldStandardBenchmarkFixture,
      })
    : null;

  if (fitScore === null) {
    failures.push("Fit score was not produced.");
  } else if (fitScore < input.scenario.expected.minFitScore) {
    failures.push(
      `Fit score ${fitScore} fell below the minimum acceptable score of ${input.scenario.expected.minFitScore}.`,
    );
  }

  const resumeGenerated = Boolean(resume && resumeSummary.length > 0 && resumeBullets.length > 0);
  if (!input.scenario.expected.requiresResume) {
    failures.push("Scenario contract is missing the resume requirement.");
  } else if (!resumeGenerated) {
    failures.push("Resume was not generated or is empty.");
  }

  const coverLetterGenerated = Boolean(coverLetter && coverParagraphs.length > 0);
  if (!input.scenario.expected.requiresCoverLetter) {
    failures.push("Scenario contract is missing the cover letter requirement.");
  } else if (!coverLetterGenerated) {
    failures.push("Cover letter was not generated or is empty.");
  }

  const bannedStates = matchesBannedFailureState(
    joinText([
      JSON.stringify(input.generatedResume ?? {}),
      JSON.stringify(input.generatedCoverLetter ?? {}),
      ...languageStylePass.issues.map((issue) => `${issue.type}:${issue.location}`),
    ]),
    input.scenario.expected.bannedFailureStates,
  );
  if (bannedStates.length > 0) {
    failures.push(`Banned failure states detected: ${bannedStates.join(", ")}.`);
  }

  const roleMatchReadiness = roleMatch?.roleMatchReadiness ?? null;
  if (!roleMatchReadiness) {
    failures.push("Role match readiness was not produced.");
  } else {
    const readinessRank: Record<NonNullable<SyntheticGenerationResult["roleMatchReadiness"]>, number> = {
      ready: 2,
      needs_tightening: 1,
      misaligned: 0,
    };
    if (
      readinessRank[roleMatchReadiness] <
      readinessRank[input.scenario.expected.minRoleMatchReadiness]
    ) {
      failures.push(
        `Role match readiness ${roleMatchReadiness} did not meet the minimum threshold of ${input.scenario.expected.minRoleMatchReadiness}.`,
      );
    }
  }

  const detectedRoleSignals = roleMatch?.detectedRoleSignals ?? [];
  const missingRequiredSignals = requiredSignals.filter(
    (signal) => !detectedRoleSignals.some((detected) => normalizeLower(detected) === normalizeLower(signal)),
  );
  if (missingRequiredSignals.length > 0) {
    failures.push(`Required role signals were not detected: ${missingRequiredSignals.join(", ")}.`);
  }

  let overallCalibration: SyntheticGenerationResult["overallCalibration"] = null;
  let calibrationBarPassed: boolean | null = null;
  let highSeverityCalibrationGapCount = 0;

  if (calibration) {
    overallCalibration = calibration.overallCalibration;
    calibrationBarPassed = meetsGoldStandardCalibrationMinimumBar(calibration);
    highSeverityCalibrationGapCount = countHighSeverityCalibrationGaps(calibration);

    if (input.scenario.expected.mustPassCalibrationBar && !calibrationBarPassed) {
      failures.push("Gold standard calibration did not meet the minimum bar.");
    }
    if (highSeverityCalibrationGapCount > input.scenario.expected.maxHighSeverityCalibrationGaps) {
      failures.push(
        `High severity calibration gaps (${highSeverityCalibrationGapCount}) exceeded the maximum of ${input.scenario.expected.maxHighSeverityCalibrationGaps}.`,
      );
    }
  } else if (input.scenario.expected.mustPassCalibrationBar) {
    failures.push("Benchmark-backed calibration was expected but no benchmark fixture was supplied.");
  }

  const hiddenGenerationGatingDetected =
    normalizeLower(coverageCorpus).includes("generation blocked") ||
    normalizeLower(coverageCorpus).includes("blocked by compliance") ||
    normalizeLower(coverageCorpus).includes("not eligible for studio");
  if (hiddenGenerationGatingDetected) {
    failures.push("Hidden generation gating detected in the generated artifacts.");
  }

  return {
    scenario: input.scenario.name,
    status: failures.length === 0 ? "pass" : "fail",
    fitScore,
    resumeGenerated,
    coverLetterGenerated,
    roleMatchReadiness,
    overallCalibration,
    calibrationBarPassed,
    highSeverityCalibrationGapCount,
    detectedRoleSignals: Array.from(new Set(detectedRoleSignals)),
    failureReasons: failures,
  };
}
