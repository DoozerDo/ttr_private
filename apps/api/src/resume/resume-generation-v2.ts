import { UnprocessableEntityException } from '@nestjs/common';
import type { BaselineSection } from '../baseline/baseline-section.entity';
import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import {
  assembleResumeFromStructuredBaseline,
  isAllowedStructuredTemplateExperienceHeader,
  type ResumeTemplateIdentityLike,
} from './resumeTemplateAssembler';
import { validateNormalizedResumeDocument } from './resume-normalization';
import {
  validateResumeArtifactQualityStrict,
  type ArtifactQualityGate,
} from '../artifacts/artifactQualityValidator';

export const RESUME_GENERATION_V2_FEATURE_FLAG = 'RESUME_GENERATION_V2';

export type ResumeGenerationV2Result = {
  normalized: NormalizedResumeDocument;
  qualityGate: ArtifactQualityGate;
};

type NormalizedResumeValidationFailure = {
  path: string;
  field: string;
  value: unknown;
  message: string;
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function buildNormalizedResumeValidationFailures(
  document: NormalizedResumeDocument,
): NormalizedResumeValidationFailure[] {
  const failures: NormalizedResumeValidationFailure[] = [];

  if (!trimToText(document.heading?.name)) {
    failures.push({
      path: 'heading.name',
      field: 'name',
      value: document.heading?.name,
      message: 'Missing heading name.',
    });
  }

  const contactTokens = trimToText(document.heading?.contactLine)
    .split('|')
    .map((token) => trimToText(token))
    .filter(Boolean);
  const dedupeContact = new Set<string>();
  for (const token of contactTokens) {
    const phoneDigits = token.replace(/\D/g, '');
    const key = phoneDigits.length === 10 ? `phone:${phoneDigits}` : `text:${token.toLowerCase()}`;
    if (dedupeContact.has(key)) {
      failures.push({
        path: 'heading.contactLine',
        field: 'contactLine',
        value: document.heading?.contactLine,
        message: 'Duplicate contact token detected.',
      });
      break;
    }
    dedupeContact.add(key);
  }

  for (let index = 0; index < (document.experience ?? []).length; index++) {
    const entry = document.experience[index] as any;
    const company = trimToText(entry?.company);
    const roleTitle = trimToText(entry?.roleTitle);
    const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]) : [];

    if (!company) {
      failures.push({
        path: `experience[${index}].company`,
        field: 'company',
        value: entry?.company,
        message: 'Missing company.',
      });
    } else if (/^company$/i.test(company)) {
      failures.push({
        path: `experience[${index}].company`,
        field: 'company',
        value: entry?.company,
        message: 'Company is a placeholder value.',
      });
    }

    if (!roleTitle) {
      failures.push({
        path: `experience[${index}].roleTitle`,
        field: 'roleTitle',
        value: entry?.roleTitle,
        message: 'Missing role title.',
      });
    }

    if (bullets.length === 0) {
      failures.push({
        path: `experience[${index}].bullets`,
        field: 'bullets',
        value: entry?.bullets,
        message: 'Experience entry has no bullets.',
      });
      continue;
    }

    for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex++) {
      const bullet = trimToText(bullets[bulletIndex]);
      if (!bullet) {
        failures.push({
          path: `experience[${index}].bullets[${bulletIndex}]`,
          field: 'bullets',
          value: bullets[bulletIndex],
          message: 'Experience bullet is empty.',
        });
        continue;
      }
      if (bullet.length > 420) {
        failures.push({
          path: `experience[${index}].bullets[${bulletIndex}]`,
          field: 'bullets',
          value: bullets[bulletIndex],
          message: 'Experience bullet is too long.',
        });
      }
      const pipeCount = (bullet.match(/[|]/g) ?? []).length;
      if (pipeCount >= 6) {
        failures.push({
          path: `experience[${index}].bullets[${bulletIndex}]`,
          field: 'bullets',
          value: bullets[bulletIndex],
          message: 'Experience bullet contains too many pipe separators.',
        });
      }
    }
  }

  for (let index = 0; index < (document.education ?? []).length; index++) {
    const entry = (document.education as any)[index];
    const institution = trimToText(entry?.institution);
    if (!institution) {
      failures.push({
        path: `education[${index}].institution`,
        field: 'institution',
        value: entry?.institution,
        message: 'Education institution is missing.',
      });
    }
  }

  return failures;
}

function buildFallbackSummaryFromExperience(
  experience: Array<{ bullets?: unknown }>,
): string {
  const bulletCandidates = experience
    .flatMap((entry) =>
      Array.isArray((entry as any)?.bullets) ? ((entry as any).bullets as unknown[]) : [],
    )
    .map((bullet) => trimToText(bullet))
    .filter(Boolean)
    .filter((bullet) => bullet.length >= 12);
  return bulletCandidates.slice(0, 2).join(' ');
}

function hasUnmatchedClosingParen(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  const open = (text.match(/\(/g) ?? []).length;
  const close = (text.match(/\)/g) ?? []).length;
  return close > open;
}

function containsProjectFragmentTerms(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  return /\b(?:vue|react|frontend|back\s*end|backend|builder)\b/i.test(text);
}

function isKnownGarbageCompanyPlaceholder(value: string): boolean {
  const text = trimToText(value);
  if (!text) return true;
  const normalized = text.toLowerCase();
  if (normalized === 'experience entry needs correction') return true;

  // Block section-heading-like company candidates that frequently leak from baseline parsing.
  const bannedExact = new Set([
    'automation & monitoring',
    'internal web applications',
    'datacenter operations',
  ]);
  if (bannedExact.has(normalized)) return true;

  // Block obvious heading tokens.
  if (/\b(?:professional\s+experience|experience|projects|skills|education|summary)\b/i.test(text)) {
    return true;
  }

  return false;
}

function looksLikeCompanyWithEmbeddedDateRange(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  // e.g. "OfficeDepot October 2014 - November 2016"
  const month =
    '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const pattern = new RegExp(`\\b${month}\\s+(?:19|20)\\d{2}\\b\\s*[-–—]\\s*\\b${month}\\s+(?:19|20)\\d{2}\\b`, 'i');
  return pattern.test(text);
}

function looksLikeProjectDescription(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;

  const hasComma = text.includes(',');
  const tokenCount = text.split(/\s+/).filter(Boolean).length;
  const hasActionVerbish =
    /\b(?:built|designed|implemented|developed|created|shipped|led|owned)\b/i.test(text);
  const hasLowercaseHeavy = /[a-z].*[a-z].*[a-z].*[a-z]/.test(text) && !/[A-Z]{2,}/.test(text);

  // Heuristics: company names are typically short-ish, rarely comma-separated fragments, and do not
  // look like an activity/prose description.
  if (hasComma && tokenCount >= 4) return true;
  if (hasActionVerbish && tokenCount >= 4) return true;
  if (tokenCount >= 10 && hasLowercaseHeavy) return true;

  return false;
}

function validateCompanyCandidate(company: string): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const text = trimToText(company);
  if (!text) return { ok: false, reasons: ['company:missing'] };

  if (isKnownGarbageCompanyPlaceholder(text)) {
    reasons.push('company:known_garbage_placeholder');
  }
  if (hasUnmatchedClosingParen(text)) {
    reasons.push('company:unmatched_closing_paren');
  }
  if (containsProjectFragmentTerms(text)) {
    reasons.push('company:project_fragment_terms');
  }
  if (looksLikeCompanyWithEmbeddedDateRange(text)) {
    reasons.push('company:embedded_date_range');
  }
  if (looksLikeProjectDescription(text)) {
    reasons.push('company:looks_like_project_description');
  }

  return reasons.length ? { ok: false, reasons } : { ok: true };
}

function extractCompanyCandidatesFromExperienceText(rawExperienceText: string): string[] {
  const text = String(rawExperienceText ?? '');
  if (!text.trim()) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => String(line ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const line of lines) {
    if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) continue;

    if (line.includes('|')) {
      const company = trimToText(line.split('|')[0]);
      if (company) candidates.push(company);
      continue;
    }

    const dashParts = line.split(/\s[—-]\s/).map((part) => trimToText(part)).filter(Boolean);
    if (dashParts.length >= 2) {
      const company = dashParts[0] ?? '';
      if (company) candidates.push(company);
      continue;
    }
  }

  return Array.from(new Set(candidates));
}

function buildCompanyRejectionDiagnostics(company: string): string[] {
  const check = validateCompanyCandidate(company);
  if (check.ok) return [];
  return check.reasons.map((reason) => `company_candidate:${reason}:${company}`);
}

function buildInvalidExperienceReasons(input: {
  company: unknown;
  roleTitle: unknown;
  bullets?: unknown;
  index: number;
}): string[] {
  const reasons: string[] = [];
  const company = trimToText(input.company);
  const roleTitle = trimToText(input.roleTitle);
  const bullets = Array.isArray(input.bullets) ? (input.bullets as unknown[]) : [];
  const hasAtLeastOneBullet = bullets.map((b) => trimToText(b)).some(Boolean);

  if (!company) reasons.push(`experience[${input.index}].company:missing`);
  if (!roleTitle) reasons.push(`experience[${input.index}].roleTitle:missing`);
  if (!hasAtLeastOneBullet) reasons.push(`experience[${input.index}].bullets:missing_or_empty`);

  if (company) {
    const companyCheck = validateCompanyCandidate(company);
    if (!companyCheck.ok) {
      reasons.push(
        ...companyCheck.reasons.map(
          (reason) => `experience[${input.index}].company:${reason}`,
        ),
      );
    }
  }

  if (company && !isAllowedStructuredTemplateExperienceHeader({ company, roleTitle })) {
    reasons.push(`experience[${input.index}]:forbidden_header`);
  }

  return reasons;
}

export function buildDeterministicResumeV2FromBaseline(input: {
  baselineSections: BaselineSection[];
  identity: ResumeTemplateIdentityLike;
}): ResumeGenerationV2Result {
  const rawExperienceText = input.baselineSections
    .filter((section) => String((section as any)?.sectionType ?? '').toUpperCase() === 'EXPERIENCE')
    .map((section) => String((section as any)?.content ?? ''))
    .join('\n');
  const companyCandidateDiagnostics = extractCompanyCandidatesFromExperienceText(rawExperienceText).flatMap(
    (candidate) => buildCompanyRejectionDiagnostics(candidate),
  );

  const structured = extractStructuredBaselineFromSections(input.baselineSections);

  const structuredExperience = Array.isArray(structured.experience)
    ? structured.experience
    : [];

  // Enforce experience filtering: only allow headers we explicitly support in Studio preview.
  const validExperience = structuredExperience.filter((entry) =>
    isAllowedStructuredTemplateExperienceHeader(entry),
  );

  structured.experience = validExperience;

  // Temporary assertion (explicitly requested): Vue fragments must never survive filtering.
  if ((structured.experience ?? []).some((entry) => String((entry as any)?.company ?? '').includes('Vue'))) {
    throw new Error('V2 failed to filter invalid experience entry');
  }

  const invalidReasons: string[] = [];
  const allowedExperience = validExperience.filter((entry, index) => {
    const reasons = buildInvalidExperienceReasons({
      company: (entry as any)?.company,
      roleTitle: (entry as any)?.roleTitle,
      bullets: (entry as any)?.bullets,
      index,
    });
    if (reasons.length > 0) {
      invalidReasons.push(...reasons);
      return false;
    }
    if (!isAllowedStructuredTemplateExperienceHeader(entry)) {
      invalidReasons.push(`experience[${index}]:forbidden_header`);
      return false;
    }
    return true;
  });

  if (allowedExperience.length === 0) {
    throw new UnprocessableEntityException({
      error: {
        code: 'resume_v2_invalid_experience_fragments',
        message: 'Resume V2 rejected malformed experience headers (company + role title required).',
        details: {
          extractedExperienceCount: structuredExperience.length,
          extractedMissingEvidenceReasons: structured.missingEvidenceReasons ?? [],
          rejected: [...invalidReasons, ...companyCandidateDiagnostics],
        },
      },
    });
  }

  structured.experience = allowedExperience;

  const normalized = assembleResumeFromStructuredBaseline(structured, input.identity);

  // Enforce summary fallback (non-optional) after model creation.
  if (!trimToText((normalized as any).summary)) {
    (normalized as any).summary = buildFallbackSummaryFromExperience(normalized.experience as any);
  }
  if (!trimToText((normalized as any).summary)) {
    throw new Error('V2 failed to produce non-empty summary');
  }

  const normalizedValidation = validateNormalizedResumeDocument(normalized);
  if (!normalizedValidation.valid) {
    const failures = buildNormalizedResumeValidationFailures(normalized as NormalizedResumeDocument);
    throw new UnprocessableEntityException({
      error: {
        code: 'resume_v2_normalized_model_invalid',
        message: 'Resume V2 produced an invalid normalized resume model.',
        details: {
          reasons: normalizedValidation.reasons,
          failures,
        },
      },
    });
  }

  const qualityGate = validateResumeArtifactQualityStrict(normalized);
  if (qualityGate.status !== 'pass') {
    throw new UnprocessableEntityException({
      error: {
        code: 'resume_v2_quality_gate_failed',
        message: 'Resume V2 quality gate rejected the normalized model.',
        details: qualityGate,
      },
    });
  }

  return { normalized: normalized as NormalizedResumeDocument, qualityGate };
}
