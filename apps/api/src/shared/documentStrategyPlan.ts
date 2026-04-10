import type { DocumentStrategyPlanLike } from "../document-strategy-plan.types";

export type DocumentStrategyFitBand = "strong" | "moderate" | "borderline" | null;

export type DocumentQualityFramingStrength = "high" | "medium" | "low";

export type DocumentQualityEmphasisConfidence = "high" | "medium" | "low";

export type DocumentQualityPass = {
  framingStrength: DocumentQualityFramingStrength;
  emphasisConfidence: DocumentQualityEmphasisConfidence;
  topNarrativeAxes: string[];
  cutCandidates: string[];
  mustLeadWith: string[];
  avoidRepeating: string[];
  coverLetterDelta: string[];
};

export type DocumentStrategyRoleLens = {
  titleFamily: string | null;
  seniority: string | null;
  scope: string | null;
  domainContext: string | null;
  priorities: string[];
  requiredSignals: string[];
  targetKeywords: string[];
};

export type DocumentStrategyEvidence = {
  baselineSection: string;
  sourceId: string;
  matchedSignals: string[];
  whySelected: string;
  approvedClaims: string[];
  rank?: number;
  score?: number;
};

export type DocumentStrategyPlan = {
  fitScore: number | null;
  fitBand: DocumentStrategyFitBand;
  positioningFrame: string;
  roleLens: DocumentStrategyRoleLens;
  selectedEvidence: DocumentStrategyEvidence[];
  summaryStrategy: string;
  resumeEmphasis: string[];
  coverLetterThemes: string[];
  suppressionNotes: string[];
  qualityPass: DocumentQualityPass;
  documentQualityScore: number;
};

export type DocumentStrategyPlanInput = {
  fitScore?: number | null;
  jobTitle?: string | null;
  jobCompany?: string | null;
  jobDescription?: string | null;
  jobRequirements?: string[];
  jobResponsibilities?: string[];
  analysisSummary?: string | null;
  analysisStrengths?: string[] | null;
  analysisGaps?: string[] | null;
  analysisRecommendedActions?: string[] | null;
  baselineSections?: Array<{
    id?: string | null;
    title?: string | null;
    content?: string | null;
    sectionType?: string | null;
  }>;
};

export type RefinementInstructionType =
  | "emphasis_shift"
  | "tone_adjustment"
  | "evidence_swap"
  | "summary_rewrite"
  | "bullet_focus"
  | "cover_letter_focus";

export type RefinementTarget = "resume" | "cover_letter" | "both";

export type RefinementInstructionConstraints = {
  preservePositioningFrame: boolean;
  preserveSelectedEvidence: boolean;
  allowNewEvidenceFromBaseline: boolean;
};

export type RefinementInstruction = {
  type: RefinementInstructionType;
  target: RefinementTarget;
  instruction: string;
  constraints: RefinementInstructionConstraints;
};

export type RefinementPreset = RefinementInstruction & {
  key: string;
  label: string;
  description: string;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(String(value ?? ""))).filter(Boolean)));
}

function bucketFitBand(score: number | null): DocumentStrategyFitBand {
  if (score === null || Number.isNaN(score)) return null;
  if (score >= 82) return "strong";
  if (score >= 68) return "moderate";
  return "borderline";
}

function pickPositioningFrame(input: DocumentStrategyPlanInput): string {
  const corpus = normalizeText(
    [
      input.jobTitle,
      input.jobCompany,
      input.jobDescription,
      ...(input.jobRequirements ?? []),
      ...(input.jobResponsibilities ?? []),
      ...(input.analysisStrengths ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();

  if (/(incident|reliability|escalation|triage|service delivery)/i.test(corpus)) {
    return "Service delivery and incident operations leader";
  }
  if (/(support operations|customer operations|customer success|cx|service)/i.test(corpus)) {
    return "Customer Operations and Support Strategy leader";
  }
  if (/(transform|migration|scale|rollout|adoption)/i.test(corpus)) {
    return "Support transformation leader for scaling SaaS environments";
  }
  if (/(workflow|process|systems|tooling|automation)/i.test(corpus)) {
    return "CX operations and workflow design leader";
  }
  if (input.jobTitle) return normalizeText(input.jobTitle);
  return "Strategic operations leader";
}

function buildRoleLens(input: DocumentStrategyPlanInput): DocumentStrategyRoleLens {
  const corpus = unique([
    ...(input.jobRequirements ?? []),
    ...(input.jobResponsibilities ?? []),
    ...(input.analysisStrengths ?? []),
    ...(input.analysisRecommendedActions ?? []),
    input.jobDescription,
  ]).join(" ").toLowerCase();

  const priorities = unique([
    /(incident|reliability|escalation|triage)/i.test(corpus) ? "incident response" : null,
    /(support operations|customer operations|customer success|cx)/i.test(corpus) ? "support operations" : null,
    /(workflow|process|system|tooling|automation)/i.test(corpus) ? "workflow design" : null,
    /(cross-functional|stakeholder|partner|coordination)/i.test(corpus) ? "cross-functional coordination" : null,
  ]);

  const requiredSignals = unique([
    ...(input.jobRequirements ?? []).slice(0, 4),
    ...(input.jobResponsibilities ?? []).slice(0, 4),
  ]);
  const targetKeywords = unique([
    ...priorities,
    ...(input.jobTitle ? [input.jobTitle] : []),
  ]);

  return {
    titleFamily: input.jobTitle ? normalizeText(input.jobTitle) : null,
    seniority: null,
    scope: null,
    domainContext: input.jobCompany ? normalizeText(input.jobCompany) : null,
    priorities,
    requiredSignals,
    targetKeywords,
  };
}

function evidenceFromBaseline(input: DocumentStrategyPlanInput, roleLens: DocumentStrategyRoleLens): DocumentStrategyEvidence[] {
  return (input.baselineSections ?? []).slice(0, 4).map((section, index) => ({
    baselineSection: normalizeText(section.title ?? section.sectionType ?? `section-${index + 1}`),
    sourceId: normalizeText(section.id ?? `section-${index + 1}`),
    matchedSignals: unique([
      ...roleLens.priorities.slice(0, 2),
      ...(input.analysisStrengths ?? []).slice(0, 1),
    ]),
    whySelected: normalizeText(section.content ?? input.analysisSummary ?? ""),
    approvedClaims: unique([(section.content ?? "").slice(0, 80)]),
    rank: index + 1,
    score: input.fitScore ?? undefined,
  }));
}

export function buildDocumentStrategyPlan(input: DocumentStrategyPlanInput): DocumentStrategyPlan {
  const fitScore = typeof input.fitScore === "number" && !Number.isNaN(input.fitScore) ? input.fitScore : null;
  const positioningFrame = pickPositioningFrame(input);
  const roleLens = buildRoleLens(input);
  const selectedEvidence = evidenceFromBaseline(input, roleLens);
  const fitBand = bucketFitBand(fitScore);
  const topNarrativeAxes = unique([positioningFrame, ...(roleLens.priorities.slice(0, 2) ?? [])]);
  const qualityPass: DocumentQualityPass = {
    framingStrength: fitBand === "strong" ? "high" : fitBand === "moderate" ? "medium" : "low",
    emphasisConfidence: fitScore !== null && fitScore >= 75 ? "high" : fitScore !== null && fitScore >= 60 ? "medium" : "low",
    topNarrativeAxes,
    cutCandidates: unique([...(input.analysisGaps ?? []).slice(0, 2)]),
    mustLeadWith: unique([positioningFrame, ...(roleLens.requiredSignals.slice(0, 1) ?? [])]),
    avoidRepeating: unique([...(input.analysisRecommendedActions ?? []).slice(0, 2)]),
    coverLetterDelta: unique([
      `Explain why ${positioningFrame} is the right lens for this role.`,
      topNarrativeAxes[0]
        ? `Use ${topNarrativeAxes[0]} once as the opening proof point.`
        : "Open with the strongest proof point for the role.",
      topNarrativeAxes[1]
        ? `Add ${topNarrativeAxes[1]} as a second proof point, not a rewrite of the resume.`
        : "Keep the second paragraph additive and specific.",
      "Show motivation and fit without repeating the resume.",
    ]).slice(0, 4),
  };

  const summaryStrategy = normalizeText(
    input.analysisSummary ??
      `Lead with ${positioningFrame.toLowerCase()} and keep the strongest role-aligned proof visible early.`,
  );

  return {
    fitScore,
    fitBand,
    positioningFrame,
    roleLens,
    selectedEvidence,
    summaryStrategy,
    resumeEmphasis: unique([positioningFrame, ...(roleLens.priorities.slice(0, 2) ?? [])]),
    coverLetterThemes: unique([positioningFrame, ...(input.analysisStrengths ?? []).slice(0, 3)]),
    suppressionNotes: unique([...(input.analysisGaps ?? []).slice(0, 3)]),
    qualityPass,
    documentQualityScore: Math.max(0, Math.min(100, Math.round((fitScore ?? 60) * 0.75 + selectedEvidence.length * 5))),
  };
}

export function buildDocumentStrategyPlanSummary(plan: DocumentStrategyPlan): string {
  return [plan.positioningFrame, plan.summaryStrategy].filter(Boolean).join(" - ");
}

export type { DocumentStrategyPlanLike };
