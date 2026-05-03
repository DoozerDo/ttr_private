import type { StructuredBaseline } from './structuredBaselineExtractor';
import { isAllowedStructuredTemplateExperienceHeader } from '../resume/resumeTemplateAssembler';

export type BaselineTemplateReadinessReason = {
  code: 'baseline_template_not_ready';
  message: string;
  details?: Record<string, unknown>;
};

export type BaselineTemplateReadiness = {
  canGenerateResume: boolean;
  canGenerateCoverLetter: boolean;
  hardBlockReasons: BaselineTemplateReadinessReason[];
  warnings: BaselineTemplateReadinessReason[];
  evidence: {
    threshold: 'insufficient' | 'usable' | 'strong';
    degraded: boolean;
    improvementSuggestions: string[];
  };
  stats: {
    totalExperience: number;
    validExperience: number;
    invalidExperience: number;
  };
};

function summarizeInvalidExperienceCompanies(experience: StructuredBaseline['experience']) {
  const invalid: Array<{ company: string; reason: string }> = [];
  for (const entry of experience ?? []) {
    const company = String(entry?.company ?? '').trim();
    const roleTitle = String((entry as any)?.roleTitle ?? '').trim();
    if (!company) {
      invalid.push({ company: company || '<empty>', reason: 'empty_company' });
      continue;
    }
    if (!isAllowedStructuredTemplateExperienceHeader({ company, roleTitle })) {
      invalid.push({ company, reason: 'unsafe_company_header' });
    }
  }
  return invalid.slice(0, 5);
}

function hasTechnicalSignals(structured: StructuredBaseline): boolean {
  const skills = Array.isArray(structured?.skills) ? structured.skills : [];
  if (skills.some((s) => String(s ?? '').trim().length > 0)) return true;

  const experience = Array.isArray(structured?.experience) ? structured.experience : [];
  const joined = experience
    .flatMap((entry) => Array.isArray((entry as any)?.bullets) ? (entry as any).bullets : [])
    .map((b) => String(b ?? ''))
    .join(' ')
    .toLowerCase();

  // Conservative keyword set: only used to avoid penalizing resumes that list technical signals
  // in bullets instead of a dedicated Skills section.
  return /\b(?:python|javascript|typescript|java|go|golang|c\+\+|c#|php|ruby|sql|postgres|mysql|mongodb|redis|aws|gcp|azure|docker|kubernetes|k8s|terraform|ansible|ci\/cd|github actions|jenkins|linux|dns|vpn|vlan|firewall|nginx|react|node)\b/.test(
    joined,
  );
}

function buildImprovementSuggestions(structured: StructuredBaseline): string[] {
  const suggestions: string[] = [];
  const experience = Array.isArray(structured?.experience) ? structured.experience : [];
  const skills = Array.isArray(structured?.skills) ? structured.skills : [];
  const bulletCount = experience.reduce(
    (sum, entry) => sum + (Array.isArray((entry as any)?.bullets) ? (entry as any).bullets.length : 0),
    0,
  );

  if (experience.length > 0 && bulletCount === 0) {
    suggestions.push('Add 2–4 responsibility/impact bullets under each role.');
  } else if (experience.length > 0 && bulletCount < Math.min(3, experience.length)) {
    suggestions.push('Add a few more bullets to clarify responsibilities and outcomes.');
  }

  if (!skills.some((s) => String(s ?? '').trim().length > 0)) {
    suggestions.push('Add a Skills section with key languages, tools, and systems.');
  }

  const allBullets = experience
    .flatMap((entry) => (Array.isArray((entry as any)?.bullets) ? (entry as any).bullets : []))
    .map((b) => String(b ?? ''));
  const hasQuantSignal = allBullets.some((b) => /\b\d+%|\b\d+\s*(?:x|X)\b|\b\d+\b/.test(b));
  if (experience.length > 0 && !hasQuantSignal) {
    suggestions.push('Add a few quantified outcomes where possible (scope, speed, reliability, cost, volume).');
  }

  return suggestions.slice(0, 6);
}

export function evaluateBaselineTemplateReadiness(
  structured: StructuredBaseline,
): BaselineTemplateReadiness {
  const experience = Array.isArray(structured?.experience) ? structured.experience : [];
  const validExperience = experience.filter((entry) => {
    const company = String((entry as any)?.company ?? '').trim();
    const roleTitle = String((entry as any)?.roleTitle ?? '').trim();
    return isAllowedStructuredTemplateExperienceHeader({ company, roleTitle });
  });

  const hasAnyExperience = experience.length > 0;
  const hasValidExperience = validExperience.length > 0;
  const invalidCompanies = summarizeInvalidExperienceCompanies(experience);
  const missingEvidenceReasons = Array.isArray(structured?.missingEvidenceReasons)
    ? structured.missingEvidenceReasons.slice(0, 5)
    : [];

  const stats = {
    totalExperience: experience.length,
    validExperience: validExperience.length,
    invalidExperience: Math.max(0, experience.length - validExperience.length),
  };

  const technicalSignalsPresent = hasTechnicalSignals(structured);
  const improvements = buildImprovementSuggestions(structured);

  const totalValidBullets = validExperience.reduce(
    (sum, entry) => sum + (Array.isArray((entry as any)?.bullets) ? (entry as any).bullets.length : 0),
    0,
  );

  const usableEvidenceThresholdMet =
    validExperience.length >= 2 &&
    (technicalSignalsPresent || totalValidBullets >= 3);

  const threshold: BaselineTemplateReadiness['evidence']['threshold'] =
    hasValidExperience && usableEvidenceThresholdMet ? 'strong' : hasValidExperience ? 'usable' : 'insufficient';

  // Degrade only when the baseline has experience headers but lacks the minimum signals needed
  // to ground generation confidently (not strictly normalized, but still usable).
  const degraded =
    hasValidExperience &&
    validExperience.length < 2 &&
    totalValidBullets < 2 &&
    !technicalSignalsPresent;

  if (hasValidExperience) {
    return {
      // Relaxed gating: allow generation whenever at least one valid experience entry exists.
      // Only hard-block when experience is completely missing or parsing produced no usable entries.
      canGenerateResume: true,
      canGenerateCoverLetter: true,
      hardBlockReasons: [],
      warnings: degraded
        ? [
            {
              code: 'baseline_template_not_ready',
              message:
                'Baseline evidence is usable but not fully normalized for template generation. Documents can be generated, but Fit Review is recommended to strengthen structure, clarity, and verifiability.',
              details: {
                invalidCompanies,
                missingEvidenceReasons,
                evidenceThreshold: threshold,
                degraded,
                technicalSignalsPresent,
                improvementSuggestions: improvements,
                ...stats,
              },
            },
          ]
        : [],
      evidence: {
        threshold,
        degraded,
        improvementSuggestions: improvements,
      },
      stats,
    };
  }

  return {
    canGenerateResume: false,
    canGenerateCoverLetter: false,
    hardBlockReasons: [
      {
        code: 'baseline_template_not_ready',
        message:
          'Baseline cannot be used for generation because no valid experience entries were found.',
        details: {
          invalidCompanies,
          missingEvidenceReasons,
          evidenceThreshold: 'insufficient',
          degraded: true,
          technicalSignalsPresent,
          improvementSuggestions: improvements,
          ...stats,
        },
      },
    ],
    warnings: [],
    evidence: {
      threshold: 'insufficient',
      degraded: true,
      improvementSuggestions: improvements,
    },
    stats,
  };
}
