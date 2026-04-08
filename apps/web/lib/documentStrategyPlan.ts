export type DocumentStrategyFitBand = "strong" | "moderate" | "borderline" | null;

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
};

export type DocumentStrategyPlanSummaryModel = {
  positioning: string;
  emphasis: string;
  evidence: string[];
  suppression: string[];
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
    frame: "Incident and service delivery leader",
    keywords: ["incident", "outage", "triage", "service delivery", "reliability", "sla"],
  },
  {
    frame: "Customer Operations / Support Strategy leader",
    keywords: ["support", "customer operations", "customer success", "service", "cx", "workflow"],
  },
  {
    frame: "Support transformation leader",
    keywords: ["transformation", "change", "migration", "scale", "rollout", "adoption"],
  },
  {
    frame: "CX operations builder",
    keywords: ["operations", "process", "workflow", "systems", "architecture", "tooling"],
  },
  {
    frame: "Cross-functional operations leader",
    keywords: ["cross-functional", "stakeholder", "partner", "coordination", "engineering", "product"],
  },
];

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
    return "Incident and service delivery leader";
  }
  if (/\b(support|customer operations|customer success|customer service|cx)\b/i.test(corpus)) {
    return "Customer Operations / Support Strategy leader";
  }
  if (/\b(change|transformation|migration|rollout|adoption|scale)\b/i.test(corpus)) {
    return "Support transformation leader";
  }
  if (/\b(process|workflow|system|architecture|tooling)\b/i.test(corpus)) {
    return "CX operations builder";
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
  return signalScore * 3 + corpusOverlap;
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
  const selectedEvidence = selected.map(({ section, sectionText, index }) => {
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

  return {
    fitScore: input.fitScore,
    fitBand,
    positioningFrame,
    roleLens,
    selectedEvidence,
    summaryStrategy,
    resumeEmphasis,
    coverLetterThemes,
    suppressionNotes,
  };
}

export function buildDocumentStrategyPlanSummary(plan: DocumentStrategyPlan): DocumentStrategyPlanSummaryModel {
  return {
    positioning: plan.positioningFrame,
    emphasis: plan.resumeEmphasis.join(", "),
    evidence: plan.selectedEvidence.map((item) => item.baselineSection).slice(0, 5),
    suppression: plan.suppressionNotes.slice(0, 3),
  };
}
