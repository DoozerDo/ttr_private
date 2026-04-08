import type { DocumentStrategyPlan } from "../../../../web/lib/documentStrategyPlan";
import type { GoldStandardCalibration } from "../../../../web/lib/goldStandardCalibration";

export type { GoldStandardBenchmarkFixture } from "../../../../web/lib/goldStandardCalibration";

export type SyntheticGenerationRoleMatchReadiness =
  | "ready"
  | "needs_tightening"
  | "misaligned";

export type SyntheticGenerationScenarioExpected = {
  minFitScore: number;
  requiresResume: true;
  requiresCoverLetter: true;
  minRoleMatchReadiness: "ready" | "needs_tightening" | "misaligned";
  mustPassCalibrationBar: boolean;
  maxHighSeverityCalibrationGaps: number;
  requiredRoleSignals: string[];
  bannedFailureStates: string[];
};

export type SyntheticGenerationScenario = {
  name: string;
  baselineFixtureId: string;
  jobFixtureId: string;
  benchmarkFixtureId?: string | null;
  expected: SyntheticGenerationScenarioExpected;
};

export type SyntheticGenerationBaselineSectionFixture = {
  id: string;
  title: string;
  sectionType: "EXPERIENCE" | "SKILLS" | "SUMMARY" | "EDUCATION" | "CERTIFICATIONS";
  content: string;
};

export type SyntheticGenerationBaselineFixture = {
  id: string;
  originalFilename: string;
  storagePath: string;
  version: number;
  sections: SyntheticGenerationBaselineSectionFixture[];
  allowedCompanies: string[];
  allowedRoles: string[];
  allowedTechnologies: string[];
  allowedMetricTokens: string[];
};

export type SyntheticGenerationJobFixture = {
  id: string;
  title: string;
  company: string;
  rawDescription: string;
  normalizedResponsibilities: string[];
  normalizedRequirements: string[];
};

export type SyntheticGenerationFixtureBundle = {
  scenario: SyntheticGenerationScenario;
  baseline: SyntheticGenerationBaselineFixture;
  job: SyntheticGenerationJobFixture;
  benchmark?: GoldStandardBenchmarkFixture | null;
};

export type SyntheticGenerationEvaluationInput = {
  scenario: SyntheticGenerationScenario;
  fitScore: number | null;
  plan: DocumentStrategyPlan;
  generatedResume: {
    summary?: string | null;
    experience?: Array<{
      bullets?: string[] | null;
    }>;
  } | null;
  generatedCoverLetter: {
    salutation?: string | null;
    opening?: string | null;
    bodyParagraphs?: string[] | null;
    closingParagraph?: string | null;
    signoff?: string | null;
    signatureName?: string | null;
  } | null;
  jobDescription: string | null;
  benchmark?: GoldStandardBenchmarkFixture | null;
};

export type SyntheticGenerationResult = {
  scenario: string;
  status: "pass" | "fail";
  fitScore: number | null;
  resumeGenerated: boolean;
  coverLetterGenerated: boolean;
  resumeUsable: boolean | null;
  coverLetterUsable: boolean | null;
  roleMatchReadiness: SyntheticGenerationRoleMatchReadiness | null;
  overallCalibration: GoldStandardCalibration["overallCalibration"] | null;
  calibrationBarPassed: boolean | null;
  highSeverityCalibrationGapCount: number;
  detectedRoleSignals: string[];
  failureReasons: string[];
};

export type SyntheticGenerationSuiteResult = {
  status: "pass" | "fail";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scenarioResults: SyntheticGenerationResult[];
  passCount: number;
  failCount: number;
  summary: Record<string, unknown>;
  errorMessage: string | null;
};

export type SyntheticGenerationScenarioValidationIssue = {
  field: string;
  message: string;
};

export type SyntheticGenerationScenarioValidationResult = {
  valid: boolean;
  issues: SyntheticGenerationScenarioValidationIssue[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(
  issues: SyntheticGenerationScenarioValidationIssue[],
  field: string,
  message: string,
) {
  issues.push({ field, message });
}

export function validateSyntheticGenerationScenario(
  scenario: unknown,
): SyntheticGenerationScenarioValidationResult {
  const issues: SyntheticGenerationScenarioValidationIssue[] = [];
  if (!isObject(scenario)) {
    return {
      valid: false,
      issues: [
        {
          field: "scenario",
          message: "Scenario must be an object.",
        },
      ],
    };
  }

  if (typeof scenario.name !== "string" || !scenario.name.trim()) {
    pushIssue(issues, "name", "Scenario name is required.");
  }
  if (typeof scenario.baselineFixtureId !== "string" || !scenario.baselineFixtureId.trim()) {
    pushIssue(issues, "baselineFixtureId", "baselineFixtureId is required.");
  }
  if (typeof scenario.jobFixtureId !== "string" || !scenario.jobFixtureId.trim()) {
    pushIssue(issues, "jobFixtureId", "jobFixtureId is required.");
  }

  if (!isObject(scenario.expected)) {
    pushIssue(issues, "expected", "expected is required.");
    return { valid: false, issues };
  }

  if (typeof scenario.expected.minFitScore !== "number" || Number.isNaN(scenario.expected.minFitScore)) {
    pushIssue(issues, "expected.minFitScore", "minFitScore must be a number.");
  }
  if (scenario.expected.requiresResume !== true) {
    pushIssue(issues, "expected.requiresResume", "requiresResume must be true.");
  }
  if (scenario.expected.requiresCoverLetter !== true) {
    pushIssue(issues, "expected.requiresCoverLetter", "requiresCoverLetter must be true.");
  }
  if (
    scenario.expected.minRoleMatchReadiness !== "ready" &&
    scenario.expected.minRoleMatchReadiness !== "needs_tightening" &&
    scenario.expected.minRoleMatchReadiness !== "misaligned"
  ) {
    pushIssue(
      issues,
      "expected.minRoleMatchReadiness",
      'minRoleMatchReadiness must be "ready", "needs_tightening", or "misaligned".',
    );
  }
  if (typeof scenario.expected.mustPassCalibrationBar !== "boolean") {
    pushIssue(issues, "expected.mustPassCalibrationBar", "mustPassCalibrationBar must be boolean.");
  }
  if (
    typeof scenario.expected.maxHighSeverityCalibrationGaps !== "number" ||
    Number.isNaN(scenario.expected.maxHighSeverityCalibrationGaps)
  ) {
    pushIssue(
      issues,
      "expected.maxHighSeverityCalibrationGaps",
      "maxHighSeverityCalibrationGaps must be a number.",
    );
  }
  if (!Array.isArray(scenario.expected.requiredRoleSignals) || scenario.expected.requiredRoleSignals.length === 0) {
    pushIssue(
      issues,
      "expected.requiredRoleSignals",
      "requiredRoleSignals must contain at least one signal.",
    );
  }
  if (!Array.isArray(scenario.expected.bannedFailureStates) || scenario.expected.bannedFailureStates.length === 0) {
    pushIssue(
      issues,
      "expected.bannedFailureStates",
      "bannedFailureStates must contain at least one failure state.",
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
