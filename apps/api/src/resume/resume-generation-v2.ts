import { UnprocessableEntityException } from '@nestjs/common';
import type { BaselineSection } from '../baseline/baseline-section.entity';
import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import { evaluateBaselineTemplateReadiness } from '../baseline/baselineTemplateReadiness';
import {
  assembleResumeFromStructuredBaseline,
  buildAuthoritativeResumeDraftFromResumeV2,
  isAllowedStructuredTemplateExperienceHeader,
  type ResumeTemplateIdentityLike,
} from './resumeTemplateAssembler';
import { PositioningPlanService } from '../positioning/positioning-plan.service';
import { formatResumeV2InvalidMessage, validateNormalizedResumeDocument } from './resume-normalization';
import {
  validateResumeArtifactQualityStrict,
  repairResumeStructure,
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

type ResumeQualityGateFailure = {
  path: string;
  field: string;
  value: unknown;
  message: string;
  reason: string;
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function removeDanglingTrailingWord(text: string): string {
  // Keep this local (V2-only) to avoid relying on V1 repair passes.
  const normalized = trimToText(text);
  if (!normalized) return '';
  const tokens = normalized.split(/\s+/);
  const last = tokens[tokens.length - 1]?.toLowerCase() ?? '';
  const dangling = new Set([
    'the',
    'a',
    'an',
    'and',
    'but',
    'because',
    'with',
    'for',
    'to',
    'of',
    'in',
    'on',
    'at',
    'by',
    'from',
  ]);
  if (!dangling.has(last)) return normalized;
  return tokens.slice(0, -1).join(' ').trim();
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

function buildResumeQualityGateFailures(
  resume: NormalizedResumeDocument,
  reasons: string[],
): ResumeQualityGateFailure[] {
  const failures: ResumeQualityGateFailure[] = [];

  const experience = Array.isArray(resume.experience) ? resume.experience : [];

  for (const reason of reasons) {
    if (reason === 'empty_summary') {
      failures.push({
        path: 'summary',
        field: 'summary',
        value: resume.summary,
        message: 'Summary is empty.',
        reason,
      });
      continue;
    }

    if (reason === 'malformed_experience_header:company') {
      for (let index = 0; index < experience.length; index++) {
        const entry = experience[index] as any;
        const company = trimToText(entry?.company);
        if (!company) {
          failures.push({
            path: `experience[${index}].company`,
            field: 'company',
            value: entry?.company,
            message: 'Company is missing.',
            reason,
          });
          continue;
        }
        const companyLower = company.toLowerCase();
        const bannedCompanies = new Set([
          'experience entry needs correction',
          'automation & monitoring',
          'internal web applications',
          'datacenter operations',
        ]);
        if (bannedCompanies.has(companyLower)) {
          failures.push({
            path: `experience[${index}].company`,
            field: 'company',
            value: entry?.company,
            message: 'Company is a known invalid placeholder/heading.',
            reason,
          });
          continue;
        }
        if (/\b(?:professional\s+experience|experience|projects|skills|education|summary)\b/i.test(company)) {
          failures.push({
            path: `experience[${index}].company`,
            field: 'company',
            value: entry?.company,
            message: 'Company looks like a section heading.',
            reason,
          });
          continue;
        }
        if (/\bVue\s*3\),\s*deck builder frontend\b/i.test(company)) {
          failures.push({
            path: `experience[${index}].company`,
            field: 'company',
            value: entry?.company,
            message: 'Company looks like a project fragment.',
            reason,
          });
          continue;
        }
      }
      continue;
    }

    if (reason === 'malformed_experience_header:role_title') {
      for (let index = 0; index < experience.length; index++) {
        const entry = experience[index] as any;
        const roleTitle = trimToText(entry?.roleTitle);
        if (!roleTitle) {
          failures.push({
            path: `experience[${index}].roleTitle`,
            field: 'roleTitle',
            value: entry?.roleTitle,
            message: 'Role title is missing.',
            reason,
          });
        } else if (roleTitle.toLowerCase() === 'professional experience') {
          failures.push({
            path: `experience[${index}].roleTitle`,
            field: 'roleTitle',
            value: entry?.roleTitle,
            message: 'Role title is a placeholder heading.',
            reason,
          });
        }
      }
      continue;
    }

    if (reason === 'empty_role') {
      for (let index = 0; index < experience.length; index++) {
        const entry = experience[index] as any;
        const company = trimToText(entry?.company);
        const roleTitle = trimToText(entry?.roleTitle);
        const bullets = Array.isArray(entry?.bullets)
          ? (entry.bullets as unknown[]).map((b) => trimToText(b)).filter(Boolean)
          : [];
        if ((company || roleTitle) && bullets.length === 0) {
          failures.push({
            path: `experience[${index}].bullets`,
            field: 'bullets',
            value: entry?.bullets,
            message: 'Experience entry contains no bullets.',
            reason,
          });
        }
      }
      continue;
    }

    if (reason === 'trailing_fragment') {
      // Best-effort pinpointing: flag any summary/bullet with dangling trailing word.
      const summary = typeof resume.summary === 'string' ? trimToText(resume.summary) : '';
      if (summary && removeDanglingTrailingWord(summary) !== summary) {
        failures.push({
          path: 'summary',
          field: 'summary',
          value: resume.summary,
          message: 'Summary ends with a dangling fragment.',
          reason,
        });
      }
      for (let index = 0; index < experience.length; index++) {
        const entry = experience[index] as any;
        const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]) : [];
        for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex++) {
          const bullet = trimToText(bullets[bulletIndex]);
          if (!bullet) continue;
          if (removeDanglingTrailingWord(bullet) !== bullet) {
            failures.push({
              path: `experience[${index}].bullets[${bulletIndex}]`,
              field: 'bullets',
              value: bullets[bulletIndex],
              message: 'Bullet ends with a dangling fragment.',
              reason,
            });
          }
        }
      }
      continue;
    }

    if (reason.startsWith('placeholder:')) {
      const label = reason.slice('placeholder:'.length).toLowerCase();
      const patterns: Record<string, RegExp> = {
        tbd: /\bTBD\b/i,
        todo: /\bTODO\b/i,
        'lorem ipsum': /\bLorem ipsum\b/i,
        insert: /\bInsert\b/i,
        placeholder: /\bPlaceholder\b/i,
        'n/a': /^(?:N\/A|NA)\b/i,
      };
      const pattern = patterns[label] ?? null;
      if (!pattern) continue;

      const summary = typeof resume.summary === 'string' ? String(resume.summary) : '';
      if (summary && pattern.test(summary)) {
        failures.push({
          path: 'summary',
          field: 'summary',
          value: resume.summary,
          message: `Summary contains placeholder text (${reason}).`,
          reason,
        });
      }
      for (let index = 0; index < experience.length; index++) {
        const entry = experience[index] as any;
        const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]) : [];
        for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex++) {
          const bulletRaw = String(bullets[bulletIndex] ?? '');
          if (pattern.test(bulletRaw)) {
            failures.push({
              path: `experience[${index}].bullets[${bulletIndex}]`,
              field: 'bullets',
              value: bullets[bulletIndex],
              message: `Bullet contains placeholder text (${reason}).`,
              reason,
            });
          }
        }
      }

      continue;
    }
  }

  return failures;
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

  if (!company) reasons.push(`experience[${input.index}].company:missing`);
  if (!roleTitle) reasons.push(`experience[${input.index}].roleTitle:missing`);
  // Bullets are a quality signal, not a hard requirement for baseline usability.
  // Strong resumes often have paragraph responsibilities or lightly structured bullets; allow generation
  // and let Fit Review surface refinement suggestions.

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
  job?: { title?: string | null; company?: string | null; description?: string | null } | null;
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
    const templateReadiness = evaluateBaselineTemplateReadiness(structured);
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_template_not_ready',
        message:
          'Baseline is usable for scoring but is not template-safe for resume generation.',
        details: {
          extractedExperienceCount: structuredExperience.length,
          extractedMissingEvidenceReasons: structured.missingEvidenceReasons ?? [],
          rejected: [...invalidReasons, ...companyCandidateDiagnostics],
          reasons: templateReadiness.hardBlockReasons,
        },
      },
    });
  }

  structured.experience = allowedExperience;

  const jobTitle = String(input.job?.title ?? '').trim();
  const jobCompany = String(input.job?.company ?? '').trim();
  const jobDescription = String(input.job?.description ?? '').trim();
  const jobContextText = [jobTitle, jobCompany, jobDescription].filter(Boolean).join(' ');

  const jobTokens = new Set(
    jobContextText
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4),
  );

  const scoreExperienceForJob = (entry: any) => {
    const company = String(entry?.company ?? '');
    const roleTitle = String(entry?.roleTitle ?? '');
    const dates = String(entry?.dates ?? '');
    const bullets = Array.isArray(entry?.bullets) ? entry.bullets.map((b: any) => String(b ?? '')) : [];
    const text = [company, roleTitle, dates, ...bullets].join(' ').toLowerCase();
    let score = 0;
    for (const token of jobTokens) {
      if (text.includes(token)) score += 1;
    }
    // Penalize obvious contractor/project fragments so they cannot dominate when stronger evidence exists.
    if (/\b(contractor|freelance|consultant)\b/i.test(roleTitle)) score -= 2;
    if (/\b(vue|react|deck builder|frontend)\b/i.test(company)) score -= 3;
    return score;
  };

  structured.experience = [...allowedExperience].sort((a: any, b: any) => scoreExperienceForJob(b) - scoreExperienceForJob(a));

  const normalized = assembleResumeFromStructuredBaseline(structured, input.identity);

  // Structural repair pass: prevent bullet-like prose from being treated as header fields.
  // Applies to ResumeV2 as well because upstream extracted fields can still be malformed.
  const repairedStructure = repairResumeStructure(normalized as unknown as NormalizedResumeDocument);

  // V2 cleanup (deterministic): remove dangling trailing fragments that cause strict quality failures.
  (repairedStructure as any).summary =
    typeof (normalized as any).summary === 'string'
      ? removeDanglingTrailingWord((normalized as any).summary)
      : (normalized as any).summary;
  (repairedStructure as any).experience = (Array.isArray((normalized as any).experience) ? (normalized as any).experience : []).map(
    (entry: any) => {
      const bullets = Array.isArray(entry?.bullets)
        ? (entry.bullets as unknown[])
            .map((b) => removeDanglingTrailingWord(trimToText(b)))
            .filter(Boolean)
        : entry?.bullets;
      return { ...entry, bullets };
    },
  );

  // Enforce summary fallback (non-optional) after model creation.
  if (!trimToText((repairedStructure as any).summary)) {
    (repairedStructure as any).summary = buildFallbackSummaryFromExperience(repairedStructure.experience as any);
  }
  if (!trimToText((repairedStructure as any).summary)) {
    throw new Error('V2 failed to produce non-empty summary');
  }

  // Authoritative assembly: use PositioningPlan as the single source of truth for render ordering/suppression.
  const experience = Array.isArray((repairedStructure as any).experience) ? (repairedStructure as any).experience : [];
  const suppressedExperienceIds = experience
    .map((entry: any, index: number) => {
      const company = trimToText(entry?.company).toLowerCase();
      const roleTitle = trimToText(entry?.roleTitle).toLowerCase();
      const isWeak =
        /\b(vue|react|deck builder|frontend)\b/i.test(company) ||
        company.includes('experience entry needs correction') ||
        (/\bcontractor\b/i.test(roleTitle) && /\b(linux|infrastructure|sysadmin)\b/i.test(roleTitle));
      return isWeak ? `resume_v2_exp_${index}` : null;
    })
    .filter((id): id is string => Boolean(id));

  const planService = new PositioningPlanService();
  const plan = planService.buildPlan({
    job: { title: input.job?.title ?? null, company: input.job?.company ?? null, description: input.job?.description ?? null },
    resumeV2: repairedStructure as any,
  });

  const authoritative = buildAuthoritativeResumeDraftFromResumeV2({
    resumeV2: repairedStructure as any,
    identity: input.identity,
    rankedExperienceIds: plan.emphasizeRoleIds ?? [],
    suppressedExperienceIds: Array.from(new Set([...(suppressedExperienceIds ?? []), ...(plan.suppressRoleIds ?? [])])),
    positioningPlan: plan,
    professionalIdentity: input.job?.title ? `${trimToText(input.job.title)}` : null,
    targetNarrative: input.job?.company ? `Targeting ${trimToText(input.job.company)}.` : null,
  });

  const normalizedValidation = validateNormalizedResumeDocument(repairedStructure as any);
  if (!normalizedValidation.valid) {
    const failures = buildNormalizedResumeValidationFailures(repairedStructure as NormalizedResumeDocument);
    throw new UnprocessableEntityException({
      error: {
        code: 'resume_v2_normalized_model_invalid',
        message: formatResumeV2InvalidMessage({ reasons: normalizedValidation.reasons, failures }),
        details: {
          reasons: normalizedValidation.reasons,
          failures,
        },
      },
    });
  }

  const qualityGate = validateResumeArtifactQualityStrict(authoritative as any);

  return { normalized: authoritative as NormalizedResumeDocument, qualityGate };
}
