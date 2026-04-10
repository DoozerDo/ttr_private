import type { DocumentStrategyPlan } from "./documentStrategyPlan";

type ResumeModel = {
  summary?: string;
  competencies?: string[];
  coreCompetencies?: string[];
  experience?: Array<{
    bullets?: string[];
  }>;
};

export type RoleMatchFinalPassPriorityCoverage = {
  priority: string;
  covered: boolean;
  strength: "strong" | "partial" | "missing";
  evidenceSource: string | null;
};

export type RoleMatchFinalPassKeywordAlignment = {
  strongMatches: string[];
  partialMatches: string[];
  missingButImportant: string[];
  stuffedOrExcessive: string[];
};

export type RoleMatchFinalPassRiskType =
  | "top_third_too_generic"
  | "missing_priority_signal"
  | "weak_keyword_presence"
  | "cover_letter_not_role_specific"
  | "proof_not_visible_early"
  | "theme_overload";

export type RoleMatchFinalPassRisk = {
  type: RoleMatchFinalPassRiskType;
  severity: "high" | "medium" | "low";
  explanation: string;
};

export type RoleMatchFinalAdjustmentType =
  | "summary_tighten"
  | "bullet_reorder"
  | "keyword_tighten"
  | "cover_letter_role_focus";

export type RoleMatchFinalAdjustment = {
  label: string;
  type: RoleMatchFinalAdjustmentType;
  target: "resume" | "cover_letter" | "both";
};

export type RoleMatchFinalPass = {
  overallMatchReadiness: "ready" | "needs_tightening" | "misaligned";
  priorityCoverage: RoleMatchFinalPassPriorityCoverage[];
  keywordAlignment: RoleMatchFinalPassKeywordAlignment;
  recruiterScanRisks: RoleMatchFinalPassRisk[];
  recommendedFinalAdjustments: RoleMatchFinalAdjustment[];
};

type RoleMatchFinalPassInput = {
  plan: DocumentStrategyPlan;
  resumeModel: ResumeModel | null;
  coverLetterParagraphs: string[];
  jobDescription?: string | null;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function joinText(values: Array<string | null | undefined>): string {
  return values.map((value) => normalizeText(String(value ?? ""))).filter(Boolean).join(" ");
}

function resumeText(model: ResumeModel | null): string {
  if (!model) return "";
  return joinText([
    model.summary,
    ...(model.competencies ?? []),
    ...(model.coreCompetencies ?? []),
    ...((model.experience ?? []).flatMap((entry) => entry.bullets ?? [])),
  ]);
}

function hasSignal(text: string, signal: string): boolean {
  const normalized = normalizeText(signal);
  return Boolean(normalized) && text.includes(normalized);
}

export function buildRoleMatchFinalPass(input: RoleMatchFinalPassInput): RoleMatchFinalPass {
  const corpus = joinText([
    input.plan.positioningFrame,
    input.plan.summaryStrategy,
    ...(input.plan.roleLens.priorities ?? []),
    ...(input.plan.roleLens.requiredSignals ?? []),
    input.jobDescription,
    ...input.coverLetterParagraphs,
    resumeText(input.resumeModel),
  ]);
  const priorities = input.plan.roleLens.priorities.slice(0, 4);
  const priorityCoverage: RoleMatchFinalPassPriorityCoverage[] = priorities.map((priority) => {
    const covered = hasSignal(corpus, priority);
    return {
      priority,
      covered,
      strength: covered ? "strong" : "missing",
      evidenceSource: covered ? "generated_artifacts" : null,
    };
  });

  const strongMatches = priorityCoverage.filter((entry) => entry.covered).map((entry) => entry.priority);
  const missingButImportant = priorityCoverage.filter((entry) => !entry.covered).map((entry) => entry.priority);
  const overallMatchReadiness =
    strongMatches.length === priorities.length && strongMatches.length > 0
      ? "ready"
      : strongMatches.length > 0
        ? "needs_tightening"
        : "misaligned";

  return {
    overallMatchReadiness,
    priorityCoverage,
    keywordAlignment: {
      strongMatches,
      partialMatches: [],
      missingButImportant,
      stuffedOrExcessive: [],
    },
    recruiterScanRisks: missingButImportant.length
      ? [
          {
            type: "missing_priority_signal",
            severity: missingButImportant.length > 2 ? "high" : "medium",
            explanation: `Missing priority signals: ${missingButImportant.join(", ")}`,
          },
        ]
      : [],
    recommendedFinalAdjustments: missingButImportant.length
      ? [
          {
            label: "Tighten the priority signal match",
            type: "keyword_tighten",
            target: "both",
          },
        ]
      : [],
  };
}
