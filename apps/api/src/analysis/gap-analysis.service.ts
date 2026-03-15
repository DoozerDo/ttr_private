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
};

type AnalyzeGapInput = {
  baselineSections: Array<{ content: string }>;
  jobRequirements?: string[] | null;
  jobResponsibilities?: string[] | null;
  dimensionPercents?: Record<string, number | undefined> | null;
  maxGaps?: number;
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

@Injectable()
export class GapAnalysisService {
  analyze(input: AnalyzeGapInput): GapAnalysisResult {
    const requirements = this.collectRequirements(input);
    if (!requirements.length) {
      return {
        strengths: [],
        criticalGaps: [],
        recommendedActions: [],
        positioningSuggestions: [],
        interviewRisks: [],
      };
    }

    const baselineLines = this.collectBaselineLines(input.baselineSections ?? []);
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

    const uniqueStrengths = this.selectStrengthSignals(evaluated, 3);
    const normalizedStrengthSignals = new Set(
      uniqueStrengths.map((value) => this.normalizeSignalKey(value)),
    );

    const maxGaps = this.clampMaxGaps(input.maxGaps);
    const criticalGaps = [...dedupedEvaluated]
      .sort((a, b) => b.severity - a.severity)
      .filter((entry) => {
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
      deduped.push(item);
    }
    return deduped;
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

    const candidates = assessments
      .filter(
        (entry) =>
          entry.evidenceScore >= 0.5 &&
          entry.importance >= 0.45 &&
          typeof entry.baselineEvidence === 'string' &&
          entry.baselineEvidence.trim().length > 0 &&
          this.isDisplayableBaselineEvidence(entry.baselineEvidence),
      )
      .sort((a, b) => {
        if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
        return b.evidenceScore - a.evidenceScore;
      });

    for (const entry of candidates) {
      const signal = this.toCompactEvidence(entry.baselineEvidence!, MAX_EVIDENCE_LENGTH);
      if (!signal) continue;
      const normalized = this.normalizeSignalKey(signal);
      if (!normalized) continue;
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

    const matchedTokens = tokens.filter((token) =>
      baselineText.includes(token),
    );
    const tokenCoverage = matchedTokens.length / tokens.length;
    const baselineEvidence = this.findBestEvidence(tokens, baselineLines);
    const evidenceScore = this.estimateEvidenceScore(tokenCoverage, baselineEvidence);
    const dimensionKey = this.inferDimensionKey(req);

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
    const reasoning = compactBaselineEvidence
      ? `The requirement is important for this role, but baseline evidence is partial. Closest evidence: "${this.shorten(
          compactBaselineEvidence,
          120,
        )}".`
      : 'The requirement is emphasized by the role but no direct baseline evidence was found.';

    return {
      title,
      requirementEvidence: compactRequirementEvidence,
      baselineEvidence: compactBaselineEvidence,
      evidenceScore,
      relevanceScore,
      severity,
      importance,
      reasoning,
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

  private extractRequirementSignal(text: string): string {
    const compact = this.clean(text);
    if (!compact) return '';
    const proficiencyMatch = compact.match(/^proficien(?:t|cy)\s+in\s+(.+)$/i);
    if (proficiencyMatch?.[1]) {
      return this.toSentenceCasePreservingAcronyms(`experience with ${proficiencyMatch[1]}`);
    }

    const normalized = compact
      .replace(/^[•\-]\s*/, '')
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
      .replace(/^[•\-]\s*/, '')
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


