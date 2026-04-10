import { buildLanguageStylePass } from "../../language-style-pass";
import type { DocumentStrategyPlan } from "../../shared/documentStrategyPlan";
import {
  buildRoleMatchFinalPass,
  type RoleMatchFinalPass,
} from "../../shared/roleMatchFinalPass";
import {
  buildGoldStandardCalibration,
  meetsGoldStandardCalibrationMinimumBar,
  type GoldStandardCalibration,
  type GoldStandardBenchmarkFixture,
} from "../../shared/goldStandardCalibration";
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

function countWords(text: string): number {
  return normalizeText(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
}

function looksPlaceholderLike(text: string): boolean {
  return /\b(placeholder|lorem ipsum|todo|tbd|sample text|fake company|fake role)\b/i.test(text);
}

function evaluateArtifactUsability(
  resume: NonNullable<SyntheticGenerationEvaluationInput["generatedResume"]> | null,
  coverLetter: NonNullable<SyntheticGenerationEvaluationInput["generatedCoverLetter"]> | null,
  jobDescription: string | null,
): {
  resumeUsable: boolean;
  coverLetterUsable: boolean;
  resumeReasons: string[];
  coverLetterReasons: string[];
} {
  const resumeReasons: string[] = [];
  const coverLetterReasons: string[] = [];

  if (!resume) {
    resumeReasons.push("Resume preview data is missing.");
  } else {
    const summary = normalizeText(resume.summary ?? "");
    const bullets = (resume.experience ?? []).flatMap((entry) => entry.bullets ?? []).map((bullet) => normalizeText(String(bullet ?? ""))).filter(Boolean);
    const hasCompleteExperience = (resume.experience ?? []).some((entry) => {
      const bullets = (entry.bullets ?? []).map((bullet) => normalizeText(String(bullet ?? ""))).filter(Boolean);
      return Boolean(bullets.length);
    });

    if (!summary) {
      resumeReasons.push("Resume summary is missing.");
    }
    if (!bullets.length) {
      resumeReasons.push("Resume must include at least one experience section with bullets.");
    }
    if (!hasCompleteExperience) {
      resumeReasons.push("Resume experience sections are incomplete.");
    }
    if (looksPlaceholderLike(summary) || bullets.some(looksPlaceholderLike)) {
      resumeReasons.push("Resume contains placeholder-like content.");
    }
  }

  if (!coverLetter) {
    coverLetterReasons.push("Cover letter preview data is missing.");
  } else {
    const paragraphs = normalizeCoverLetterParagraphs([
      coverLetter.salutation ?? "",
      coverLetter.opening ?? "",
      ...(coverLetter.bodyParagraphs ?? []),
      coverLetter.closingParagraph ?? "",
      coverLetter.signoff ?? "",
      coverLetter.signatureName ?? "",
    ]);
    const coverText = paragraphs.join(" ");
    const coverWordCount = countWords(coverText);
    if (!paragraphs.length) {
      coverLetterReasons.push("Cover letter paragraphs are missing.");
    }
    if (paragraphs.length < 4) {
      coverLetterReasons.push("Cover letter should contain properly structured paragraphs.");
    }
    if (coverWordCount < 250 || coverWordCount > 400) {
      coverLetterReasons.push(
        `Cover letter word count ${coverWordCount} must be between 250 and 400 words.`,
      );
    }
    if (looksPlaceholderLike(coverText)) {
      coverLetterReasons.push("Cover letter contains placeholder-like content.");
    }
    if (!jobDescription || !normalizeText(jobDescription)) {
      coverLetterReasons.push("Cover letter could not be compared against the role description.");
    }
  }

  return {
    resumeUsable: resumeReasons.length === 0,
    coverLetterUsable: coverLetterReasons.length === 0,
    resumeReasons,
    coverLetterReasons,
  };
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
  const generationMode = input.scenario.expected.generationMode;
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
  const roleMatch =
    generationMode === "generate" && resume && coverLetter
      ? buildRoleMatchSummary(input, plan, resume, coverLetter)
      : null;
  const artifactUsability = evaluateArtifactUsability(resume, coverLetter, input.jobDescription);
  const calibration = input.benchmark
    && generationMode === "generate"
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
  if (input.scenario.expected.requiresResume && !resumeGenerated) {
    failures.push("Resume was not generated or is empty.");
  }
  if (generationMode === "generate" && resume && !artifactUsability.resumeUsable) {
    failures.push(`Resume output is not usable: ${artifactUsability.resumeReasons.join(" ")}`);
  }
  if (generationMode === "blocked" && resumeGenerated) {
    failures.push("Generation should have been blocked, but a resume was produced.");
  }

  const coverLetterGenerated = Boolean(coverLetter && coverParagraphs.length > 0);
  if (input.scenario.expected.requiresCoverLetter && !coverLetterGenerated) {
    failures.push("Cover letter was not generated or is empty.");
  }
  if (generationMode === "generate" && coverLetter && !artifactUsability.coverLetterUsable) {
    failures.push(`Cover letter output is not usable: ${artifactUsability.coverLetterReasons.join(" ")}`);
  }
  if (generationMode === "blocked" && coverLetterGenerated) {
    failures.push("Generation should have been blocked, but a cover letter was produced.");
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
  if (generationMode === "generate") {
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
  }

  const detectedRoleSignals = roleMatch?.detectedRoleSignals ?? [];
  if (generationMode === "generate") {
    const missingRequiredSignals = requiredSignals.filter(
      (signal) => !detectedRoleSignals.some((detected) => normalizeLower(detected) === normalizeLower(signal)),
    );
    if (missingRequiredSignals.length > 0) {
      failures.push(`Required role signals were not detected: ${missingRequiredSignals.join(", ")}.`);
    }
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
    scenarioId: input.scenario.id,
    scenarioTitle: input.scenario.title,
    personaKey: input.scenario.personaKey,
    tags: input.scenario.tags,
    baselineFixtureId: input.scenario.baselineFixtureId,
    jobFixtureId: input.scenario.jobFixtureId,
    status: failures.length === 0 ? "pass" : "fail",
    fitScore,
    resumeGenerated,
    coverLetterGenerated,
    resumeUsable: resume ? artifactUsability.resumeUsable : null,
    coverLetterUsable: coverLetter ? artifactUsability.coverLetterUsable : null,
    roleMatchReadiness,
    overallCalibration,
    calibrationBarPassed,
    highSeverityCalibrationGapCount,
    detectedRoleSignals: Array.from(new Set(detectedRoleSignals)),
    failureReasons: failures,
  };
}
