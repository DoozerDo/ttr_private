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

export function evaluateBaselineTemplateReadiness(
  structured: StructuredBaseline,
): BaselineTemplateReadiness {
  const experience = Array.isArray(structured?.experience) ? structured.experience : [];
  const validExperience = experience.filter((entry) => {
    const company = String((entry as any)?.company ?? '').trim();
    const roleTitle = String((entry as any)?.roleTitle ?? '').trim();
    return isAllowedStructuredTemplateExperienceHeader({ company, roleTitle });
  });

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

  if (hasValidExperience) {
    return {
      canGenerateResume: true,
      canGenerateCoverLetter: true,
      hardBlockReasons: [],
      warnings:
        invalidCompanies.length || missingEvidenceReasons.length
          ? [
              {
                code: 'baseline_template_not_ready',
                message:
                  'Baseline contains some experience evidence that is not template-safe. Documents can be generated from the cleanest entries, but Fit Review is recommended to strengthen missing or malformed areas.',
                details: {
                  invalidCompanies,
                  missingEvidenceReasons,
                  ...stats,
                },
              },
            ]
          : [],
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
          'Baseline is not template-safe for generation because no clean experience entries were found.',
        details: {
          invalidCompanies,
          missingEvidenceReasons,
          ...stats,
        },
      },
    ],
    warnings: [],
    stats,
  };
}
