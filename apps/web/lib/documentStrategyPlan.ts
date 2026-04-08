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
  fitScore: number | null;
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
  refinements?: RefinementInstruction[] | null;
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

export type DocumentStrategyPlanSummaryModel = {
  positioning: string;
  emphasis: string;
  coverLetter: string;
  evidence: string[];
  suppression: string[];
  quality: string;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "into",
  "this",
  "that",
  "your",
  "you",
  "role",
  "job",
  "for",
  "our",
  "their",
  "must",
  "will",
  "have",
  "has",
  "been",
  "are",
  "was",
  "were",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "an",
  "a",
  "as",
  "or",
  "be",
  "we",
  "it",
  "via",
  "more",
  "less",
  "some",
  "any",
  "than",
  "across",
]);

type SignalDefinition = {
  label: string;
  keywords: string[];
  category: string;
};

const SIGNAL_DEFINITIONS: SignalDefinition[] = [
  {
    label: "support operations rigor",
    keywords: ["support", "customer", "service", "operations", "queue", "sla", "csat"],
    category: "operations",
  },
  {
    label: "process and workflow design",
    keywords: ["process", "workflow", "playbook", "sop", "architecture", "design", "system"],
    category: "process",
  },
  {
    label: "cross-functional leadership",
    keywords: ["cross-functional", "stakeholder", "partner", "engineering", "product", "finance"],
    category: "coordination",
  },
  {
    label: "tooling and systems fluency",
    keywords: ["zendesk", "salesforce", "jira", "tooling", "platform", "system", "automation"],
    category: "tooling",
  },
  {
    label: "service delivery and incident response",
    keywords: ["incident", "escalation", "outage", "triage", "service delivery", "reliability"],
    category: "delivery",
  },
  {
    label: "change and transformation leadership",
    keywords: ["change", "transformation", "rollout", "migration", "adoption", "launch"],
    category: "change",
  },
  {
    label: "organizational scale",
    keywords: ["global", "regional", "24/7", "multi-site", "enterprise", "high volume", "scale"],
    category: "scale",
  },
  {
    label: "quantified impact",
    keywords: ["improved", "reduced", "increased", "metrics", "kpi", "sla", "nps", "csat", "%"],
    category: "impact",
  },
  {
    label: "domain and customer context",
    keywords: ["domain", "industry", "customer", "enterprise", "saas", "business", "market"],
    category: "context",
  },
];

const TITLE_FAMILY_RULES: Array<{ family: string; keywords: string[] }> = [
  { family: "Customer Operations / Support Strategy", keywords: ["support", "customer operations", "customer success", "cx", "service"] },
  { family: "Incident and Service Delivery", keywords: ["incident", "service delivery", "reliability", "response"] },
  { family: "Operations and Process Leadership", keywords: ["operations", "process", "workflow", "program"] },
  { family: "Transformation and Scale", keywords: ["transform", "change", "scale", "migration", "launch"] },
];

const POSITIONING_FRAME_RULES: Array<{ frame: string; keywords: string[] }> = [
  {
    frame: "Service delivery and incident operations leader",
    keywords: ["incident", "outage", "triage", "service delivery", "reliability", "sla"],
  },
  {
    frame: "Customer Operations and Support Strategy leader",
    keywords: ["support", "customer operations", "customer success", "service", "cx", "workflow"],
  },
  {
    frame: "Support transformation leader for scaling SaaS environments",
    keywords: ["transformation", "change", "migration", "scale", "rollout", "adoption"],
  },
  {
    frame: "CX operations and workflow design leader",
    keywords: ["operations", "process", "workflow", "systems", "architecture", "tooling"],
  },
  {
    frame: "Cross-functional operations leader",
    keywords: ["cross-functional", "stakeholder", "partner", "coordination", "engineering", "product"],
  },
];

const GENERIC_FILLER_PHRASES = [
  "results-driven",
  "proven track record",
  "dynamic leader",
  "passionate",
  "self-starter",
  "detail-oriented",
  "team player",
  "fast-paced",
  "world-class",
  "go-getter",
];

const GENERIC_RESUME_PHRASES = [
  "led with impact",
  "delivered results",
  "driven by outcomes",
];

export const REFINEMENT_PRESETS: RefinementPreset[] = [
  {
    key: "emphasize-leadership",
    label: "Emphasize leadership more",
    description: "Shift the story toward leadership scope without changing the core frame.",
    type: "emphasis_shift",
    target: "both",
    instruction: "Increase leadership framing while preserving the current positioning frame and verified evidence.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "emphasize-operations",
    label: "Emphasize operations and process more",
    description: "Push operational rigor and process design higher in the hierarchy.",
    type: "emphasis_shift",
    target: "both",
    instruction: "Increase operations and process emphasis while keeping the same verified baseline story.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "more-strategic",
    label: "Make this more strategic",
    description: "Elevate the strategic lens without inventing new scope.",
    type: "tone_adjustment",
    target: "both",
    instruction: "Make the story more strategic, selective, and concise without losing the evidence base.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "more-execution",
    label: "Make this more execution-focused",
    description: "Give more weight to operating detail, delivery, and follow-through.",
    type: "tone_adjustment",
    target: "resume",
    instruction: "Make the resume more execution-focused and grounded in operating detail.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "tighten-summary",
    label: "Tighten the summary",
    description: "Shorten the summary and make the framing more direct.",
    type: "summary_rewrite",
    target: "resume",
    instruction: "Tighten the summary so it opens with the positioning frame and the strongest aligned evidence.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "reduce-repetition",
    label: "Reduce repetition",
    description: "Trim repeated themes and make the bullets feel more selective.",
    type: "bullet_focus",
    target: "resume",
    instruction: "Reduce repeated phrasing and keep only the most relevant proof in the bullet hierarchy.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "strengthen-impact",
    label: "Strengthen impact language",
    description: "Lean harder into outcome-bearing language where the evidence supports it.",
    type: "bullet_focus",
    target: "resume",
    instruction: "Strengthen impact language while keeping every claim anchored to the existing baseline.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "cover-role-fit",
    label: "Focus cover letter more on role fit",
    description: "Make the letter explain why this role is a match.",
    type: "cover_letter_focus",
    target: "cover_letter",
    instruction: "Make the cover letter more explicit about role fit and why this candidate is aligned to the opening.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "cover-business-impact",
    label: "Focus cover letter more on business impact",
    description: "Shift the letter toward outcome and business value.",
    type: "cover_letter_focus",
    target: "cover_letter",
    instruction: "Make the cover letter emphasize business impact and operating value more clearly.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: true,
      allowNewEvidenceFromBaseline: false,
    },
  },
  {
    key: "evidence-swap",
    label: "Swap in stronger evidence",
    description: "Re-rank evidence from the same baseline to pull stronger proof forward.",
    type: "evidence_swap",
    target: "resume",
    instruction: "Swap in stronger baseline evidence for the current emphasis while preserving chronology and truth.",
    constraints: {
      preservePositioningFrame: true,
      preserveSelectedEvidence: false,
      allowNewEvidenceFromBaseline: true,
    },
  },
];

export function resolveRefinementTargets(instruction: RefinementInstruction): RefinementTarget[] {
  if (instruction.target === "both") {
    return ["resume", "cover_letter"];
  }
  return [instruction.target];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSourceParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).map((part) => normalizeText(String(part))).join(" ").toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .toLowerCase()
    .match(/[a-z0-9%]+/g)
    ?.filter((token) => token.length > 2 && !STOPWORDS.has(token)) ?? [];
}

function countKeywordMatches(corpus: string, keywords: string[]): number {
  let total = 0;
  for (const keyword of keywords) {
    if (corpus.includes(keyword.toLowerCase())) {
      total += 1;
    }
  }
  return total;
}

function extractKeywords(parts: Array<string | null | undefined>, limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const token of tokenize(part)) {
      if (seen.has(token)) continue;
      seen.add(token);
      result.push(token);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

function chooseTitleFamily(corpus: string): string | null {
  for (const rule of TITLE_FAMILY_RULES) {
    if (rule.keywords.some((keyword) => corpus.includes(keyword))) {
      return rule.family;
    }
  }
  return null;
}

function chooseSeniority(corpus: string): string | null {
  if (/\b(vp|vice president|director|head)\b/i.test(corpus)) return "senior leadership";
  if (/\b(manager|lead)\b/i.test(corpus)) return "manager level";
  if (/\b(principal|staff|senior)\b/i.test(corpus)) return "senior individual contributor";
  if (/\b(associate|coordinator|junior)\b/i.test(corpus)) return "early career";
  return "mid-level";
}

function chooseScope(corpus: string): string | null {
  if (/\b(24\/7|multi-site|enterprise|global|regional|high volume)\b/i.test(corpus)) {
    return "enterprise-scale and cross-team";
  }
  if (/\b(team|pod|queue|program)\b/i.test(corpus)) {
    return "team-level execution with cross-functional reach";
  }
  return "role-level execution and coordination";
}

function chooseDomainContext(corpus: string, jobCompany?: string | null): string | null {
  if (/\b(saas|software|tech|platform|product)\b/i.test(corpus)) return "technology and platform operations";
  if (/\b(customer|support|service|cx)\b/i.test(corpus)) return "customer-facing operations";
  if (/\b(healthcare|finance|retail|logistics|education|nonprofit)\b/i.test(corpus)) {
    const match = corpus.match(/\b(healthcare|finance|retail|logistics|education|nonprofit)\b/i);
    return match?.[1] ? `${match[1].toLowerCase()} operations` : null;
  }
  const company = normalizeText(jobCompany ?? "");
  return company || null;
}

function choosePriorities(corpus: string): string[] {
  const scored = SIGNAL_DEFINITIONS.map((signal) => ({
    label: signal.label,
    score: countKeywordMatches(corpus, signal.keywords),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 4);

  return scored.map((entry) => entry.label);
}

function chooseRequiredSignals(priorities: string[]): string[] {
  return priorities.slice(0, 4);
}

function chooseFitBand(fitScore: number | null): DocumentStrategyFitBand {
  if (typeof fitScore !== "number") return null;
  if (fitScore >= 80) return "strong";
  if (fitScore >= 70) return "moderate";
  return "borderline";
}

function choosePositioningFrame(corpus: string, priorities: string[]): string {
  if (/\b(incident|outage|triage|service delivery|reliability|sla)\b/i.test(corpus)) {
    return "Service delivery and incident operations leader";
  }
  if (/\b(support|customer operations|customer success|customer service|cx)\b/i.test(corpus)) {
    return "Customer Operations and Support Strategy leader";
  }
  if (/\b(change|transformation|migration|rollout|adoption|scale)\b/i.test(corpus)) {
    if (/\b(saas|software|platform|product|tech)\b/i.test(corpus)) {
      return "Support transformation leader for scaling SaaS environments";
    }
    return "Support transformation leader";
  }
  if (/\b(process|workflow|system|architecture|tooling)\b/i.test(corpus)) {
    return "CX operations and workflow design leader";
  }
  if (/\b(cross-functional|stakeholder|partner|engineering|product)\b/i.test(corpus)) {
    return "Cross-functional operations leader";
  }

  const scored = POSITIONING_FRAME_RULES.map((rule) => ({
    frame: rule.frame,
    score: countKeywordMatches(corpus, rule.keywords),
  })).sort((a, b) => b.score - a.score || a.frame.localeCompare(b.frame));

  return scored[0]?.frame ?? "Operations leader";
}

function buildQualityPass(plan: {
  fitBand: DocumentStrategyFitBand;
  positioningFrame: string;
  roleLens: DocumentStrategyRoleLens;
  selectedEvidence: DocumentStrategyEvidence[];
  suppressionNotes: string[];
}): DocumentQualityPass {
  const topEvidence = plan.selectedEvidence.slice(0, 3);
  const topNarrativeAxes = Array.from(
    new Set([
      ...plan.roleLens.priorities.slice(0, 3),
      ...topEvidence.flatMap((evidence) => evidence.matchedSignals.slice(0, 2)),
    ]),
  ).slice(0, 4);

  const framingStrength: DocumentQualityFramingStrength =
    plan.fitBand === "strong" && topEvidence.length >= 2 ? "high" : plan.fitBand === "borderline" ? "low" : "medium";
  const emphasisConfidence: DocumentQualityEmphasisConfidence =
    topEvidence.length >= 3 && topNarrativeAxes.length >= 2 ? "high" : topEvidence.length >= 2 ? "medium" : "low";

  const cutCandidates = Array.from(
    new Set(
      plan.suppressionNotes
        .flatMap((note) => note.split(/[.;]/))
        .map((value) => normalizeText(value))
        .filter((value) => value.length > 0)
        .filter((value) => /lower-relevance|weaker overlap|opening frame|background/i.test(value)),
    ),
  ).slice(0, 4);

  const mustLeadWith = Array.from(
    new Set([
      plan.positioningFrame,
      ...(topNarrativeAxes[0] ? [topNarrativeAxes[0]] : []),
      ...(topEvidence[0]?.baselineSection ? [topEvidence[0].baselineSection] : []),
    ]),
  ).filter(Boolean).slice(0, 3);

  const avoidRepeating = Array.from(
    new Set([
      ...GENERIC_FILLER_PHRASES,
      ...GENERIC_RESUME_PHRASES,
      ...plan.roleLens.priorities.slice(1, 4),
    ]),
  ).slice(0, 8);

  const coverLetterDelta = Array.from(
    new Set([
      `Explain why ${plan.positioningFrame} is the right lens for this role.`,
      topNarrativeAxes[0]
        ? `Lean on ${topNarrativeAxes[0]} as the opening proof point.`
        : "Open with the role-shaped value proposition.",
      topNarrativeAxes[1]
        ? `Use ${topNarrativeAxes[1]} as a secondary theme instead of restating the resume.`
        : "Keep the second paragraph additive to the resume.",
      "Show motivation and fit, not a line-by-line recap of experience.",
    ]),
  ).slice(0, 4);

  return {
    framingStrength,
    emphasisConfidence,
    topNarrativeAxes,
    cutCandidates,
    mustLeadWith,
    avoidRepeating,
    coverLetterDelta,
  };
}

function computeDocumentQualityScore(plan: {
  fitBand: DocumentStrategyFitBand;
  positioningFrame: string;
  selectedEvidence: DocumentStrategyEvidence[];
  suppressionNotes: string[];
  qualityPass: DocumentQualityPass;
}): number {
  const framingScore =
    plan.qualityPass.framingStrength === "high"
      ? 30
      : plan.qualityPass.framingStrength === "medium"
        ? 20
        : 10;
  const emphasisScore =
    plan.qualityPass.emphasisConfidence === "high"
      ? 25
      : plan.qualityPass.emphasisConfidence === "medium"
        ? 16
        : 8;
  const evidenceScore = Math.min(plan.selectedEvidence.length, 4) * 10;
  const suppressionScore = Math.min(plan.suppressionNotes.length, 4) * 5;
  const precisionScore = plan.positioningFrame !== "Operations leader" ? 10 : 4;
  const bandScore =
    plan.fitBand === "strong" ? 5 : plan.fitBand === "moderate" ? 3 : plan.fitBand === "borderline" ? 1 : 2;
  return Math.max(
    0,
    Math.min(100, framingScore + emphasisScore + evidenceScore + suppressionScore + precisionScore + bandScore),
  );
}

function cleanSectionLabel(value: string | null | undefined, sectionType?: string | null): string {
  const label = normalizeText(value ?? "");
  if (label) return label;
  if (sectionType) return sectionType.replace(/_/g, " ").toLowerCase();
  return "Baseline evidence";
}

function splitClaims(content: string): string[] {
  return content
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length >= 24)
    .slice(0, 6);
}

function chooseApprovedClaims(content: string, matchedSignals: string[]): string[] {
  const claims = splitClaims(content);
  const signalKeywords = matchedSignals.flatMap((signal) =>
    SIGNAL_DEFINITIONS.find((definition) => definition.label === signal)?.keywords ?? [],
  );
  const matchedClaims = claims.filter((claim) =>
    signalKeywords.some((keyword) => claim.toLowerCase().includes(keyword.toLowerCase())),
  );
  if (matchedClaims.length) return matchedClaims.slice(0, 3);
  const fallback = claims.find((claim) => claim.length > 0);
  return fallback ? [fallback] : [];
}

function buildMatchedSignals(sectionText: string): string[] {
  return SIGNAL_DEFINITIONS.filter((signal) =>
    signal.keywords.some((keyword) => sectionText.includes(keyword.toLowerCase())),
  )
    .map((signal) => signal.label)
    .slice(0, 4);
}

function scoreSection(sectionText: string, corpus: string, priorities: string[]): number {
  const normalized = sectionText.toLowerCase();
  const signalScore = SIGNAL_DEFINITIONS.reduce((total, signal) => {
    const labelHit = priorities.some((priority) => priority === signal.label) ? 2 : 0;
    const keywordHits = countKeywordMatches(normalized, signal.keywords);
    return total + keywordHits + labelHit;
  }, 0);
  const corpusOverlap = tokenize(sectionText).filter((token) => corpus.includes(token)).length;
  const outcomeSignals = /\b(led|built|owned|improved|delivered|implemented|scaled|reduced|increased|launched|designed|managed)\b/i.test(
    sectionText,
  )
    ? 3
    : 0;
  const quantifiedSignals = /\b\d+(?:%|x|k|m|million|billion)?\b/i.test(sectionText) ? 3 : 0;
  const strategicSignals = /\b(strategy|program|architecture|workflow|process|operational|cross-functional)\b/i.test(
    sectionText,
  )
    ? 2
    : 0;
  return signalScore * 3 + corpusOverlap + outcomeSignals + quantifiedSignals + strategicSignals;
}

function buildEvidenceSelection(
  sections: NonNullable<DocumentStrategyPlanInput["baselineSections"]>,
  corpus: string,
  priorities: string[],
): { selectedEvidence: DocumentStrategyEvidence[]; suppressionNotes: string[] } {
  const scored = sections
    .map((section, index) => {
      const sectionText = normalizeSourceParts([section.title, section.content, section.sectionType]);
      return {
        section,
        index,
        sectionText,
        score: scoreSection(sectionText, corpus, priorities),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = scored.filter((entry) => entry.score > 0).slice(0, 4);
  const selectedIds = new Set(selected.map((entry) => entry.index));
  const selectedEvidence = selected.map(({ section, sectionText, index }, rank) => {
    const matchedSignals = buildMatchedSignals(sectionText);
    const baselineSection = cleanSectionLabel(section.title, section.sectionType);
    const approvedClaims = chooseApprovedClaims(section.content ?? "", matchedSignals);
    const whySelected =
      matchedSignals.length > 0
        ? `Directly supports ${matchedSignals.slice(0, 2).join(" and ")}.`
        : priorities.length > 0
          ? `Supports the role's emphasis on ${priorities[0]}.`
          : "Supports the chosen positioning frame.";
    return {
      baselineSection,
      sourceId: section.id?.trim() || `section-${index + 1}`,
      matchedSignals,
      whySelected,
      approvedClaims,
      rank: rank + 1,
      score: scored.find((entry) => entry.index === index)?.score ?? 0,
    } satisfies DocumentStrategyEvidence;
  });

  const omittedRelevant = scored.filter((entry) => !selectedIds.has(entry.index) && entry.score > 0);
  const suppressionNotes = [
    priorities[0]
      ? `Lower-relevance background was suppressed so the story stays centered on ${priorities[0]}.`
      : "Lower-relevance background was suppressed so the story stays centered on the role.",
    omittedRelevant.length > 0
      ? `Supporting sections with weaker overlap were kept out of the opening frame to preserve a tighter story.`
      : "No meaningful background needed suppression beyond the selected evidence clusters.",
  ];

  return { selectedEvidence, suppressionNotes };
}

function buildSummaryStrategy(positioningFrame: string, priorities: string[], fitBand: DocumentStrategyFitBand): string {
  const fitLine = fitBand ? `${fitBand} fit` : "fit in review";
  const emphasis = priorities.length > 0 ? priorities.slice(0, 2).join(" and ") : "role-relevant evidence";
  return `${fitLine}: lead with ${positioningFrame}, emphasize ${emphasis}, and keep lower-relevance background out of the opening story.`;
}

function buildResumeEmphasis(priorities: string[], selectedEvidence: DocumentStrategyEvidence[]): string[] {
  const emphasis = [...priorities.slice(0, 3)];
  for (const evidence of selectedEvidence) {
    if (emphasis.length >= 4) break;
    if (!emphasis.includes(evidence.baselineSection)) {
      emphasis.push(evidence.baselineSection);
    }
  }
  return emphasis.slice(0, 4);
}

function buildCoverLetterThemes(positioningFrame: string, priorities: string[], selectedEvidence: DocumentStrategyEvidence[]): string[] {
  const themes = [
    `Open with ${positioningFrame.toLowerCase()} positioning.`,
    priorities[0] ? `Connect the letter to ${priorities[0]}.` : "Connect the letter to the role's most important priorities.",
  ];
  const evidenceTheme = selectedEvidence[0]?.whySelected;
  if (evidenceTheme) {
    themes.push(evidenceTheme);
  }
  return Array.from(new Set(themes)).slice(0, 3);
}

function clonePlan(plan: DocumentStrategyPlan): DocumentStrategyPlan {
  return JSON.parse(JSON.stringify(plan)) as DocumentStrategyPlan;
}

function normalizeRefinementText(value: string): string {
  return normalizeText(value).toLowerCase();
}

function refinementFocusLabels(instruction: RefinementInstruction): string[] {
  const text = normalizeRefinementText(instruction.instruction);
  const labels: string[] = [];
  const maybeAdd = (label: string) => {
    if (!labels.includes(label)) labels.push(label);
  };

  if (text.includes("leadership")) {
    maybeAdd("cross-functional leadership");
    maybeAdd("change and transformation leadership");
  }
  if (text.includes("operations")) {
    maybeAdd("support operations rigor");
    maybeAdd("domain and customer context");
  }
  if (text.includes("process") || text.includes("workflow")) {
    maybeAdd("process and workflow design");
  }
  if (text.includes("strategic")) {
    maybeAdd("cross-functional leadership");
    maybeAdd("change and transformation leadership");
  }
  if (text.includes("execution") || text.includes("impact")) {
    maybeAdd("quantified impact");
    maybeAdd("service delivery and incident response");
  }
  if (text.includes("role fit")) {
    maybeAdd("domain and customer context");
    maybeAdd("cross-functional leadership");
  }
  if (text.includes("business impact")) {
    maybeAdd("quantified impact");
    maybeAdd("organizational scale");
  }
  return labels;
}

function refinementFocusTerms(instruction: RefinementInstruction): string[] {
  const text = normalizeRefinementText(instruction.instruction);
  const terms: string[] = [];
  const maybeAdd = (term: string) => {
    if (!terms.includes(term)) terms.push(term);
  };

  if (text.includes("leadership")) maybeAdd("leadership");
  if (text.includes("operations")) maybeAdd("operations");
  if (text.includes("process")) maybeAdd("process");
  if (text.includes("workflow")) maybeAdd("workflow");
  if (text.includes("strategic")) maybeAdd("strategy");
  if (text.includes("execution")) maybeAdd("execution");
  if (text.includes("impact")) maybeAdd("impact");
  if (text.includes("role fit")) maybeAdd("fit");
  if (text.includes("business impact")) maybeAdd("business");
  return terms;
}

function scoreRefinedEvidenceEntry(entry: DocumentStrategyEvidence, focusTerms: string[]): number {
  const corpus = [
    entry.baselineSection,
    entry.whySelected,
    ...(entry.matchedSignals ?? []),
    ...(entry.approvedClaims ?? []),
  ]
    .join(" ")
    .toLowerCase();
  let score = typeof entry.score === "number" ? entry.score : typeof entry.rank === "number" ? 100 - entry.rank * 10 : 0;
  for (const term of focusTerms) {
    if (corpus.includes(term)) {
      score += 8;
    }
  }
  if (focusTerms.includes("leadership") && /lead|direct|manage|owner|head/i.test(corpus)) score += 4;
  if (focusTerms.includes("operations") && /support|service|ops|process|workflow/i.test(corpus)) score += 4;
  if (focusTerms.includes("execution") && /deliver|implement|launch|scale|reduce|increase/i.test(corpus)) score += 4;
  return score;
}

function rerankEvidenceForRefinement(
  _plan: DocumentStrategyPlan,
  instruction: RefinementInstruction,
  selectedEvidence: DocumentStrategyEvidence[],
): DocumentStrategyEvidence[] {
  if (instruction.constraints.preserveSelectedEvidence) {
    const focusTerms = refinementFocusTerms(instruction);
    return [...selectedEvidence]
      .sort(
        (a, b) =>
          scoreRefinedEvidenceEntry(b, focusTerms) -
            scoreRefinedEvidenceEntry(a, focusTerms) ||
          Number(a.rank ?? 0) - Number(b.rank ?? 0),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  const focusLabels = refinementFocusLabels(instruction);
  const focusTerms = refinementFocusTerms(instruction);
  const evidence = [...selectedEvidence];
  if (!focusLabels.length) {
    return evidence.map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  const reordered = [...evidence].sort(
    (a, b) =>
      scoreRefinedEvidenceEntry(b, focusTerms) - scoreRefinedEvidenceEntry(a, focusTerms) ||
      Number(a.rank ?? 0) - Number(b.rank ?? 0),
  );
  return reordered.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function buildRefinedSummaryStrategy(
  plan: DocumentStrategyPlan,
  instruction: RefinementInstruction,
  activeEvidence: DocumentStrategyEvidence[],
): string {
  const focusLabels = refinementFocusLabels(instruction);
  const focusLead = focusLabels[0] ?? plan.roleLens.priorities[0] ?? "role-relevant evidence";
  const primaryEvidence = activeEvidence[0]?.baselineSection ?? plan.positioningFrame;
  if (instruction.type === "summary_rewrite") {
    return `${plan.positioningFrame}: lead with ${primaryEvidence}, keep the summary tight, and stay selective about repetition.`;
  }
  if (instruction.type === "tone_adjustment") {
    return `${plan.positioningFrame}: present the story more strategically while leading with ${focusLead}.`;
  }
  if (instruction.type === "emphasis_shift") {
    return `${plan.positioningFrame}: shift emphasis toward ${focusLead} and surface the strongest matching evidence first.`;
  }
  return `${plan.positioningFrame}: keep the summary anchored to ${focusLead} and the strongest baseline evidence.`;
}

function buildRefinedResumeEmphasis(
  baseEmphasis: string[],
  instruction: RefinementInstruction,
  activeEvidence: DocumentStrategyEvidence[],
): string[] {
  const next = [...baseEmphasis];
  const focusLabels = refinementFocusLabels(instruction);
  for (const label of focusLabels) {
    if (!next.includes(label)) next.unshift(label);
  }
  for (const evidence of activeEvidence.slice(0, 2)) {
    if (!next.includes(evidence.baselineSection)) next.push(evidence.baselineSection);
  }
  return next.slice(0, 4);
}

function buildRefinedCoverLetterThemes(
  baseThemes: string[],
  instruction: RefinementInstruction,
  activeEvidence: DocumentStrategyEvidence[],
): string[] {
  const next = [...baseThemes];
  const focusLabels = refinementFocusLabels(instruction);
  if (instruction.type === "cover_letter_focus") {
    const fitTheme = focusLabels[0] ?? activeEvidence[0]?.baselineSection ?? "role fit";
    if (!next.some((theme) => theme.toLowerCase().includes("role"))) {
      next.unshift(`Explain the role fit through ${fitTheme}.`);
    }
    if (!next.some((theme) => theme.toLowerCase().includes("impact"))) {
      next.push("Make the business impact explicit without rehashing the resume.");
    }
  } else if (instruction.type === "tone_adjustment") {
    next.push("Keep the letter strategic, concise, and recruiter-friendly.");
  } else if (instruction.type === "emphasis_shift") {
    next.push(`Use ${focusLabels[0] ?? "the strongest evidence"} as the opening proof point.`);
  }
  return Array.from(new Set(next)).slice(0, 3);
}

function buildRefinedQualityPass(
  basePlan: DocumentStrategyPlan,
  activeEvidence: DocumentStrategyEvidence[],
  instruction: RefinementInstruction,
  suppressionNotes: string[],
): DocumentQualityPass {
  const next = buildQualityPass({
    fitBand: basePlan.fitBand,
    positioningFrame: basePlan.positioningFrame,
    roleLens: basePlan.roleLens,
    selectedEvidence: activeEvidence,
    suppressionNotes,
  });

  if (instruction.type === "summary_rewrite" || instruction.type === "bullet_focus") {
    next.mustLeadWith = Array.from(
      new Set([
        ...next.mustLeadWith,
        activeEvidence[0]?.baselineSection ?? basePlan.positioningFrame,
      ]),
    ).slice(0, 3);
  }
  if (instruction.type === "cover_letter_focus") {
    next.coverLetterDelta = Array.from(
      new Set([
        ...next.coverLetterDelta,
        "Use the cover letter to explain role fit and business impact more directly.",
      ]),
    ).slice(0, 4);
  }
  return next;
}

function validateRefinedPlan(
  basePlan: DocumentStrategyPlan,
  refinedPlan: DocumentStrategyPlan,
  instruction: RefinementInstruction,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (instruction.constraints.preservePositioningFrame && refinedPlan.positioningFrame !== basePlan.positioningFrame) {
    reasons.push("Positioning frame drifted.");
  }
  if (!refinedPlan.selectedEvidence.length) {
    reasons.push("Selected evidence was cleared.");
  }
  if (!refinedPlan.suppressionNotes.length) {
    reasons.push("Suppression notes were lost.");
  }
  if (refinedPlan.qualityPass.coverLetterDelta.length === 0) {
    reasons.push("Cover letter delta was not preserved.");
  }
  if (refinedPlan.qualityPass.emphasisConfidence === "low" && instruction.type !== "summary_rewrite") {
    reasons.push("Refinement lowered emphasis confidence too far.");
  }
  return { valid: reasons.length === 0, reasons };
}

function applyRefinementInstructions(
  input: DocumentStrategyPlanInput,
  basePlan: DocumentStrategyPlan,
  refinements: RefinementInstruction[],
): DocumentStrategyPlan {
  if (!refinements.length) return basePlan;

  let workingPlan = clonePlan(basePlan);
  for (const instruction of refinements) {
    const focusLabels = refinementFocusLabels(instruction);
    const nextPlan = clonePlan(workingPlan);

    const nextSelectedEvidence = rerankEvidenceForRefinement(
      nextPlan,
      instruction,
      nextPlan.selectedEvidence,
    );

    const shouldRebuildEvidence =
      instruction.type === "evidence_swap" &&
      instruction.constraints.allowNewEvidenceFromBaseline &&
      Array.isArray(input.baselineSections) &&
      input.baselineSections.length > 0;

    const nextRolePriorities = Array.from(
      new Set([
        ...nextPlan.roleLens.priorities,
        ...focusLabels,
        ...(instruction.type === "emphasis_shift" ? focusLabels.slice(0, 1) : []),
      ]),
    ).slice(0, 5);

    const evidenceSelection = shouldRebuildEvidence
      ? buildEvidenceSelection(input.baselineSections ?? [], normalizeSourceParts([
          input.jobTitle,
          input.jobCompany,
          input.jobDescription,
          input.analysisSummary,
          ...(input.jobRequirements ?? []),
          ...(input.jobResponsibilities ?? []),
          ...(input.analysisStrengths ?? []),
          ...(input.analysisGaps ?? []),
          ...(input.analysisRecommendedActions ?? []),
        ]), nextRolePriorities)
      : null;

    if (instruction.constraints.preserveSelectedEvidence) {
      nextPlan.selectedEvidence = nextSelectedEvidence;
    } else if (evidenceSelection) {
      nextPlan.selectedEvidence = evidenceSelection.selectedEvidence;
      nextPlan.suppressionNotes = evidenceSelection.suppressionNotes;
    } else if (nextSelectedEvidence.length) {
      nextPlan.selectedEvidence = nextSelectedEvidence;
    }

    nextPlan.roleLens = {
      ...nextPlan.roleLens,
      priorities: nextRolePriorities,
    };

    if (instruction.type === "emphasis_shift" || instruction.type === "tone_adjustment") {
      nextPlan.summaryStrategy = buildRefinedSummaryStrategy(nextPlan, instruction, nextPlan.selectedEvidence);
      nextPlan.resumeEmphasis = buildRefinedResumeEmphasis(nextPlan.resumeEmphasis, instruction, nextPlan.selectedEvidence);
      nextPlan.coverLetterThemes = buildRefinedCoverLetterThemes(
        nextPlan.coverLetterThemes,
        instruction,
        nextPlan.selectedEvidence,
      );
    }

    if (instruction.type === "summary_rewrite") {
      nextPlan.summaryStrategy = buildRefinedSummaryStrategy(nextPlan, instruction, nextPlan.selectedEvidence);
      nextPlan.resumeEmphasis = buildRefinedResumeEmphasis(nextPlan.resumeEmphasis, instruction, nextPlan.selectedEvidence);
    }

    if (instruction.type === "bullet_focus") {
      nextPlan.resumeEmphasis = buildRefinedResumeEmphasis(nextPlan.resumeEmphasis, instruction, nextPlan.selectedEvidence);
      nextPlan.summaryStrategy = buildRefinedSummaryStrategy(nextPlan, instruction, nextPlan.selectedEvidence);
    }

    if (instruction.type === "cover_letter_focus") {
      nextPlan.coverLetterThemes = buildRefinedCoverLetterThemes(
        nextPlan.coverLetterThemes,
        instruction,
        nextPlan.selectedEvidence,
      );
    }

    if (instruction.type === "evidence_swap") {
      nextPlan.selectedEvidence = shouldRebuildEvidence
        ? evidenceSelection?.selectedEvidence ?? nextSelectedEvidence
        : nextSelectedEvidence;
      nextPlan.resumeEmphasis = buildRefinedResumeEmphasis(nextPlan.resumeEmphasis, instruction, nextPlan.selectedEvidence);
      nextPlan.coverLetterThemes = buildRefinedCoverLetterThemes(
        nextPlan.coverLetterThemes,
        instruction,
        nextPlan.selectedEvidence,
      );
    }

    nextPlan.suppressionNotes = Array.from(
      new Set([
        ...nextPlan.suppressionNotes,
        ...(instruction.target !== "cover_letter"
          ? [
              `Refinement kept the resume centered on ${focusLabels[0] ?? nextPlan.positioningFrame}.`,
            ]
          : []),
        ...(instruction.target !== "resume"
          ? [
              `Refinement kept the cover letter additive rather than duplicative.`,
            ]
          : []),
      ]),
    );

    nextPlan.qualityPass = buildRefinedQualityPass(
      nextPlan,
      nextPlan.selectedEvidence,
      instruction,
      nextPlan.suppressionNotes,
    );
    nextPlan.documentQualityScore = computeDocumentQualityScore({
      fitBand: nextPlan.fitBand,
      positioningFrame: nextPlan.positioningFrame,
      selectedEvidence: nextPlan.selectedEvidence,
      suppressionNotes: nextPlan.suppressionNotes,
      qualityPass: nextPlan.qualityPass,
    });

    const validation = validateRefinedPlan(workingPlan, nextPlan, instruction);
    if (!validation.valid) {
      continue;
    }
    workingPlan = nextPlan;
  }

  return workingPlan;
}

export function buildDocumentStrategyPlan(input: DocumentStrategyPlanInput): DocumentStrategyPlan {
  const corpus = normalizeSourceParts([
    input.jobTitle,
    input.jobCompany,
    input.jobDescription,
    input.analysisSummary,
    ...(input.jobRequirements ?? []),
    ...(input.jobResponsibilities ?? []),
    ...(input.analysisStrengths ?? []),
    ...(input.analysisGaps ?? []),
    ...(input.analysisRecommendedActions ?? []),
  ]);
  const fitBand = chooseFitBand(input.fitScore);
  const titleFamily = chooseTitleFamily(corpus);
  const seniority = chooseSeniority(corpus);
  const scope = chooseScope(corpus);
  const domainContext = chooseDomainContext(corpus, input.jobCompany);
  const priorities = choosePriorities(corpus);
  const requiredSignals = chooseRequiredSignals(priorities);
  const targetKeywords = extractKeywords(
    [
      input.jobTitle,
      input.jobCompany,
      input.jobDescription,
      input.analysisSummary,
      ...(input.jobRequirements ?? []),
      ...(input.jobResponsibilities ?? []),
    ],
    10,
  );
  const roleLens: DocumentStrategyRoleLens = {
    titleFamily,
    seniority,
    scope,
    domainContext,
    priorities,
    requiredSignals,
    targetKeywords,
  };

  const positioningFrame = choosePositioningFrame(corpus, priorities);
  const selectedEvidenceInput = input.baselineSections ?? [];
  const evidenceSelection = buildEvidenceSelection(selectedEvidenceInput, corpus, priorities);
  const selectedEvidence = evidenceSelection.selectedEvidence;
  const summaryStrategy = buildSummaryStrategy(positioningFrame, priorities, fitBand);
  const resumeEmphasis = buildResumeEmphasis(priorities, selectedEvidence);
  const coverLetterThemes = buildCoverLetterThemes(positioningFrame, priorities, selectedEvidence);
  const suppressionNotes = evidenceSelection.suppressionNotes;
  const qualityPass = buildQualityPass({
    fitBand,
    positioningFrame,
    roleLens,
    selectedEvidence,
    suppressionNotes,
  });
  const documentQualityScore = computeDocumentQualityScore({
    fitBand,
    positioningFrame,
    selectedEvidence,
    suppressionNotes,
    qualityPass,
  });
  const basePlan: DocumentStrategyPlan = {
    fitScore: input.fitScore,
    fitBand,
    positioningFrame,
    roleLens,
    selectedEvidence,
    summaryStrategy,
    resumeEmphasis,
    coverLetterThemes,
    suppressionNotes,
    qualityPass,
    documentQualityScore,
  };

  return applyRefinementInstructions(input, basePlan, input.refinements ?? []);
}

export function buildDocumentStrategyPlanSummary(plan: DocumentStrategyPlan): DocumentStrategyPlanSummaryModel {
  return {
    positioning: plan.positioningFrame,
    emphasis: plan.resumeEmphasis.join(", "),
    coverLetter: plan.coverLetterThemes.join(" "),
    evidence: plan.selectedEvidence.map((item) => item.baselineSection).slice(0, 5),
    suppression: plan.suppressionNotes.slice(0, 3),
    quality: `Quality ${plan.documentQualityScore}/100; ${plan.qualityPass.framingStrength} framing, ${plan.qualityPass.emphasisConfidence} emphasis confidence.`,
  };
}
