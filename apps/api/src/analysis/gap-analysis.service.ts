import { Injectable } from '@nestjs/common';

export type CriticalGap = {
  gapId: string;
  title: string;
  description: string;
  severityScore: number;
  requirementEvidence: string;
  baselineEvidence: string | null;
  reasoning: string;
};

export type GapDebugCandidate = {
  text: string;
  normalized: string;
  categories: string[];
  score: number;
  decision: 'accepted' | 'rejected' | 'weak';
  rejectionReason?: string;
};

export type GapDebugTrace = {
  gapLabel: string;
  sourceRequirementText: string;
  normalizedRequirement: string;
  keywords: string[];
  assignedCategory: string | null;
  matchedEvidence: GapDebugCandidate[];
  rejectedEvidence: GapDebugCandidate[];
  suppressionReason?: string;
  finalDecision: 'gap' | 'matched' | 'weak_match';
  evidenceCategoryTrace: Array<{
    originalText: string;
    normalizedText: string;
    categories: string[];
    eligibleForMatching: boolean;
  }>;
};

export type InterviewRisk = {
  riskId: string;
  topic: string;
  whyTheyMayChallengeYou: string;
  howToAddressIt: string;
  exampleTalkingPoint: string;
};

export type GapAnalysisResult = {
  strengths: string[];
  criticalGaps: CriticalGap[];
  recommendedActions: string[];
  positioningSuggestions: string[];
  interviewRisks: InterviewRisk[];
  debug?: {
    enabled: boolean;
    appliedRules: string[];
    gapTraces: GapDebugTrace[];
    baselineSignalTrace: Array<{
      originalText: string;
      normalizedText: string;
      categories: string[];
      eligibleForMatching: boolean;
    }>;
    requirementTrace: Array<{
      originalText: string;
      normalizedText: string;
      keywords: string[];
      assignedCategory: string | null;
    }>;
  };
};

type AnalyzeGapInput = {
  baselineSections: Array<{ content: string }>;
  validatedRequirements?: string[] | null;
  jobRequirements?: string[] | null;
  jobResponsibilities?: string[] | null;
  dimensionPercents?: Record<string, number | undefined> | null;
  maxGaps?: number;
  debugMatching?: boolean;
};

type RequirementCandidate = {
  text: string;
  source: 'requirement' | 'responsibility';
};

type RequirementAssessment = {
  title: string;
  requirementEvidence: string;
  baselineEvidence: string | null;
  evidenceScore: number;
  relevanceScore: number;
  severity: number;
  importance: number;
  reasoning: string;
  finalDecision: 'gap' | 'matched' | 'weak_match';
  debug?: GapDebugTrace;
};

const STOP_WORDS = new Set([
  'about',
  'across',
  'after',
  'against',
  'also',
  'and',
  'are',
  'because',
  'been',
  'being',
  'between',
  'both',
  'from',
  'have',
  'having',
  'into',
  'over',
  'role',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'this',
  'those',
  'through',
  'under',
  'with',
  'within',
  'your',
  'years',
  'experience',
]);
const COMPENSATION_PATTERNS = [
  /\b(?:salary|compensation|pay|wage|bonus|equity|benefits)\b/i,
  /\$\s?\d/i,
  /\b(?:usd|eur|gbp)\b\s*\d/i,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|m)?\s*(?:-|to)\s*\$?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|m)?\b/i,
];
const GENERIC_COMPANY_BOILERPLATE_PATTERNS = [
  /\bglobal offices?\b/i,
  /\boffices?\s+across\b/i,
  /\bworldwide presence\b/i,
  /\bwe have offices\b/i,
  /\b(?:multi|cross)-region footprint\b/i,
  /\bdistributed across (?:countries|regions|continents)\b/i,
];
const LEGAL_OR_APPLICATION_BOILERPLATE_PATTERNS = [
  /\bequal opportunity employer\b/i,
  /\ball qualified applicants\b/i,
  /\bwithout regard to\b/i,
  /\bprotected (?:class|characteristic)\b/i,
  /\brace|religion|sex|gender identity|sexual orientation|national origin|veteran status|disability\b/i,
  /\breasonable accommodation\b/i,
  /\baccommodation (?:during|throughout) the application\b/i,
  /\bif you require an accommodation\b/i,
  /\bapplication process\b/i,
  /\bconsideration for employment\b/i,
  /\bwe are committed to (?:equal opportunity|diversity|inclusion)\b/i,
  /\be-?verify\b/i,
  /\bbackground check\b/i,
  /\bdrug screening\b/i,
  /\bwork authorization\b/i,
  /\bapply (?:today|now)\b/i,
];
const MAX_EVIDENCE_LENGTH = 180;
const EVIDENCE_ACTION_PATTERNS = [
  /\bled\b/i,
  /\bbuilt\b/i,
  /\bdesigned\b/i,
  /\bdeveloped\b/i,
  /\bdrove\b/i,
  /\bmanaged\b/i,
  /\bowned\b/i,
  /\bpartnered\b/i,
  /\boperated\b/i,
  /\bscaled\b/i,
  /\blaunched\b/i,
  /\bimplemented\b/i,
  /\bcreated\b/i,
  /\bdelivered\b/i,
  /\boverse(?:e|en)\b/i,
  /\bimproved\b/i,
  /\btransformed\b/i,
];
const BASELINE_BUZZWORD_PATTERNS = [
  /\bleadership(?:\s|,|$)/i,
  /\bteam building\b/i,
  /\binnovation evangelism\b/i,
  /\bexcellent communication\b/i,
  /\bstrategic thinking\b/i,
  /\bproblem solving\b/i,
  /\bself-starter\b/i,
];
const REQUIREMENT_FRAGMENT_PATTERNS = [
  /^(?:or\s+)?equivalent experience\.?$/i,
  /^proficient\.?$/i,
  /^qualifications\.?$/i,
  /^skills\.?$/i,
  /^requirements\.?$/i,
  /^experience\.?$/i,
  /^abilities\.?$/i,
  /^candidate\.?$/i,
  /^preferred\.?$/i,
  /^required\.?$/i,
  /^strong ability\.?$/i,
  /^excellent communication\.?$/i,
  /^communication skills\.?$/i,
];
const REQUIREMENT_SIGNAL_STOP_PHRASES = [
  /\bor equivalent experience\b/i,
  /\band\/or\b/i,
  /\bpreferred\b/i,
  /\bproficient\b/i,
  /\bstrong ability to\b/i,
  /\bability to\b/i,
];
const STRUCTURAL_REQUIREMENT_NOISE_PATTERNS = [
  /\bthis position\b/i,
  /\bthis role\b/i,
  /\bthe role\b/i,
  /\bthe candidate\b/i,
  /\bideal candidate\b/i,
  /\bwe are looking for\b/i,
  /\bwe're looking for\b/i,
  /\bthis opportunity\b/i,
  /\bposition will be\b/i,
  /\brole will be\b/i,
  /\bwill be open for\b/i,
  /\bresponsibilities?\s+include\b/i,
  /\bjob summary\b/i,
  /^\s*qualifications\s*:?\s*$/i,
  /^\s*skills\s*:?\s*$/i,
  /^\s*requirements\s*:?\s*$/i,
  /^\s*experience\s*:?\s*$/i,
  /^\s*abilities\s*:?\s*$/i,
  /^\s*candidate\s*:?\s*$/i,
];
const LOCATION_ONLY_PATTERNS = [
  /^\s*[a-z .'-]+,\s*[a-z]{2}(?:\s+\d{5})?\s*$/i,
  /^\s*remote(?:\s*-\s*[a-z .'-]+)?\s*$/i,
];
const GAP_REQUIREMENT_NOISE_PATTERNS = [
  ...LOCATION_ONLY_PATTERNS,
  /\b(?:salary|compensation|pay|wage|bonus|equity|benefits)\b/i,
  /\bequal opportunity employer\b/i,
  /\ball qualified applicants\b/i,
  /\breasonable accommodation\b/i,
  /\bapplication process\b/i,
  /\bbackground check\b/i,
  /\bwork authorization\b/i,
  /^\s*(?:or\s+)?equivalent experience\.?$/i,
  /^\s*proficient\.?$/i,
  /^\s*strong ability\.?$/i,
  /^\s*excellent communication\.?$/i,
  /^\s*entry[-\s]*level\b.*\bdesigner\b.*$/i,
  /^\s*entry[-\s]*level\b.*\bengineer\b.*$/i,
  /^\s*entry[-\s]*level\b.*\bmanager\b.*$/i,
];
const REQUIREMENT_NARRATIVE_PATTERNS = [
  /^\s*the\s+[a-z0-9][a-z0-9\s&/.-]{2,}\s+(?:team|group|org|organization|department)\s+is\s+on\s+a\s+mission\b/i,
  /^\s*we(?:'re| are)?\s+on\s+a\s+mission\b/i,
  /^\s*join\s+us\b/i,
  /^\s*about\s+the\s+(?:team|role|company)\b/i,
  /^\s*our\s+(?:team|company|group)\b/i,
  /^\s*the\s+(?:team|company|group)\s+(?:will|should|can|is)\b/i,
  /^\s*demonstrates\s+some\s+knowledge\s+of\b/i,
  /\b(?:build|own|lead|deliver|support|maintain)\s+the\s*$/i,
  /\b(?:and|or|to|for|of|in|with|on|at|by)\s*$/i,
  /\bknows?\s+what\s+data\s+is\b/i,
];
const ACRONYM_WORDS = new Set([
  'api',
  'apis',
  'ai',
  'os',
  'rtos',
  'sdk',
  'sdks',
  'crm',
  'qa',
  'kpi',
  'kpis',
  'sla',
  'slas',
  'cx',
  'saas',
  'b2b',
  'b2c',
  'ux',
  'ui',
]);
const PROPER_CASE_WORDS: Record<string, string> = {
  rust: 'Rust',
  python: 'Python',
  java: 'Java',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  zendesk: 'Zendesk',
  salesforce: 'Salesforce',
};

const GAP_CATEGORY_KEYWORDS: Array<{
  category: string;
  patterns: RegExp[];
}> = [
  {
    category: 'incident_management',
    patterns: [/\bincident\b/i, /\bmajor incident\b/i, /\bincident management\b/i],
  },
  {
    category: 'escalation_management',
    patterns: [/\bescalation\b/i, /\bescalation management\b/i],
  },
  {
    category: 'scope_scale',
    patterns: [/\bscope\b/i, /\bglobal\b/i, /\benterprise\b/i, /\bscale\b/i],
  },
  {
    category: 'leadership',
    patterns: [/\blead\b/i, /\bleadership\b/i, /\bmanager\b/i, /\bdirector\b/i],
  },
  {
    category: 'operations',
    patterns: [/\boperation\b/i, /\boperations\b/i, /\boperational\b/i],
  },
  {
    category: 'sla_kpi',
    patterns: [/\bsla\b/i, /\bkpi\b/i, /\bmetric\b/i, /\bmetrics\b/i],
  },
  {
    category: 'billing_ops',
    patterns: [/\bbilling\b/i, /\binvoice\b/i, /\brevenue\b/i, /\bcollections\b/i],
  },
  {
    category: 'automation',
    patterns: [/\bautomation\b/i, /\bautomate\b/i, /\bworkflow\b/i],
  },
  {
    category: 'tooling',
    patterns: [/\btooling\b/i, /\bplatform\b/i, /\bsystem\b/i, /\bsystems\b/i],
  },
  {
    category: 'support_routing',
    patterns: [/\bsupport\b/i, /\brouting\b/i, /\btriage\b/i, /\bqueue\b/i],
  },
];

const SPECIALIZED_ROLE_KEYWORDS = [
  'network',
  'networking',
  'infrastructure',
  'sre',
  'site reliability',
  'noc',
  'security',
  'cloud',
  'platform',
  'datacenter',
  'data center',
  'routing',
  'switch',
  'firewall',
  'juniper',
  'cisco',
  'arista',
  'mellanox',
  'bgp',
];
const GENERIC_SOFTWARE_SIGNAL_PATTERNS = [
  /\bportfolio\b/i,
  /\bwebsite\b/i,
  /\bweb(?:site| app| application)?\b/i,
  /\bfrontend\b/i,
  /\bfront-end\b/i,
  /\bui\b/i,
  /\bclient[-\s]?facing\b/i,
  /\bnon[-\s]?technical client\b/i,
];

@Injectable()
export class GapAnalysisService {
  validateRequirements(entries: string[] | null | undefined): string[] {
    return this.collectValidatedRequirements(entries).map((entry) => entry.text);
  }

  analyze(input: AnalyzeGapInput): GapAnalysisResult {
    const requirements = Array.isArray(input.validatedRequirements)
      ? this.collectValidatedRequirements(input.validatedRequirements)
      : this.collectRequirements(input);
    this.assertNoInvalidRequirementLeak(requirements, input);
    if (!requirements.length) {
      return {
        strengths: [],
        criticalGaps: [],
        recommendedActions: [],
        positioningSuggestions: [],
        interviewRisks: [],
        ...(input.debugMatching
          ? {
              debug: {
                enabled: true,
                appliedRules: [],
                gapTraces: [],
                baselineSignalTrace: [],
                requirementTrace: [],
              },
            }
          : {}),
      };
    }

    const baselineLines = this.collectBaselineLines(input.baselineSections ?? []);
    const baselineSignalTrace = baselineLines.map((line) => ({
      originalText: line,
      normalizedText: this.normalizeSignalKey(line),
      categories: this.assignCategories(line),
      eligibleForMatching: this.isDisplayableBaselineEvidence(line),
    }));
    const requirementTrace = requirements.map((candidate) => ({
      originalText: candidate.text,
      normalizedText: this.normalizeSignalKey(candidate.text),
      keywords: this.tokenize(candidate.text),
      assignedCategory: this.assignCategory(candidate.text),
    }));
    const baselineText = baselineLines.join('\n').toLowerCase();
    const evaluated = requirements
      .map((item) =>
        this.evaluateRequirement(
          item,
          baselineLines,
          baselineText,
          input.dimensionPercents ?? undefined,
        ),
      )
      .filter((entry): entry is RequirementAssessment => Boolean(entry));
    const dedupedEvaluated = this.dedupeAssessments(evaluated);
    const requirementDecisionMap = new Map(
      dedupedEvaluated.map((entry) => [this.buildRequirementDecisionKey(entry), entry.finalDecision]),
    );
    const uniqueStrengths = this.selectStrengthSignals(evaluated, 3);
    const normalizedStrengthSignals = new Set(
      uniqueStrengths.map((value) => this.normalizeSignalKey(value)),
    );

    const maxGaps = this.clampMaxGaps(input.maxGaps);
    const criticalGaps = [...dedupedEvaluated]
      .sort((a, b) => b.severity - a.severity)
      .filter((entry) => {
        if (entry.finalDecision === 'matched') {
          return false;
        }
        const normalizedTitle = this.normalizeSignalKey(entry.title);
        const normalizedRequirement = this.normalizeSignalKey(entry.requirementEvidence);
        if (!normalizedTitle && !normalizedRequirement) return false;
        return !(
          (normalizedTitle && normalizedStrengthSignals.has(normalizedTitle)) ||
          (normalizedRequirement && normalizedStrengthSignals.has(normalizedRequirement))
        );
      })
      .slice(0, maxGaps)
      .map((entry, index) => {
        const gapId = this.toGapId(entry.title, index);
        return {
          gapId,
          title: entry.title,
          description: `Evidence for "${entry.title}" is weaker than what this role emphasizes.`,
          severityScore: Number(entry.severity.toFixed(3)),
          requirementEvidence: entry.requirementEvidence,
          baselineEvidence: entry.baselineEvidence,
          reasoning: entry.reasoning,
        };
      });

    const positioningSuggestions = criticalGaps.slice(0, 3).map((gap) =>
      this.buildPositioningSuggestion(gap),
    );
    const recommendedActions = positioningSuggestions;

    const interviewRisks = criticalGaps.slice(0, 3).map((gap, index) => ({
      riskId: `risk-${index + 1}`,
      topic: gap.title,
      whyTheyMayChallengeYou: `The role explicitly emphasizes: ${this.shorten(
        gap.requirementEvidence,
        120,
      )}`,
      howToAddressIt:
        gap.baselineEvidence && gap.baselineEvidence.trim().length
          ? `Frame transferable evidence from your baseline, such as "${this.shorten(
              gap.baselineEvidence,
              110,
            )}", and connect it to the requirement.`
          : 'Acknowledge the gap directly, then describe adjacent verified experience and your approach to ramp quickly.',
      exampleTalkingPoint: `How I would apply my verified experience to ${gap.title.toLowerCase()} in this role.`,
    }));

    return {
      strengths: uniqueStrengths,
      criticalGaps,
      recommendedActions,
      positioningSuggestions,
      interviewRisks,
      ...(input.debugMatching
        ? {
            debug: {
              enabled: true,
              appliedRules: [
                'requirement_normalization',
                'baseline_signal_assignment',
                'semantic_matching',
                'gap_selection',
              ],
              gapTraces: evaluated
                .filter((entry) => Boolean(entry.debug))
                .map((entry) => {
                  const debug = entry.debug as GapDebugTrace;
                  const promotedToStrength =
                    normalizedStrengthSignals.has(
                      this.normalizeSignalKey(entry.title),
                    ) ||
                    normalizedStrengthSignals.has(
                      this.normalizeSignalKey(entry.requirementEvidence),
                    );
                  return {
                    ...debug,
                    promotedToStrength,
                    gapEligible: entry.finalDecision !== 'matched',
                    suppressionReason:
                      entry.finalDecision === 'matched'
                        ? 'matched_requirement'
                        : debug.suppressionReason,
                    requirementDecision:
                      requirementDecisionMap.get(this.buildRequirementDecisionKey(entry)) ??
                      entry.finalDecision,
                  } as GapDebugTrace & {
                    promotedToStrength: boolean;
                    gapEligible: boolean;
                    requirementDecision: 'gap' | 'matched' | 'weak_match';
                  };
                }),
              baselineSignalTrace,
              requirementTrace,
            },
          }
        : {}),
    };
  }

  private dedupeAssessments(
    assessments: RequirementAssessment[],
  ): RequirementAssessment[] {
    const unique: RequirementAssessment[] = [];
    const seen = new Set<string>();

    for (const assessment of assessments) {
      const key = [
        assessment.title.toLowerCase(),
        assessment.requirementEvidence.toLowerCase(),
        (assessment.baselineEvidence ?? '').toLowerCase(),
      ].join('|');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(assessment);
    }

    return unique;
  }

  private clampMaxGaps(value?: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
    return Math.max(3, Math.min(5, Math.floor(value)));
  }

  private collectRequirements(input: AnalyzeGapInput): RequirementCandidate[] {
    if (Array.isArray(input.validatedRequirements)) {
      return input.validatedRequirements
        .map((entry) => this.normalizeRequirementCandidate(entry))
        .filter((entry): entry is string => Boolean(entry))
        .filter((entry) => this.isValidRequirementCandidate(entry))
        .map((text) => ({ text, source: 'requirement' }));
    }

    const raw: RequirementCandidate[] = [];

    for (const entry of input.jobRequirements ?? []) {
      const text = this.normalizeRequirementCandidate(entry);
      if (!text) continue;
      if (this.isCompensationText(text)) continue;
      if (this.isLegalOrApplicationBoilerplate(text)) continue;
      raw.push({ text, source: 'requirement' });
    }

    for (const entry of input.jobResponsibilities ?? []) {
      const text = this.normalizeRequirementCandidate(entry);
      if (!text) continue;
      if (this.isCompensationText(text)) continue;
      if (this.isLegalOrApplicationBoilerplate(text)) continue;
      raw.push({ text, source: 'responsibility' });
    }

    const seen = new Set<string>();
    const deduped: RequirementCandidate[] = [];
    for (const item of raw) {
      const key = item.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!this.isValidRequirementCandidate(item.text)) continue;
      deduped.push(item);
    }
    return deduped;
  }

  private collectValidatedRequirements(entries: string[] | null | undefined): RequirementCandidate[] {
    const raw = (entries ?? [])
      .map((entry) => this.normalizeRequirementCandidate(entry))
      .filter((entry): entry is string => Boolean(entry))
      .filter((entry) => this.isValidRequirementCandidate(entry))
      .map((text) => ({ text, source: 'requirement' as const }));

    const seen = new Set<string>();
    const deduped: RequirementCandidate[] = [];
    for (const item of raw) {
      const key = item.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  }

  private isValidRequirementCandidate(value: string): boolean {
    const text = this.clean(value);
    if (!text) return false;
    if (text.length < 12) return false;
    if (GAP_REQUIREMENT_NOISE_PATTERNS.some((pattern) => pattern.test(text))) return false;
    if (REQUIREMENT_NARRATIVE_PATTERNS.some((pattern) => pattern.test(text))) return false;
    if (this.isCompensationText(text)) return false;
    if (this.isLegalOrApplicationBoilerplate(text)) return false;
    if (this.isGenericCompanyBoilerplate(text)) return false;
    if (this.isStructuralRequirementNoise(text)) return false;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return false;
    if (!/[a-z]/i.test(text) || !/\b[a-z]{3,}\b/i.test(text)) return false;
    return true;
  }

  private assertNoInvalidRequirementLeak(
    validatedRequirements: RequirementCandidate[],
    input: AnalyzeGapInput,
  ): void {
    const legacyInputs = [...(input.jobRequirements ?? []), ...(input.jobResponsibilities ?? [])];
    if (!legacyInputs.length) return;
    const invalid = legacyInputs
      .map((entry) => this.normalizeRequirementCandidate(entry))
      .filter((entry): entry is string => Boolean(entry))
      .filter((entry) => !this.isValidRequirementCandidate(entry));
    if (!invalid.length) return;
    const leaked = invalid.find((candidate) =>
      validatedRequirements.some((validated) => validated.text.toLowerCase() === candidate.toLowerCase()),
    );
    if (leaked && process.env.NODE_ENV !== 'production') {
      throw new Error(`Invalid requirement leaked into validatedRequirements: ${leaked}`);
    }
  }

  private collectBaselineLines(
    sections: Array<{ content: string }>,
  ): string[] {
    const lines: string[] = [];
    for (const section of sections) {
      const rawContent = section?.content ?? '';
      if (!this.clean(rawContent)) continue;
      for (const line of rawContent.split(/\r?\n+/)) {
        const cleaned = this.clean(line);
        if (cleaned) lines.push(cleaned);
      }
    }
    return lines;
  }

  private normalizeRequirementCandidate(value?: string | null): string | null {
    const text = this.clean(value);
    if (!text) return null;
    if (this.isRequirementFragmentNoise(text)) return null;
    if (this.isStructuralRequirementNoise(text)) return null;
    return text;
  }

  private selectStrengthSignals(
    assessments: RequirementAssessment[],
    maxCount: number,
  ): string[] {
    const selected: string[] = [];
    const selectedKeys: string[] = [];
    const isSpecializedRole = this.isSpecializedInfrastructureRole(assessments);

    const candidates = assessments
      .filter(
        (entry) =>
          entry.finalDecision === 'matched' &&
          entry.evidenceScore >= (isSpecializedRole ? 0.48 : 0.5) &&
          entry.relevanceScore >= 0.45 &&
          entry.importance >= (isSpecializedRole ? 0.42 : 0.45) &&
          typeof entry.baselineEvidence === 'string' &&
          entry.baselineEvidence.trim().length > 0 &&
          this.isDisplayableBaselineEvidence(entry.baselineEvidence),
      )
      .sort((a, b) => {
        if (isSpecializedRole) {
          const aSpecialized = this.getSpecializedSignalScore(a.baselineEvidence ?? '');
          const bSpecialized = this.getSpecializedSignalScore(b.baselineEvidence ?? '');
          if (bSpecialized !== aSpecialized) return bSpecialized - aSpecialized;
        }
        if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
        return b.evidenceScore - a.evidenceScore;
      });

    for (const entry of candidates) {
      const signal = this.toCompactEvidence(entry.baselineEvidence!, MAX_EVIDENCE_LENGTH);
      if (!signal) continue;
      const normalized = this.normalizeSignalKey(signal);
      if (!normalized) continue;
      if (
        isSpecializedRole &&
        this.isGenericSoftwareSignal(signal) &&
        !this.hasSpecializedRoleOverlap(signal, signal)
      ) {
        continue;
      }
      if (selectedKeys.some((key) => this.signalsOverlap(key, normalized))) continue;
      selected.push(signal);
      selectedKeys.push(normalized);
      if (selected.length >= maxCount) break;
    }

    return selected;
  }

  private evaluateRequirement(
    candidate: RequirementCandidate,
    baselineLines: string[],
    baselineText: string,
    dimensionPercents?: Record<string, number | undefined>,
  ): RequirementAssessment | null {
    const req = candidate.text;
    if (this.isCompensationText(req)) return null;
    const tokens = this.tokenize(req).slice(0, 20);
    if (!tokens.length) return null;
    const assignedCategory = this.assignCategory(req);
    const requirementKeywords = tokens;

    const matchedTokens = tokens.filter((token) =>
      baselineText.includes(token),
    );
    const tokenCoverage = matchedTokens.length / tokens.length;
    const baselineCandidates = this.buildBaselineCandidates(
      tokens,
      baselineLines,
      assignedCategory,
    );
    const baselineEvidence =
      baselineCandidates.find((candidate) => candidate.decision === 'accepted')
        ?.text ?? this.findBestEvidence(tokens, baselineLines);
    const evidenceScore = this.estimateEvidenceScore(tokenCoverage, baselineEvidence);
    const dimensionKey = this.inferDimensionKey(req);
    const specializedRole = this.isSpecializedInfrastructureRoleText(req);

    const sourceWeight = candidate.source === 'requirement' ? 0.9 : 0.75;
    const keywordBoost = this.keywordBoost(req);
    const dimensionBoost = this.dimensionBoost(dimensionKey, dimensionPercents);
    const boilerplatePenalty = this.isGenericCompanyBoilerplate(req) ? 0.25 : 0;
    const importance = Math.max(
      0.2,
      Math.min(1, sourceWeight + keywordBoost + dimensionBoost - boilerplatePenalty),
    );
    const severity = Math.max(
      0,
      Math.min(1, Number((importance - evidenceScore).toFixed(4))),
    );
    const relevanceScore = Number((evidenceScore * 0.72 + importance * 0.28).toFixed(4));

    const title = this.inferTitle(req, dimensionKey);
    const compactRequirementEvidence = this.toCompactEvidence(
      req,
      MAX_EVIDENCE_LENGTH,
    );
    const compactBaselineEvidence = baselineEvidence
      ? this.toCompactEvidence(baselineEvidence, MAX_EVIDENCE_LENGTH)
      : null;
    const finalDecision: RequirementAssessment['finalDecision'] =
      evidenceScore >= 0.5
        ? 'matched'
        : evidenceScore >= 0.35
          ? 'weak_match'
          : 'gap';
    const reasoning = compactBaselineEvidence
      ? `The requirement is important for this role, but baseline evidence is partial. Closest evidence: "${this.shorten(
          compactBaselineEvidence,
          120,
        )}".`
      : 'The requirement is emphasized by the role but no direct baseline evidence was found.';

    const debug: GapDebugTrace | undefined = baselineCandidates.length
      ? {
          gapLabel: title,
          sourceRequirementText: req,
          normalizedRequirement: this.normalizeSignalKey(req),
          keywords: requirementKeywords,
          assignedCategory,
          matchedEvidence: baselineCandidates.filter(
            (candidate) => candidate.decision === 'accepted',
          ),
          rejectedEvidence: baselineCandidates.filter(
            (candidate) => candidate.decision !== 'accepted',
          ),
          suppressionReason: baselineCandidates.find(
            (candidate) => candidate.decision !== 'accepted',
          )?.rejectionReason,
          finalDecision,
          evidenceCategoryTrace: baselineCandidates.map((candidate) => ({
            originalText: candidate.text,
            normalizedText: candidate.normalized,
            categories: candidate.categories,
            eligibleForMatching: candidate.decision === 'accepted',
          })),
        }
      : {
          gapLabel: title,
          sourceRequirementText: req,
          normalizedRequirement: this.normalizeSignalKey(req),
          keywords: requirementKeywords,
          assignedCategory,
          matchedEvidence: [],
          rejectedEvidence: [],
          finalDecision,
          evidenceCategoryTrace: [],
        };

    return {
      title,
      requirementEvidence: compactRequirementEvidence,
      baselineEvidence: compactBaselineEvidence,
      evidenceScore,
      relevanceScore,
      severity,
      importance,
      reasoning,
      finalDecision,
      debug,
    };
  }

  private estimateEvidenceScore(tokenCoverage: number, baselineEvidence: string | null): number {
    const boundedCoverage = Math.max(0, Math.min(1, tokenCoverage));
    if (!baselineEvidence) {
      return Number((boundedCoverage * 0.25).toFixed(4));
    }

    // Presence of a concrete baseline excerpt increases confidence, but does not
    // fully eliminate the gap unless token overlap is also strong.
    return Math.max(
      0,
      Math.min(1, Number((boundedCoverage * 0.75 + 0.2).toFixed(4))),
    );
  }

  private tokenize(text: string): string[] {
    const tokens =
      text
        .toLowerCase()
        .match(/[a-z0-9][a-z0-9+#.\-/]*/g)
        ?.map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)) ?? [];
    return Array.from(new Set(tokens));
  }

  private findBestEvidence(tokens: string[], baselineLines: string[]): string | null {
    let bestLine: string | null = null;
    let bestScore = 0;

    for (const line of baselineLines) {
      const lineLower = line.toLowerCase();
      let overlap = 0;
      for (const token of tokens) {
        if (lineLower.includes(token)) {
          overlap += 1;
        }
      }
      if (overlap > bestScore) {
        bestScore = overlap;
        bestLine = line;
      }
    }

    return bestScore > 0 ? bestLine : null;
  }

  private inferDimensionKey(text: string): string | null {
    const normalized = text.toLowerCase();
    if (/(manager|director|head|leadership|own|strategy|senior)/.test(normalized)) {
      return 'role_scope_and_seniority';
    }
    if (/(operations|process|kpi|sla|qa|workflow|root cause)/.test(normalized)) {
      return 'support_operations_and_process_rigor';
    }
    if (/(tool|platform|system|zendesk|salesforce|automation|ai|crm)/.test(normalized)) {
      return 'tooling_and_platform_experience';
    }
    if (/(industry|domain|billing|compliance|saas|subscription|fintech)/.test(normalized)) {
      return 'domain_and_business_context';
    }
    if (/(change|transform|cross-functional|customer|advocacy)/.test(normalized)) {
      return 'change_leadership_and_customer_advocacy';
    }
    return null;
  }

  private inferTitle(requirement: string, dimensionKey: string | null): string {
    const phraseTitle = this.extractRequirementSignal(requirement);
    if (phraseTitle) {
      return phraseTitle;
    }
    return this.toTitleFromRequirement(requirement);
  }

  private isSpecializedInfrastructureRole(assessments: RequirementAssessment[]): boolean {
    const text = assessments
      .map((assessment) => `${assessment.title} ${assessment.requirementEvidence} ${assessment.baselineEvidence ?? ''}`)
      .join(' ')
      .toLowerCase();
    return SPECIALIZED_ROLE_KEYWORDS.some((keyword) => text.includes(keyword));
  }

  private isSpecializedInfrastructureRoleText(text: string): boolean {
    const normalized = this.clean(text).toLowerCase();
    return SPECIALIZED_ROLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  private getSpecializedSignalScore(text: string): number {
    const normalized = this.clean(text).toLowerCase();
    if (!normalized) return 0;
    return SPECIALIZED_ROLE_KEYWORDS.reduce(
      (score, keyword) => score + (normalized.includes(keyword) ? 1 : 0),
      0,
    );
  }

  private hasSpecializedRoleOverlap(signal: string, requirement: string): boolean {
    const combined = `${signal} ${requirement}`.toLowerCase();
    return SPECIALIZED_ROLE_KEYWORDS.some((keyword) => combined.includes(keyword));
  }

  private isGenericSoftwareSignal(text: string): boolean {
    const normalized = this.clean(text);
    if (!normalized) return false;
    return GENERIC_SOFTWARE_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  private assignCategory(text: string): string | null {
    const normalized = this.clean(text).toLowerCase();
    if (!normalized) return null;
    for (const group of GAP_CATEGORY_KEYWORDS) {
      if (group.patterns.some((pattern) => pattern.test(normalized))) {
        return group.category;
      }
    }
    return null;
  }

  private assignCategories(text: string): string[] {
    const normalized = this.clean(text).toLowerCase();
    if (!normalized) return [];
    return GAP_CATEGORY_KEYWORDS.filter((group) =>
      group.patterns.some((pattern) => pattern.test(normalized)),
    ).map((group) => group.category);
  }

  private buildBaselineCandidates(
    tokens: string[],
    baselineLines: string[],
    assignedCategory: string | null,
  ): GapDebugCandidate[] {
    const results: GapDebugCandidate[] = [];
    for (const line of baselineLines) {
      const normalized = this.normalizeSignalKey(line);
      const categories = this.assignCategories(line);
      const overlap = tokens.filter((token) => normalized.includes(token)).length;
      const score = tokens.length ? overlap / tokens.length : 0;
      const categoryOverlap =
        assignedCategory && categories.includes(assignedCategory);
      const hasCategorySupport = categories.length > 0;
      const eligibleForMatching = this.isDisplayableBaselineEvidence(line);

      let decision: GapDebugCandidate['decision'] = 'rejected';
      let rejectionReason: string | undefined = 'low lexical overlap';
      if (!eligibleForMatching) {
        rejectionReason = 'noisy evidence';
      } else if (score >= 0.7 || (score >= 0.5 && categoryOverlap)) {
        decision = 'accepted';
        rejectionReason = undefined;
      } else if (score >= 0.35 || categoryOverlap || hasCategorySupport) {
        decision = 'weak';
        rejectionReason =
          score >= 0.35 ? 'score below cutoff' : 'below semantic threshold';
      } else if (!categories.length) {
        rejectionReason = 'heading_only';
      } else if (!overlap) {
        rejectionReason = 'duplicate concept';
      }

      results.push({
        text: line,
        normalized,
        categories,
        score: Number(score.toFixed(3)),
        decision,
        rejectionReason,
      });
    }

    return results
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
  }

  private extractRequirementSignal(text: string): string {
    const compact = this.clean(text);
    if (!compact) return '';
    const proficiencyMatch = compact.match(/^proficien(?:t|cy)\s+in\s+(.+)$/i);
    if (proficiencyMatch?.[1]) {
      return this.toSentenceCasePreservingAcronyms(`experience with ${proficiencyMatch[1]}`);
    }

    const normalized = compact
      .replace(/^[•-]\s*/, '')
      .replace(/^(?:or|and\/or)\s+/i, '')
      .replace(
        /^(?:must\s+have|required|preferred|experience\s+with|experience\s+in|ability\s+to|proven\s+ability\s+to|demonstrated\s+ability\s+to|track\s+record\s+of|strong)\s+/i,
        '',
      )
      .replace(
        /^(?:own|lead|build|design|develop|drive|manage|support|oversee|deliver|partner\s+with|collaborate\s+with)\s+/i,
        '',
      )
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[,;:]+$/g, '')
      .trim();

    const withoutStopPhrases = REQUIREMENT_SIGNAL_STOP_PHRASES.reduce(
      (current, pattern) => current.replace(pattern, ' '),
      normalized,
    )
      .replace(/\s+/g, ' ')
      .replace(/\b(?:in|with|across|for)\b.*$/i, '')
      .trim();

    if (!withoutStopPhrases || this.isRequirementFragmentNoise(withoutStopPhrases)) {
      return this.toTitleFromRequirement(compact);
    }

    const words = withoutStopPhrases.split(/\s+/).slice(0, 10);
    return this.toSentenceCasePreservingAcronyms(words.join(' '));
  }

  private toTitleFromRequirement(text: string): string {
    const compact = this.clean(text);
    if (!compact) return 'Role Requirement Coverage';
    const words = compact.split(/\s+/).slice(0, 8);
    return this.toSentenceCasePreservingAcronyms(words.join(' '));
  }

  private keywordBoost(text: string): number {
    const normalized = text.toLowerCase();
    let boost = 0;
    if (/(must|required|expert|own|lead)/.test(normalized)) boost += 0.08;
    if (/(ai|automation|platform|tooling|systems)/.test(normalized)) boost += 0.08;
    if (/(executive|strategy|transform)/.test(normalized)) boost += 0.06;
    return Math.min(0.2, boost);
  }

  private dimensionBoost(
    dimensionKey: string | null,
    dimensionPercents?: Record<string, number | undefined>,
  ): number {
    if (!dimensionKey || !dimensionPercents) return 0;
    const score = dimensionPercents[dimensionKey];
    if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
    const normalized = Math.max(0, Math.min(100, score));
    return ((100 - normalized) / 100) * 0.15;
  }

  private toGapId(title: string, index: number): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    return slug ? `${slug}_${index + 1}` : `gap_${index + 1}`;
  }

  private clean(value?: string | null): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private normalizeSignalKey(value?: string | null): string {
    return this.clean(value)
      .toLowerCase()
      .replace(/^[^a-z0-9]+/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private signalsOverlap(left: string, right: string): boolean {
    if (left === right) return true;
    if (left.includes(right) || right.includes(left)) return true;
    const leftTokens = new Set(left.split(' '));
    const rightTokens = new Set(right.split(' '));
    const shared = [...leftTokens].filter((token) => rightTokens.has(token));
    const smallest = Math.min(leftTokens.size, rightTokens.size);
    return smallest > 0 && shared.length / smallest >= 0.7;
  }

  private isDisplayableBaselineEvidence(value: string): boolean {
    const text = this.clean(value);
    if (!text) return false;
    if (text.length < 12) return false;
    if (BASELINE_BUZZWORD_PATTERNS.some((pattern) => pattern.test(text))) {
      return EVIDENCE_ACTION_PATTERNS.some((pattern) => pattern.test(text));
    }
    return EVIDENCE_ACTION_PATTERNS.some((pattern) => pattern.test(text));
  }

  private isRequirementFragmentNoise(value: string): boolean {
    const text = this.clean(value);
    if (!text) return true;
    if (REQUIREMENT_FRAGMENT_PATTERNS.some((pattern) => pattern.test(text))) {
      return true;
    }

    const normalized = text
      .toLowerCase()
      .replace(/^[•-]\s*/, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return true;

    const tokens = normalized.split(' ');
    const meaninglessTokens = new Set([
      'or',
      'and',
      'and/or',
      'equivalent',
      'experience',
      'qualifications',
      'skills',
      'requirements',
      'abilities',
      'candidate',
      'proficient',
      'preferred',
      'required',
      'strong',
      'ability',
      'excellent',
      'communication',
      'skills',
    ]);

    if (tokens.every((token) => meaninglessTokens.has(token))) {
      return true;
    }

    return tokens.length <= 2 && tokens.every((token) => meaninglessTokens.has(token));
  }

  private isStructuralRequirementNoise(value: string): boolean {
    const text = this.clean(value);
    if (!text) return true;
    return STRUCTURAL_REQUIREMENT_NOISE_PATTERNS.some((pattern) => pattern.test(text));
  }

  private buildPositioningSuggestion(gap: CriticalGap): string {
    const target = this.clean(gap.title).toLowerCase();
    const baselineEvidence = this.clean(gap.baselineEvidence);
    if (baselineEvidence) {
      return `Use "${this.shorten(baselineEvidence, 90)}" to frame adjacent evidence against ${target}.`;
    }

    return `Add a concrete example that shows adjacent experience relevant to ${target}.`;
  }

  private isCompensationText(value: string): boolean {
    const text = this.clean(value);
    if (!text) return false;
    return COMPENSATION_PATTERNS.some((pattern) => pattern.test(text));
  }

  private isGenericCompanyBoilerplate(value: string): boolean {
    const text = this.clean(value);
    if (!text) return false;
    return GENERIC_COMPANY_BOILERPLATE_PATTERNS.some((pattern) =>
      pattern.test(text),
    );
  }

  private buildRequirementDecisionKey(entry: RequirementAssessment): string {
    return [
      this.normalizeSignalKey(entry.title),
      this.normalizeSignalKey(entry.requirementEvidence),
      this.normalizeSignalKey(entry.baselineEvidence ?? ''),
    ].join('|');
  }

  private isLegalOrApplicationBoilerplate(value: string): boolean {
    const text = this.clean(value);
    if (!text) return false;
    return LEGAL_OR_APPLICATION_BOILERPLATE_PATTERNS.some((pattern) =>
      pattern.test(text),
    );
  }

  private toCompactEvidence(value: string, max: number): string {
    const compact = this.clean(value);
    if (!compact) return '';
    const sentences = compact.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ?? [];
    const firstCompleteSentence = sentences.find((sentence) => sentence.length > 0);
    if (firstCompleteSentence) {
      return firstCompleteSentence.length <= max
        ? firstCompleteSentence
        : this.trimAtWordBoundary(firstCompleteSentence, max, true);
    }

    const clause = compact.split(/\s*[;:]\s*/)[0]?.trim() ?? compact;
    if (clause.length <= max) {
      return this.ensureTerminalPunctuation(clause);
    }
    return this.trimAtWordBoundary(clause, max, true);
  }

  private shorten(value: string, max: number): string {
    const trimmed = this.clean(value);
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 3).trim()}...`;
  }

  private trimAtWordBoundary(value: string, max: number, preservePunctuation = false): string {
    const trimmed = this.clean(value);
    if (trimmed.length <= max) {
      return preservePunctuation ? this.ensureTerminalPunctuation(trimmed) : trimmed;
    }

    const window = trimmed.slice(0, max);
    const cut = window.lastIndexOf(' ');
    const bounded = (cut > 20 ? window.slice(0, cut) : window).trim().replace(/[,:;/-]+$/, '');
    return preservePunctuation ? this.ensureTerminalPunctuation(bounded) : bounded;
  }

  private ensureTerminalPunctuation(value: string): string {
    const trimmed = this.clean(value).replace(/[,:;]+$/, '');
    if (!trimmed) return '';
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  private toSentenceCasePreservingAcronyms(value: string): string {
    const compact = this.clean(value);
    if (!compact) return '';
    const lower = compact.toLowerCase();
    const tokens = lower.split(/(\s+|\/|-|,|\(|\))/);
    let isFirstWord = true;

    return tokens
      .map((token) => {
        if (!/[a-z0-9]/i.test(token)) return token;
        const bare = token.replace(/[^a-z0-9']/gi, '');
        const normalizedBare = bare.toLowerCase();
        if (!normalizedBare) return token;
        if (ACRONYM_WORDS.has(normalizedBare)) {
          isFirstWord = false;
          return token.replace(new RegExp(bare, 'i'), bare.toUpperCase());
        }
        if (PROPER_CASE_WORDS[normalizedBare]) {
          isFirstWord = false;
          return token.replace(new RegExp(bare, 'i'), PROPER_CASE_WORDS[normalizedBare]);
        }

        const replacement = isFirstWord
          ? normalizedBare.charAt(0).toUpperCase() + normalizedBare.slice(1)
          : normalizedBare;
        isFirstWord = false;
        return token.replace(new RegExp(bare, 'i'), replacement);
      })
      .join('');
  }
}


