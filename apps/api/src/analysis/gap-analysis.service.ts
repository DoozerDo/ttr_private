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

@Injectable()
export class GapAnalysisService {
  analyze(input: AnalyzeGapInput): GapAnalysisResult {
    const requirements = this.collectRequirements(input);
    if (!requirements.length) {
      return {
        strengths: [],
        criticalGaps: [],
        recommendedActions: [],
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

    const uniqueStrengths = Array.from(
      new Set(
        evaluated
          .filter((entry) => entry.evidenceScore >= 0.62 && entry.importance >= 0.6)
          .sort((a, b) => b.evidenceScore - a.evidenceScore)
          .map((entry) => entry.title),
      ),
    ).slice(0, 4);

    const maxGaps = this.clampMaxGaps(input.maxGaps);
    const criticalGaps = [...dedupedEvaluated]
      .sort((a, b) => b.severity - a.severity)
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

    const recommendedActions = criticalGaps.slice(0, 3).map((gap) => {
      const requirement = this.shorten(gap.requirementEvidence, 110);
      return `Strengthen "${gap.title}" by anchoring verified examples to: ${requirement}`;
    });

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
      const text = this.clean(entry);
      if (!text) continue;
      if (this.isCompensationText(text)) continue;
      if (this.isLegalOrApplicationBoilerplate(text)) continue;
      raw.push({ text, source: 'requirement' });
    }

    for (const entry of input.jobResponsibilities ?? []) {
      const text = this.clean(entry);
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
      const content = this.clean(section?.content);
      if (!content) continue;
      for (const line of content.split(/\n+/)) {
        const cleaned = this.clean(line);
        if (cleaned) lines.push(cleaned);
      }
    }
    return lines;
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
    switch (dimensionKey) {
      case 'role_scope_and_seniority':
        return 'Leadership Scope and Seniority';
      case 'support_operations_and_process_rigor':
        return 'Support Operations and Process Rigor';
      case 'tooling_and_platform_experience':
        return 'Tooling and Platform Experience';
      case 'domain_and_business_context':
        return 'Domain and Business Context';
      case 'change_leadership_and_customer_advocacy':
        return 'Change Leadership and Customer Advocacy';
      default:
        return this.toTitleFromRequirement(requirement);
    }
  }

  private toTitleFromRequirement(text: string): string {
    const compact = this.clean(text);
    if (!compact) return 'Role Requirement Coverage';
    const words = compact.split(/\s+/).slice(0, 6);
    const title = words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    return title;
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
    const sentences = compact
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const firstSentence = sentences[0] ?? compact;
    if (firstSentence.length <= max) {
      return firstSentence;
    }
    return this.shorten(firstSentence, max);
  }

  private shorten(value: string, max: number): string {
    const trimmed = this.clean(value);
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 3).trim()}...`;
  }
}


