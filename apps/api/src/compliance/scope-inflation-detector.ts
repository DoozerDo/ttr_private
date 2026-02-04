import { BaselineSectionType } from '../baseline/baseline-section.entity';
import {
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
  DocumentType,
  JobApplicationContext,
} from './compliance.types';

type ScopeCategory = 'seniority' | 'ownership' | 'scale';

type Fingerprint = {
  cues: Record<ScopeCategory, Set<string>>;
  evidence: Record<ScopeCategory, Map<string, string>>;
};

type SectionShape = {
  content?: string | null;
  title?: string | null;
  sectionType?: string;
};

const SCOPE_CUES: Record<ScopeCategory, string[]> = {
  seniority: [
    'director',
    'executive director',
    'senior director',
    'vp',
    'vice president',
    'svp',
    'evp',
    'chief',
    'cto',
    'ceo',
    'cpo',
    'head of',
    'principal',
    'executive',
    'global head',
    'senior vice president',
  ],
  ownership: [
    'owned',
    'led',
    'architected',
    'built',
    'drove',
    'managed',
    'spearheaded',
    'transformed',
    'accountable for',
    'responsible for',
    'oversaw',
    'directed',
    'created',
    'launched',
    'delivered',
    'implemented',
  ],
  scale: [
    'global',
    'worldwide',
    'multi-region',
    'multi region',
    'multi-regional',
    'company-wide',
    'enterprise',
    'enterprise-wide',
    'nationwide',
    'country-wide',
    'thousands',
    'millions',
    'billions',
  ],
};

const CATEGORY_SEVERITY: Record<ScopeCategory, ComplianceFlagSeverity> = {
  seniority: ComplianceFlagSeverity.BLOCK,
  scale: ComplianceFlagSeverity.BLOCK,
  ownership: ComplianceFlagSeverity.WARN,
};

const APPLICATION_SCOPE_WINDOW = 400;
const APPLICATION_SCOPE_PHRASE_DISTANCE = 120;
const APPLICATION_SCOPE_PATTERNS = [
  /\bi am (?:writing to )?(?:excited to )?apply(?:ing)? for\b/,
  /\bi am interested in (?:the )?(?:role|position|opportunity|job)\b/,
  /\bthis role aligns with my\b/,
];

export class ScopeInflationDetector {
  private normalize(text: string) {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private extractSnippet(text: string, cue: string) {
    const lower = text.toLowerCase();
    const index = lower.indexOf(cue);
    if (index === -1) {
      return text.slice(0, 200).trim();
    }

    const start = Math.max(0, index - 60);
    const end = Math.min(text.length, index + cue.length + 60);
    return text.slice(start, end).trim();
  }

  private buildFingerprint(sections: SectionShape[]): Fingerprint {
    const fingerprint: Fingerprint = {
      cues: {
        seniority: new Set<string>(),
        ownership: new Set<string>(),
        scale: new Set<string>(),
      },
      evidence: {
        seniority: new Map<string, string>(),
        ownership: new Map<string, string>(),
        scale: new Map<string, string>(),
      },
    };

    const relevantSections = sections.filter((section) => {
      const type = section.sectionType as BaselineSectionType | undefined;
      if (!type) return true;
      return [
        BaselineSectionType.EXPERIENCE,
        BaselineSectionType.PROJECT,
        BaselineSectionType.SUMMARY,
        BaselineSectionType.SKILLS,
      ].includes(type);
    });

    for (const section of relevantSections) {
      const text = `${section.title ?? ''} ${section.content ?? ''}`.trim();
      if (!text) continue;

      const normalized = this.normalize(text);
      for (const [category, cues] of Object.entries(SCOPE_CUES) as [
        ScopeCategory,
        string[],
      ][]) {
        for (const cue of cues) {
          if (normalized.includes(cue)) {
            fingerprint.cues[category].add(cue);
            if (!fingerprint.evidence[category].has(cue)) {
              fingerprint.evidence[category].set(
                cue,
                this.extractSnippet(text, cue),
              );
            }
          }
        }
      }
    }

    return fingerprint;
  }

  private gatherCues(
    section: {
      content?: string | null;
      title?: string | null;
    },
    jobContext?: JobApplicationContext,
  ): Array<{ category: ScopeCategory; cue: string; snippet: string }> {
    const text = `${section.title ?? ''} ${section.content ?? ''}`.trim();
    if (!text) return [];
    const normalized = this.normalize(text);

    const matches: Array<{
      category: ScopeCategory;
      cue: string;
      snippet: string;
    }> = [];

    for (const [category, cues] of Object.entries(SCOPE_CUES) as [
      ScopeCategory,
      string[],
    ][]) {
      for (const cue of cues) {
        if (
          normalized.includes(cue) &&
          !this.isApplyingSentence(normalized, cue, jobContext)
        ) {
          matches.push({
            category,
            cue,
            snippet: this.extractSnippet(text, cue),
          });
        }
      }
    }

    return matches;
  }

  private shouldSkipCueDueToJobContext(
    normalized: string,
    cue: string,
    jobContext?: JobApplicationContext,
  ): boolean {
    if (!jobContext?.allowedRoleTitles?.length) {
      return false;
    }
    const lowerCue = cue.toLowerCase();
    const window = normalized.slice(0, APPLICATION_SCOPE_WINDOW);
    const candidateIndex = window.indexOf(lowerCue);
    if (candidateIndex === -1) {
      return false;
    }

    for (const pattern of APPLICATION_SCOPE_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(window);
      if (!match) {
        continue;
      }

      const afterMatch = match.index + match[0].length;
      if (
        candidateIndex >= afterMatch &&
        candidateIndex - afterMatch <= APPLICATION_SCOPE_PHRASE_DISTANCE
      ) {
        return true;
      }
    }

    return false;
  }

  private isApplyingSentence(
    normalized: string,
    cue: string,
    jobContext?: JobApplicationContext,
  ): boolean {
    const pattern = /\bi am (?:excited to )?apply(?:ing)? for\b/;
    const match = pattern.exec(normalized);
    if (match) {
      const start = match.index + match[0].length;
      const remainder = normalized.slice(start);
      if (remainder.includes(cue.toLowerCase())) {
        return true;
      }
    }

    return this.shouldSkipCueDueToJobContext(normalized, cue, jobContext);
  }

  detect(
    baselineSections: SectionShape[],
    generatedSections: Array<{
      title?: string | null;
      content?: string | null;
    }>,
    jobContext?: JobApplicationContext,
    documentType?: DocumentType,
  ): ComplianceFlag[] {
    const baselineFingerprint = this.buildFingerprint(baselineSections ?? []);
    void documentType;
    const violations: Array<{
      category: ScopeCategory;
      cue: string;
      generated: string;
      baseline: string;
    }> = [];

    for (const section of generatedSections ?? []) {
      const cues = this.gatherCues(section, jobContext);
      for (const cue of cues) {
        if (!baselineFingerprint.cues[cue.category].has(cue.cue)) {
          const baselineEvidence =
            baselineFingerprint.evidence[cue.category].get(cue.cue) ??
            'Baseline has no matching scope evidence.';
          violations.push({
            category: cue.category,
            cue: cue.cue,
            generated: cue.snippet,
            baseline: baselineEvidence,
          });
        }
      }
    }

    if (!violations.length) return [];

    const hasBlocking = violations.some(
      (violation) =>
        CATEGORY_SEVERITY[violation.category] === ComplianceFlagSeverity.BLOCK,
    );

    const severity = hasBlocking
      ? ComplianceFlagSeverity.BLOCK
      : ComplianceFlagSeverity.WARN;
    const confidence = hasBlocking ? 0.92 : 0.45;

    const evidence = violations.map((violation) => ({
      baseline: violation.baseline,
      generated: violation.generated,
    }));

    return [
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity,
        message: hasBlocking
          ? 'Potential scope inflation exceeds baseline scope.'
          : 'Potential scope inflation cues need review against baseline.',
        evidence,
        confidence,
      },
    ];
  }
}
