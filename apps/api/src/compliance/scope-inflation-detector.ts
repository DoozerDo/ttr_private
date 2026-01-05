import { BaselineSectionType } from '../baseline/baseline-section.entity';
import {
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from './compliance.types';

type ScopeCategory = 'seniority' | 'ownership' | 'scale';

type Fingerprint = {
  cues: Record<ScopeCategory, Set<string>>;
  evidence: Record<ScopeCategory, Map<string, string>>;
};

type SectionShape = { content?: string | null; title?: string | null; sectionType?: string };

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
      for (const [category, cues] of Object.entries(SCOPE_CUES) as [ScopeCategory, string[]][]) {
        for (const cue of cues) {
          if (normalized.includes(cue)) {
            fingerprint.cues[category].add(cue);
            if (!fingerprint.evidence[category].has(cue)) {
              fingerprint.evidence[category].set(cue, this.extractSnippet(text, cue));
            }
          }
        }
      }
    }

    return fingerprint;
  }

  private gatherCues(
    section: { content?: string | null; title?: string | null },
  ): Array<{ category: ScopeCategory; cue: string; snippet: string }> {
    const text = `${section.title ?? ''} ${section.content ?? ''}`.trim();
    if (!text) return [];
    const normalized = this.normalize(text);

    const matches: Array<{ category: ScopeCategory; cue: string; snippet: string }> = [];

    for (const [category, cues] of Object.entries(SCOPE_CUES) as [ScopeCategory, string[]][]) {
      for (const cue of cues) {
        if (normalized.includes(cue)) {
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

  detect(
    baselineSections: SectionShape[],
    generatedSections: Array<{ title?: string | null; content?: string | null }>,
  ): ComplianceFlag[] {
    const baselineFingerprint = this.buildFingerprint(baselineSections ?? []);
    const violations: Array<{
      category: ScopeCategory;
      cue: string;
      generated: string;
      baseline: string;
    }> = [];

    for (const section of generatedSections ?? []) {
      const cues = this.gatherCues(section);
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
      (violation) => CATEGORY_SEVERITY[violation.category] === ComplianceFlagSeverity.BLOCK,
    );

    const severity = hasBlocking ? ComplianceFlagSeverity.BLOCK : ComplianceFlagSeverity.WARN;

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
      },
    ];
  }
}
