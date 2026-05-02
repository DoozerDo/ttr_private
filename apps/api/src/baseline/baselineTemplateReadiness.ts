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
  reasons: BaselineTemplateReadinessReason[];
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
  if (hasValidExperience) {
    return {
      canGenerateResume: true,
      canGenerateCoverLetter: true,
      reasons: [],
    };
  }

  const invalidCompanies = summarizeInvalidExperienceCompanies(experience);
  const missingEvidenceReasons = Array.isArray(structured?.missingEvidenceReasons)
    ? structured.missingEvidenceReasons.slice(0, 5)
    : [];

  return {
    canGenerateResume: false,
    canGenerateCoverLetter: false,
    reasons: [
      {
        code: 'baseline_template_not_ready',
        message:
          'Baseline is usable for scoring but is not template-safe for generation. Review and correct baseline experience headers.',
        details: {
          invalidCompanies,
          missingEvidenceReasons,
          totalExperience: experience.length,
          validExperience: validExperience.length,
        },
      },
    ],
  };
}
