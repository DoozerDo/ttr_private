import { BaselineSectionType } from '../baseline/baseline-section.entity';
import {
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
  DocumentType,
  JobApplicationContext,
  GeneratedTextSourceType,
  ComplianceTextSection,
} from './compliance.types';
import { extractClaimUnitsFromSections } from './claim-units';
import { findBestSemanticEvidenceMatch } from './semantic-evidence';

type SectionShape = {
  content?: string | null;
  title?: string | null;
  sectionType?: string;
};

type ScopeEvidence = {
  text: string;
  normalized: string;
  snippet: string;
  hasExtremeScale: boolean;
};

type ScopeClaim = {
  text: string;
  normalized: string;
  snippet: string;
  hasExtremeScale: boolean;
};

type ScopeViolation = {
  generated: string;
  baseline: string;
  similarity: number;
  reason: 'no_semantic_support' | 'extreme_scale_without_baseline_match';
};

type ScopeSignalClass =
  | 'leadership'
  | 'responsibility'
  | 'scale'
  | 'quantitative';

type DetectorOptions = {
  embeddingProvider?: (text: string) => Promise<number[] | null>;
  similarityThreshold?: number;
};

const DEFAULT_SIMILARITY_THRESHOLD = 0.75;
const APPLICATION_SCOPE_WINDOW = 400;
const APPLICATION_SCOPE_PHRASE_DISTANCE = 120;
const APPLICATION_SCOPE_PATTERNS = [
  /\bi am (?:writing to )?(?:excited to )?apply(?:ing)? for\b/,
  /\bi am interested in (?:the )?(?:role|position|opportunity|job)\b/,
  /\bthis role aligns with my\b/,
];

const SCOPE_VERBS = [
  'led',
  'owned',
  'managed',
  'directed',
  'oversaw',
  'built',
  'ran',
  'headed',
];

const ORGANIZATIONAL_SIGNALS = [
  'team',
  'staff',
  'department',
  'organization',
  'global',
  'program',
  'initiative',
  'engineers',
  'devices',
  'labs',
];

const EXTREME_SCALE_PATTERNS: RegExp[] = [
  /\bglobal\b.*\borganization\b/i,
  /\bcompany-wide\b/i,
  /\benterprise-wide\b/i,
  /\bthousands of employees\b/i,
  /\bthousands\b/i,
  /\b\d+\s*(?:thousand|k)\b/i,
];

const SCALE_COUNT_PATTERN = /\b\d+\s*(?:engineers?|staff|devices?|labs?)\b/i;
const LEADERSHIP_VERB_PATTERN =
  /\b(?:led|managed|directed|oversaw|headed|owned|built|ran|executed|implemented|delivered)\b/i;
const RESPONSIBILITY_VERB_PATTERN =
  /\b(?:responsible for|accountable for|drove|supported|coordinated|operated|maintained|administered)\b/i;
const SCALE_INDICATOR_PATTERN =
  /\b(?:team|staff|department|organization|group|program|initiative|vendors?|devices?|systems?|labs?|infrastructure|environment|platform)\b/i;
const QUANTITATIVE_INDICATOR_PATTERN =
  /\b(?:\d[\d,]*(?:\.\d+)?%|\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion|devices?|systems?|engineers?|staff|labs?|vendors?)|budget|budgets|headcount|team size|count)\b/i;

export class ScopeInflationDetector {
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/\r\n?/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractSnippet(text: string): string {
    const trimmed = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return '';
    return trimmed.length <= 220 ? trimmed : `${trimmed.slice(0, 217).trim()}...`;
  }

  private hasScopeVerb(normalized: string): boolean {
    return SCOPE_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(normalized));
  }

  private hasScaleSignal(normalized: string): boolean {
    return (
      ORGANIZATIONAL_SIGNALS.some((signal) =>
        new RegExp(`\\b${signal}\\b`, 'i').test(normalized),
      ) || SCALE_COUNT_PATTERN.test(normalized)
    );
  }

  private hasExtremeScaleSignal(normalized: string): boolean {
    return EXTREME_SCALE_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  private matchedSignalClasses(normalized: string): Set<ScopeSignalClass> {
    const classes = new Set<ScopeSignalClass>();
    if (LEADERSHIP_VERB_PATTERN.test(normalized)) {
      classes.add('leadership');
    }
    if (RESPONSIBILITY_VERB_PATTERN.test(normalized)) {
      classes.add('responsibility');
    }
    if (SCALE_INDICATOR_PATTERN.test(normalized)) {
      classes.add('scale');
    }
    if (QUANTITATIVE_INDICATOR_PATTERN.test(normalized)) {
      classes.add('quantitative');
    }
    return classes;
  }

  private shouldSkipCueDueToJobContext(
    normalized: string,
    jobContext?: JobApplicationContext,
  ): boolean {
    if (!jobContext?.allowedRoleTitles?.length) {
      return false;
    }
    const window = normalized.slice(0, APPLICATION_SCOPE_WINDOW);

    for (const pattern of APPLICATION_SCOPE_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(window);
      if (!match) continue;
      const afterMatch = match.index + match[0].length;
      if (window.length - afterMatch <= APPLICATION_SCOPE_PHRASE_DISTANCE) {
        return true;
      }
    }

    return false;
  }

  private gatherBaselineEvidence(sections: SectionShape[]): ScopeEvidence[] {
    const relevantSections = sections.filter((section) => {
      const type = section.sectionType as BaselineSectionType | undefined;
      if (!type) return true;
      return [
        BaselineSectionType.EXPERIENCE,
        BaselineSectionType.PROJECT,
        BaselineSectionType.SUMMARY,
      ].includes(type);
    });

    const evidence: ScopeEvidence[] = [];
    const complianceSections: ComplianceTextSection[] = relevantSections.map(
      (section) => ({
        title: section.title,
        content: section.content,
        sectionType: section.sectionType,
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
      }),
    );
    const baselineUnits = extractClaimUnitsFromSections(complianceSections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
    });

    for (const unit of baselineUnits) {
      const statement = unit.text;
        const normalized = this.normalize(statement);
        if (!normalized) continue;
        const signalClasses = this.matchedSignalClasses(normalized);
        if (signalClasses.size < 2) {
          continue;
        }
        evidence.push({
          text: statement,
          normalized,
          snippet: this.extractSnippet(statement),
          hasExtremeScale: this.hasExtremeScaleSignal(normalized),
        });
    }

    return evidence;
  }

  private gatherGeneratedScopeClaims(
    sections: Array<{ title?: string | null; content?: string | null }>,
    jobContext?: JobApplicationContext,
  ): ScopeClaim[] {
    const claims: ScopeClaim[] = [];
    const complianceSections: ComplianceTextSection[] = (sections ?? []).map(
      (section) => ({
        title: section.title,
        content: section.content,
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
      }),
    );
    const claimUnits = extractClaimUnitsFromSections(complianceSections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
    });

    for (const unit of claimUnits) {
      const statement = unit.text;
        const normalized = this.normalize(statement);
        if (!normalized) continue;
        if (this.shouldSkipCueDueToJobContext(normalized, jobContext)) continue;
        if (!(this.hasScopeVerb(normalized) && this.hasScaleSignal(normalized))) {
          continue;
        }
        claims.push({
          text: statement,
          normalized,
          snippet: this.extractSnippet(statement),
          hasExtremeScale: this.hasExtremeScaleSignal(normalized),
        });
    }
    return claims;
  }

  async detect(
    baselineSections: SectionShape[],
    generatedSections: Array<{
      title?: string | null;
      content?: string | null;
    }>,
    jobContext?: JobApplicationContext,
    documentType?: DocumentType,
    options?: DetectorOptions,
  ): Promise<ComplianceFlag[]> {
    void documentType;
    const similarityThreshold =
      options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
    const baselineEvidence = this.gatherBaselineEvidence(baselineSections ?? []);
    const baselineHasExtremeScale = baselineEvidence.some(
      (evidence) => evidence.hasExtremeScale,
    );

    const claims = this.gatherGeneratedScopeClaims(
      generatedSections ?? [],
      jobContext,
    );
    if (process.env.COMPLIANCE_TRACE === 'true') {
      console.debug(
        '[scope-inflation-trace]',
        JSON.stringify({
          baselineScopeCandidateCount: baselineEvidence.length,
        }),
      );
    }
    if (!claims.length) {
      return [];
    }

    const violations: ScopeViolation[] = [];
    for (const claim of claims) {
      const similarityMatch = await findBestSemanticEvidenceMatch(
        claim.text,
        baselineEvidence.map((evidence) => evidence.text),
        {
          embeddingProvider: options?.embeddingProvider,
          topK: 3,
        },
      );
      const similaritySupported =
        similarityMatch.bestSimilarity >= similarityThreshold;
      if (process.env.COMPLIANCE_TRACE === 'true') {
        console.debug(
          '[scope-inflation-trace]',
          JSON.stringify({
            claim: claim.snippet,
            claimType: 'scope_leadership',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
            integrityResult: 'pass',
            evidenceCandidateCount: baselineEvidence.length,
            bestSimilarity: Number(similarityMatch.bestSimilarity.toFixed(3)),
            bestBaselineMatch: similarityMatch.bestEvidenceText,
            topSimilarityScores: similarityMatch.topMatches.map((match) => ({
              similarity: Number(match.similarity.toFixed(3)),
              baseline: match.text,
            })),
          }),
        );
      }
      if (similaritySupported) {
        continue;
      }

      const extremeUnsupported = claim.hasExtremeScale && !baselineHasExtremeScale;
      violations.push({
        generated: claim.snippet,
        baseline: similarityMatch.bestEvidenceText,
        similarity: similarityMatch.bestSimilarity,
        reason: extremeUnsupported
          ? 'extreme_scale_without_baseline_match'
          : 'no_semantic_support',
      });
    }

    if (!violations.length) {
      return [];
    }

    const hasBlocking = violations.some(
      (violation) =>
        violation.reason === 'extreme_scale_without_baseline_match',
    );

    const evidence = violations.map((violation) => ({
      baseline: violation.baseline,
      generated: violation.generated,
      similarity: Number(violation.similarity.toFixed(3)),
      reason: violation.reason,
    }));

    return [
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: hasBlocking
          ? ComplianceFlagSeverity.BLOCK
          : ComplianceFlagSeverity.WARN,
        message: hasBlocking
          ? 'Potential scope inflation exceeds baseline scope.'
          : 'Potential scope inflation cues need review against baseline.',
        evidence,
        confidence: hasBlocking ? 0.9 : 0.58,
      },
    ];
  }
}
