import type { DocumentStrategyPlan } from "../../../../web/lib/documentStrategyPlan";
import type { GoldStandardCalibration } from "../../../../web/lib/goldStandardCalibration";

export type { GoldStandardBenchmarkFixture } from "../../../../web/lib/goldStandardCalibration";

export type SyntheticGenerationRoleMatchReadiness =
  | "ready"
  | "needs_tightening"
  | "misaligned";

export type SyntheticGenerationJourneyResultsBehavior =
  | "open"
  | "review"
  | "blocked";

export type SyntheticGenerationStudioBehavior =
  | "open"
  | "limited"
  | "blocked";

export type SyntheticGenerationOpportunityBehavior =
  | "save"
  | "blocked"
  | "not_applicable";

export type SyntheticGenerationSourceArtifact = {
  kind: "fixture";
  fixtureId: string;
  label?: string;
};

export type SyntheticGenerationScenarioExpected = {
  minFitScore: number;
  fitBand?: "strong" | "moderate" | "weak" | "blocked";
  generationMode: "generate" | "blocked";
  requiresResume: boolean;
  requiresCoverLetter: boolean;
  minRoleMatchReadiness: "ready" | "needs_tightening" | "misaligned";
  mustPassCalibrationBar: boolean;
  maxHighSeverityCalibrationGaps: number;
  requiredRoleSignals: string[];
  bannedFailureStates: string[];
  journey?: {
    results: SyntheticGenerationJourneyResultsBehavior;
    studio: SyntheticGenerationStudioBehavior;
    opportunity: SyntheticGenerationOpportunityBehavior;
  };
};

export type SyntheticGenerationScenario = {
  id: string;
  title: string;
  name: string;
  personaKey: string;
  baselineFixtureId: string;
  jobFixtureId: string;
  benchmarkFixtureId?: string | null;
  baselineSourceArtifact: SyntheticGenerationSourceArtifact;
  targetSourceArtifact: SyntheticGenerationSourceArtifact;
  tags: string[];
  notes?: string[];
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
  scenarioId: string;
  scenario: string;
  scenarioTitle: string;
  personaKey: string;
  tags: string[];
  baselineFixtureId: string;
  jobFixtureId: string;
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
  if (typeof scenario.id !== "string" || !scenario.id.trim()) {
    pushIssue(issues, "id", "scenario id is required.");
  }
  if (typeof scenario.title !== "string" || !scenario.title.trim()) {
    pushIssue(issues, "title", "scenario title is required.");
  }
  if (typeof scenario.personaKey !== "string" || !scenario.personaKey.trim()) {
    pushIssue(issues, "personaKey", "personaKey is required.");
  }
  if (typeof scenario.baselineFixtureId !== "string" || !scenario.baselineFixtureId.trim()) {
    pushIssue(issues, "baselineFixtureId", "baselineFixtureId is required.");
  }
  if (typeof scenario.jobFixtureId !== "string" || !scenario.jobFixtureId.trim()) {
    pushIssue(issues, "jobFixtureId", "jobFixtureId is required.");
  }
  if (!isObject(scenario.baselineSourceArtifact)) {
    pushIssue(issues, "baselineSourceArtifact", "baselineSourceArtifact is required.");
  } else if (scenario.baselineSourceArtifact.kind !== "fixture" || typeof scenario.baselineSourceArtifact.fixtureId !== "string" || !scenario.baselineSourceArtifact.fixtureId.trim()) {
    pushIssue(issues, "baselineSourceArtifact.fixtureId", "baselineSourceArtifact.fixtureId must reference a fixture.");
  }
  if (!isObject(scenario.targetSourceArtifact)) {
    pushIssue(issues, "targetSourceArtifact", "targetSourceArtifact is required.");
  } else if (scenario.targetSourceArtifact.kind !== "fixture" || typeof scenario.targetSourceArtifact.fixtureId !== "string" || !scenario.targetSourceArtifact.fixtureId.trim()) {
    pushIssue(issues, "targetSourceArtifact.fixtureId", "targetSourceArtifact.fixtureId must reference a fixture.");
  }
  if (!Array.isArray(scenario.tags)) {
    pushIssue(issues, "tags", "tags must be an array.");
  }

  if (!isObject(scenario.expected)) {
    pushIssue(issues, "expected", "expected is required.");
    return { valid: false, issues };
  }

  if (typeof scenario.expected.minFitScore !== "number" || Number.isNaN(scenario.expected.minFitScore)) {
    pushIssue(issues, "expected.minFitScore", "minFitScore must be a number.");
  }
  if (typeof scenario.expected.requiresResume !== "boolean") {
    pushIssue(issues, "expected.requiresResume", "requiresResume must be boolean.");
  }
  if (typeof scenario.expected.requiresCoverLetter !== "boolean") {
    pushIssue(issues, "expected.requiresCoverLetter", "requiresCoverLetter must be boolean.");
  }
  if (
    scenario.expected.fitBand !== undefined &&
    scenario.expected.fitBand !== "strong" &&
    scenario.expected.fitBand !== "moderate" &&
    scenario.expected.fitBand !== "weak" &&
    scenario.expected.fitBand !== "blocked"
  ) {
    pushIssue(issues, "expected.fitBand", 'fitBand must be "strong", "moderate", "weak", or "blocked".');
  }
  if (
    scenario.expected.generationMode !== "generate" &&
    scenario.expected.generationMode !== "blocked"
  ) {
    pushIssue(issues, "expected.generationMode", 'generationMode must be "generate" or "blocked".');
  }
  if (scenario.expected.generationMode === "generate") {
    if (scenario.expected.requiresResume !== true) {
      pushIssue(issues, "expected.requiresResume", "generate scenarios must require a resume.");
    }
    if (scenario.expected.requiresCoverLetter !== true) {
      pushIssue(issues, "expected.requiresCoverLetter", "generate scenarios must require a cover letter.");
    }
  }
  if (scenario.expected.generationMode === "blocked") {
    if (scenario.expected.requiresResume !== false) {
      pushIssue(issues, "expected.requiresResume", "blocked scenarios must not require a resume.");
    }
    if (scenario.expected.requiresCoverLetter !== false) {
      pushIssue(issues, "expected.requiresCoverLetter", "blocked scenarios must not require a cover letter.");
    }
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
  if (scenario.expected.journey) {
    if (
      scenario.expected.journey.results !== "open" &&
      scenario.expected.journey.results !== "review" &&
      scenario.expected.journey.results !== "blocked"
    ) {
      pushIssue(issues, "expected.journey.results", 'results must be "open", "review", or "blocked".');
    }
    if (
      scenario.expected.journey.studio !== "open" &&
      scenario.expected.journey.studio !== "limited" &&
      scenario.expected.journey.studio !== "blocked"
    ) {
      pushIssue(issues, "expected.journey.studio", 'studio must be "open", "limited", or "blocked".');
    }
    if (
      scenario.expected.journey.opportunity !== "save" &&
      scenario.expected.journey.opportunity !== "blocked" &&
      scenario.expected.journey.opportunity !== "not_applicable"
    ) {
      pushIssue(issues, "expected.journey.opportunity", 'opportunity must be "save", "blocked", or "not_applicable".');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
