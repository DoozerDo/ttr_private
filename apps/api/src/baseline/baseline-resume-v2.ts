import { UnprocessableEntityException } from '@nestjs/common';
import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import { buildDeterministicResumeV2FromBaseline } from '../resume/resume-generation-v2';
import {
  buildNormalizedResumeValidationFailures,
  formatResumeV2InvalidMessage,
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';
import { BaselineIncludePolicy, BaselineSectionType } from './baseline-section.entity';
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isObviousNonWorkHistoryCompany(value: string): boolean {
  const text = trimToText(value);
  if (!text) return true;
  if (
    /\b(?:technology\s*&\s*tools|operating\s+systems|service\s*&\s*workflow|certifications\s*&\s*development|core\s+areas\s+of\s+expertise|skills|tooling|automation\s*&\s*monitoring|datacenter\s+operations|internal\s+web\s+applications|internal\s+tooling\s*&\s*software\s+development|earlier\s+career)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(?:vue|react|angular|frontend|back\s*end|full[-\s]*stack|builder)\b/i.test(text)) {
    return true;
  }
  if (/^[,;:)\-]/.test(text) || /[,:;]\s*$/.test(text)) return true;
  if (text.includes(')') && !text.includes('(')) return true;
  if (!/[A-Za-z]/.test(text)) return true;
  return false;
}

function shouldKeepStructuredExperienceEntry(input: {
  company: string;
  roleTitle: string;
  detailLines: string[];
}): boolean {
  const company = trimToText(input.company);
  const roleTitle = trimToText(input.roleTitle);
  if (!company || !roleTitle) return false;
  if (isObviousNonWorkHistoryCompany(company) || isObviousNonWorkHistoryCompany(roleTitle)) return false;
  if (!Array.isArray(input.detailLines)) return false;
  return true;
}

function classifyStructuredExperienceKeepDrop(input: {
  company: string;
  roleTitle: string;
  detailLines: string[];
}): {
  kept: boolean;
  dropReason: 'missing_company_or_role' | 'obvious_non_work_history_company' | 'obvious_non_work_history_role' | 'missing_detail_lines' | 'kept';
} {
  const company = trimToText(input.company);
  const roleTitle = trimToText(input.roleTitle);
  if (!company || !roleTitle) return { kept: false, dropReason: 'missing_company_or_role' };
  if (isObviousNonWorkHistoryCompany(company)) return { kept: false, dropReason: 'obvious_non_work_history_company' };
  if (isObviousNonWorkHistoryCompany(roleTitle)) return { kept: false, dropReason: 'obvious_non_work_history_role' };
  if (!Array.isArray(input.detailLines)) return { kept: false, dropReason: 'missing_detail_lines' };
  return { kept: true, dropReason: 'kept' };
}

export type ResumeV2Usability = {
  usable: boolean;
  usableExperienceCount: number;
  reasons: string[];
};

export type BaselineFileReadinessStatus = 'usable' | 'needs_review';

export type BaselineFileDiagnostics = {
  missingRequiredFields: string[];
  validationReasons: string[];
  validationFailures: Array<{
    path: string;
    field: string;
    message: string;
  }>;
};

export type BaselineFileRecord = {
  heading: {
    name: string;
    contactLine: string;
    links?: string[];
  };
  summary?: string;
  competencies?: string[];
  skills?: string[];
  experience: Array<
    NormalizedResumeDocument['experience'][number] & {
      evidence?: Array<{
        id: string;
        text: string;
        source?: 'parsed_baseline' | 'structured_sections' | 'derived_from_bullets';
      }>;
    }
  >;
  education?: Array<
    NonNullable<NormalizedResumeDocument['education']>[number] & {
      evidence?: Array<{
        id: string;
        text: string;
        source?: 'parsed_baseline' | 'structured_sections';
      }>;
    }
  >;
  certifications?: string[];
  diagnostics: BaselineFileDiagnostics;
  readiness: {
    status: BaselineFileReadinessStatus;
    usable: boolean;
  };
};

function collectBaselineDiagnostics(document: NormalizedResumeDocument): BaselineFileDiagnostics {
  const validation = validateNormalizedResumeDocument(document);
  const failures = buildNormalizedResumeValidationFailures(document);
  const missingRequiredFields = Array.from(
    new Set(
      failures
        .filter((failure) => ['heading.name', 'heading.contactLine'].includes(failure.path) || failure.path.startsWith('experience['))
        .map((failure) => failure.path),
    ),
  );

  return {
    missingRequiredFields,
    validationReasons: validation.reasons,
    validationFailures: failures.map((failure) => ({
      path: failure.path,
      field: failure.field,
      message: failure.message,
    })),
  };
}

function buildBaselineFileStatus(diagnostics: BaselineFileDiagnostics): BaselineFileReadinessStatus {
  return diagnostics.missingRequiredFields.length === 0 && diagnostics.validationReasons.length === 0
    ? 'usable'
    : 'needs_review';
}

function buildEvidenceReferences(input: {
  parsedEvidence?: Array<Record<string, unknown>> | null;
  bullets?: string[];
  source: 'parsed_baseline' | 'structured_sections';
}) {
  const parsedEvidence = Array.isArray(input.parsedEvidence)
    ? input.parsedEvidence
        .map((evidence, index) => {
          const text = trimToText(evidence?.text);
          if (!text) return null;
          return {
            id: trimToText(evidence?.id) || `evidence-${index}`,
            text,
            source: input.source,
          };
        })
        .filter(
          (
            value,
          ): value is { id: string; text: string; source: 'parsed_baseline' | 'structured_sections' } =>
            Boolean(value),
        )
    : [];

  if (parsedEvidence.length) return parsedEvidence;

  return (input.bullets ?? [])
    .map((bullet, index) => {
      const text = trimToText(bullet);
      if (!text) return null;
      return { id: `derived-bullet-${index}`, text, source: 'derived_from_bullets' as const };
    })
    .filter(
      (value): value is { id: string; text: string; source: 'derived_from_bullets' } => Boolean(value),
    );
}

export function evaluateResumeV2Usability(resumeV2Json: unknown): ResumeV2Usability {
  if (!resumeV2Json || typeof resumeV2Json !== 'object') {
    return { usable: false, usableExperienceCount: 0, reasons: ['missing_resume_v2'] };
  }
  const normalized = normalizeNormalizedResumeDocument(resumeV2Json as NormalizedResumeDocument);
  const validation = validateNormalizedResumeDocument(normalized);
  const experienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
  if (experienceCount <= 0) {
    return { usable: false, usableExperienceCount: 0, reasons: ['usable_experience_empty'] };
  }
  // Usability gate is intentionally looser than strict normalized validation: extremely short-but-meaningful
  // bullets can still produce a persisted usable draft, even if some strict rules would fail.
  if (!validation.valid) {
    return { usable: true, usableExperienceCount: experienceCount, reasons: ['validation_warnings', ...validation.reasons] };
  }
  return { usable: true, usableExperienceCount: experienceCount, reasons: [] };
}

export function assertUsableResumeV2(resumeV2Json: unknown) {
  const usability = evaluateResumeV2Usability(resumeV2Json);
  if (usability.usable) return usability;
  if (usability.reasons.includes('missing_resume_v2')) {
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_resume_v2_missing',
        message: 'Baseline ResumeV2 is missing. Repair your baseline before generating.',
        details: { usableExperienceCount: 0 },
      },
    });
  }
  const normalized = resumeV2Json && typeof resumeV2Json === 'object'
    ? normalizeNormalizedResumeDocument(resumeV2Json as NormalizedResumeDocument)
    : null;
  const failures = normalized ? buildNormalizedResumeValidationFailures(normalized as any) : [];
  throw new UnprocessableEntityException({
    error: {
      code: 'baseline_resume_v2_invalid',
      message: formatResumeV2InvalidMessage({ reasons: usability.reasons, failures }),
      details: { usableExperienceCount: 0, reasons: usability.reasons, failures },
    },
  });
}

export function buildValidatedResumeV2FromParsedBaseline(
  parsedBaseline: Record<string, unknown>,
  baselineSections?: Array<Record<string, unknown>> | null,
): BaselineFileRecord {
  const shouldLog = process.env.RESUME_V2_INGEST_DEBUG === 'true';
  const baselineId = String(parsedBaseline['baseline_id'] ?? '');
  let lastParsedExperienceCount: number | null = null;
  let lastMappingStats:
    | {
        selectedEntries: number;
        mappedEntries: number;
        droppedEmptyEntries: number;
        entriesMissingHeader: number;
        entriesMissingDetails: number;
        survivingBlocks: number;
        rejectionReasons: Array<{ reason: string; count: number; sampleKeys: string[] }>;
      }
    | null = null;
  let resumeV2CandidateKeepDrop:
    | Array<{
        company: string;
        roleTitle: string;
        detailLinesCount: number;
        kept: boolean;
        dropReason: 'missing_company_or_role' | 'obvious_non_work_history_company' | 'obvious_non_work_history_role' | 'missing_detail_lines' | 'kept';
      }>
    | null = null;
  if (shouldLog) {
    try {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][ADAPTER_EXEC]', {
        baselineId,
        schemaVersion: String(parsedBaseline['schema_version'] ?? ''),
        sourceFormat: String(parsedBaseline['source_format'] ?? ''),
        parsedExperienceIsArray: Array.isArray(parsedBaseline['experience']),
        parsedWorkHistoryIsArray: Array.isArray(parsedBaseline['work_history']),
        parsedExperienceCount: Array.isArray(parsedBaseline['experience'])
          ? (parsedBaseline['experience'] as any[]).length
          : null,
        parsedWorkHistoryCount: Array.isArray(parsedBaseline['work_history'])
          ? (parsedBaseline['work_history'] as any[]).length
          : null,
      });
    } catch {
      // ignore
    }
  }
  const identity = parsedBaseline['identity'] as Record<string, unknown> | undefined;
  const fullName = typeof identity?.['full_name'] === 'string' ? identity['full_name'] : null;
  const location = typeof identity?.['location'] === 'string' ? identity['location'] : null;

  const sections = [
    {
      id: 'ingestion-experience',
      baselineId,
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      content: '',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ] as any[];

  // Prefer authoritative structured baseline sections when available.
  // This prevents parser-specific malformed header mappings (e.g. location-as-company) from becoming ResumeV2 truth
  // when we already have canonical extracted company/role identity from baseline sections.
  const structuredExperienceBlocks = (() => {
    if (!Array.isArray(baselineSections) || baselineSections.length === 0) return null;
    try {
      const structured = extractStructuredBaselineFromSections(baselineSections as any);
      const experience = Array.isArray((structured as any)?.experience) ? ((structured as any).experience as any[]) : [];
      if (experience.length === 0) return null;
      const blocks = experience
        .map((entry) => {
          const company = typeof entry?.company === 'string' ? entry.company.trim() : '';
          const roleTitle = typeof entry?.roleTitle === 'string' ? entry.roleTitle.trim() : '';
          const dates = typeof entry?.dates === 'string' ? entry.dates.trim() : '';
          const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]).map((b) => String(b ?? '').trim()).filter(Boolean) : [];
          const bulletLines = bullets.map((b) => `- ${b.replace(/^[-*Ã¢â‚¬Â¢]\s*/, '')}`);
          if (!shouldKeepStructuredExperienceEntry({ company, roleTitle, detailLines: bulletLines })) return '';
          const header = [company, roleTitle, dates].filter(Boolean).join(' | ');
          return [header, ...bulletLines].join('\n').trim();
        })
        .filter(Boolean);
      return blocks.length ? blocks : null;
    } catch {
      return null;
    }
  })();

  if (structuredExperienceBlocks?.length) {
    sections[0].content = structuredExperienceBlocks.join('\n\n');
  }

  const experience = (parsedBaseline['experience'] ?? parsedBaseline['work_history']) as
    | Array<Record<string, unknown>>
    | undefined;
  if (!sections[0].content.trim() && Array.isArray(experience) && experience.length) {
    lastParsedExperienceCount = experience.length;
    const rejectionReasons = new Map<string, { count: number; sampleKeys: string[] }>();
    const recordRejection = (reason: string, entry: unknown) => {
      if (!shouldLog) return;
      const keys =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? Object.keys(entry as Record<string, unknown>)
          : [];
      const sampleKeys = keys.slice(0, 12);
      const existing = rejectionReasons.get(reason);
      if (existing) {
        existing.count += 1;
        return;
      }
      rejectionReasons.set(reason, { count: 1, sampleKeys });
    };

    const readString = (...candidates: unknown[]) => {
      for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const obj = value as Record<string, unknown>;
          const nested =
            (typeof obj['name'] === 'string' && obj['name']) ||
            (typeof obj['value'] === 'string' && obj['value']) ||
            (typeof obj['text'] === 'string' && obj['text']) ||
            '';
          if (nested && nested.trim()) return nested.trim();
        }
      }
      return '';
    };

    const readDetailsLines = (entry: Record<string, unknown>) => {
      const directText = readString(
        entry['details_text'],
        entry['detailsText'],
        entry['responsibilities_text'],
        entry['responsibilitiesText'],
        entry['description'],
        entry['summary'],
      );
      if (directText) {
        return directText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .map((line) => String(line ?? '').trim())
          .filter(Boolean)
          // Keep the replacement narrow; this is ingestion-only and must not rewrite meaning.
          .map((line) => `- ${line.replace(/^[-*â€¢]\s*/, '')}`);
      }

      const arrayCandidate =
        (Array.isArray(entry['bullets']) && entry['bullets']) ||
        (Array.isArray(entry['highlights']) && entry['highlights']) ||
        (Array.isArray(entry['responsibilities']) && entry['responsibilities']) ||
        (Array.isArray(entry['details']) && entry['details']) ||
        null;
      if (arrayCandidate) {
        return arrayCandidate
          .map((line) => (typeof line === 'string' ? line.trim() : ''))
          .filter(Boolean)
          // Keep the replacement narrow; this is ingestion-only and must not rewrite meaning.
          .map((line) => `- ${line.replace(/^[-*â€¢]\s*/, '')}`);
      }

      return [] as string[];
    };

    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log(
        parsedBaseline['experience'] ? '[RESUME_V2_INGEST][USING_EXPERIENCE_ARRAY]' : '[RESUME_V2_INGEST][USING_WORK_HISTORY_FALLBACK]',
        {
          baselineId,
          selectedCount: experience.length,
        },
      );
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][PARSED_BASELINE]', {
        baselineId,
        schemaVersion: String(parsedBaseline['schema_version'] ?? ''),
        sourceFormat: String(parsedBaseline['source_format'] ?? ''),
        identityPresent: Boolean(identity && typeof identity === 'object'),
        experienceCount: experience.length,
        experienceKeysSample: Object.keys(experience[0] ?? {}).slice(0, 12),
      });
    }

    let mappedCount = 0;
    let droppedEmptyCount = 0;
    let rejectedMissingHeaderCount = 0;
    let rejectedMissingDetailsCount = 0;
    const blocks = experience
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          droppedEmptyCount += 1;
          recordRejection('non_object_entry', entry);
          return '';
        }
        const company = readString(
          entry['company_name'],
          entry['companyName'],
          entry['company'],
          (entry as any)?.company?.name,
          entry['employer'],
          entry['organization'],
          entry['organization_name'],
          entry['org'],
        );
        const role = readString(
          entry['role_title'],
          entry['roleTitle'],
          entry['title'],
          entry['position'],
          entry['position_title'],
          entry['positionTitle'],
          entry['job_title'],
          entry['jobTitle'],
          entry['role'],
        );
        const start = readString(entry['start_date'], entry['startDate'], entry['start'], entry['from']);
        const end = readString(entry['end_date'], entry['endDate'], entry['end'], entry['to']) || 'Present';
        const scopeSummary = readString(entry['scope_summary'], entry['scopeSummary'], entry['scope']);

        // `structuredBaselineExtractor.parseExperienceHeaderLine` expects: "Company | Role Title | Dates".
        // This ordering matters; reversing it can cause experience entries to be rejected as unsafe/not-company-like.
        const header = [company, role, [start, end].filter(Boolean).join(' - ')].filter(Boolean).join(' | ');

        const detailsText = typeof entry['details_text'] === 'string' ? entry['details_text'] : '';
        const details = detailsText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .map((line) => String(line ?? '').trim())
          .filter(Boolean)
          // Keep the replacement narrow; this is ingestion-only and must not rewrite meaning.
          .map((line) => `- ${line.replace(/^[-*•]\s*/, '')}`);

        const fallbackDetails = details.length ? details : readDetailsLines(entry);
        const detailLines = fallbackDetails.length
          ? fallbackDetails
          : scopeSummary
            ? [`- ${String(scopeSummary).trim()}`]
            : [];
        const keepDrop = classifyStructuredExperienceKeepDrop({ company, roleTitle: role, detailLines });
        if (shouldLog) {
          resumeV2CandidateKeepDrop = resumeV2CandidateKeepDrop ?? [];
          resumeV2CandidateKeepDrop.push({
            company,
            roleTitle: role,
            detailLinesCount: detailLines.length,
            kept: keepDrop.kept,
            dropReason: keepDrop.dropReason,
          });
        }
        if (!keepDrop.kept) {
          rejectedMissingHeaderCount += 1;
          recordRejection('company_not_persistable', entry);
          return '';
        }
        if (!header && detailLines.length === 0) {
          droppedEmptyCount += 1;
          recordRejection('empty_header_and_details', entry);
          if (shouldLog) {
            // eslint-disable-next-line no-console
            console.warn('[RESUME_V2_INGEST][ENTRY_DROPPED_EMPTY]', {
              baselineId,
              index,
              entryKeysSample: Object.keys(entry ?? {}).slice(0, 12),
            });
          }
          return '';
        }

        if (!header) {
          rejectedMissingHeaderCount += 1;
          recordRejection('missing_header_company_or_role', entry);
        }
        if (detailLines.length === 0) {
          rejectedMissingDetailsCount += 1;
          recordRejection('missing_details_bullets', entry);
        }

        mappedCount += 1;
        if (shouldLog) {
          // eslint-disable-next-line no-console
          console.log('[RESUME_V2_INGEST][ENTRY_MAPPED]', {
            baselineId,
            index,
            companyPresent: Boolean(String(company ?? '').trim()),
            rolePresent: Boolean(String(role ?? '').trim()),
            headerPresent: Boolean(String(header ?? '').trim()),
            detailLineCount: detailLines.length,
          });
        }

        return [header, ...detailLines].filter(Boolean).join('\n').trim();
      })
      .filter(Boolean);

    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][MAP_COUNTS]', {
        baselineId,
        selectedEntries: experience.length,
        mappedEntries: mappedCount,
        droppedEmptyEntries: droppedEmptyCount,
        entriesMissingHeader: rejectedMissingHeaderCount,
        entriesMissingDetails: rejectedMissingDetailsCount,
        survivingBlocks: blocks.length,
      });
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][CANDIDATE_KEEP_DROP]', {
        baselineId,
        resumeV2CandidateKeepDrop: resumeV2CandidateKeepDrop ?? [],
      });
      if (rejectionReasons.size) {
        // eslint-disable-next-line no-console
        console.warn('[RESUME_V2_INGEST][REJECTION_REASONS]', {
          baselineId,
          reasons: Array.from(rejectionReasons.entries()).map(([reason, payload]) => ({
            reason,
            count: payload.count,
            sampleKeys: payload.sampleKeys,
          })),
        });
      }
    }

    lastMappingStats = {
      selectedEntries: experience.length,
      mappedEntries: mappedCount,
      droppedEmptyEntries: droppedEmptyCount,
      entriesMissingHeader: rejectedMissingHeaderCount,
      entriesMissingDetails: rejectedMissingDetailsCount,
      survivingBlocks: blocks.length,
      rejectionReasons: Array.from(rejectionReasons.entries()).map(([reason, payload]) => ({
        reason,
        count: payload.count,
        sampleKeys: payload.sampleKeys,
      })),
    };

    sections[0].content = blocks.join('\n\n');
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][SECTION_BUILD]', {
        baselineId,
        headerBlockCount: blocks.length,
        sectionChars: sections[0].content.length,
        firstBlockPreview: blocks[0]?.slice(0, 180) ?? null,
      });
    }
  }

  if (!sections[0].content.trim()) {
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.warn('[RESUME_V2_INGEST][FINAL_SECTION_EMPTY]', {
        baselineId,
      });
      // eslint-disable-next-line no-console
      console.warn('[RESUME_V2_INGEST][FAILED_NO_USABLE_EXPERIENCE]', {
        baselineId,
        parsedExperiencePresent: Array.isArray(experience),
        parsedExperienceCount: Array.isArray(experience) ? experience.length : null,
        identityFullNamePresent: Boolean(fullName && String(fullName).trim()),
        identityLocationPresent: Boolean(location && String(location).trim()),
      });
    }
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_resume_v2_ingestion_failed',
        message:
          'Baseline ingestion did not produce any usable experience entries for Resume V2. Please re-upload or reprocess your baseline resume.',
        details: {
          missing: ['experience'],
          hint:
            'No experience entries survived mapping. This often means the parsed baseline schema uses different field names for company/title/bullets, or the resume parser returned empty work history.',
          diagnostics: {
            parsedExperienceCount: lastParsedExperienceCount,
            mapping: lastMappingStats,
          },
        },
      },
    });
  }

  const result = buildDeterministicResumeV2FromBaseline({
    baselineSections: sections as any,
    identity: { name: fullName ?? 'Candidate', contactLine: location ?? '', links: [] },
  });
  const normalized = normalizeNormalizedResumeDocument(result.normalized as NormalizedResumeDocument);

  if (shouldLog) {
    try {
      const experienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
      const bulletCount = Array.isArray((normalized as any)?.experience)
        ? (normalized as any).experience.reduce(
            (sum: number, entry: any) => sum + (Array.isArray(entry?.bullets) ? entry.bullets.length : 0),
            0,
          )
        : 0;
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][NORMALIZED_COUNTS]', {
        baselineId,
        experienceCount,
        bulletCount,
      });
      if (experienceCount === 0) {
        // eslint-disable-next-line no-console
        console.warn('[RESUME_V2_INGEST][VALIDATION_STRIPPED_CONTENT]', {
          baselineId,
          stage: 'post_normalize',
        });
      }
    } catch {
      // ignore
    }
  }

  const normalizedExperienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
  if (normalizedExperienceCount === 0) {
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_resume_v2_invalid',
        message:
          'Resume V2 produced an invalid normalized resume model. No valid experience entries were produced. Please re-upload or reprocess your baseline resume.',
        details: {
          reasons: ['experience_empty_after_normalize'],
        },
      },
    });
  }

  const validation = validateNormalizedResumeDocument(normalized);
  if (!validation.valid) {
    const failures = buildNormalizedResumeValidationFailures(normalized);
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_resume_v2_invalid',
        message: formatResumeV2InvalidMessage({ reasons: validation.reasons, failures }),
        details: {
          reasons: validation.reasons,
          failures,
        },
      },
    });
  }

  const canonicalExperience = Array.isArray((parsedBaseline as any)?.experience)
    ? ((parsedBaseline as any).experience as Array<Record<string, unknown>>)
    : [];
  const canonicalEducation = Array.isArray((parsedBaseline as any)?.education)
    ? ((parsedBaseline as any).education as Array<Record<string, unknown>>)
    : [];
  const diagnostics = collectBaselineDiagnostics(normalized);
  const baselineFile = {
    heading: {
      name: normalized.heading.name,
      contactLine: normalized.heading.contactLine,
      ...(normalized.heading.links?.length ? { links: normalized.heading.links } : {}),
    },
    ...(normalized.summary ? { summary: normalized.summary } : {}),
    ...(normalized.competencies?.length ? { competencies: normalized.competencies } : {}),
    ...(normalized.coreCompetencies?.length ? { skills: normalized.coreCompetencies } : {}),
    experience: normalized.experience.map((entry, index) => ({
      ...entry,
      evidence: buildEvidenceReferences({
        parsedEvidence: canonicalExperience[index]?.evidence as Array<Record<string, unknown>> | null,
        bullets: entry.bullets,
        source: 'parsed_baseline',
      }),
    })),
    ...(Array.isArray(normalized.education)
      ? {
          education: normalized.education.map((entry, index) => ({
            ...entry,
            evidence: buildEvidenceReferences({
              parsedEvidence: canonicalEducation[index]?.evidence as Array<Record<string, unknown>> | null,
              source: 'parsed_baseline',
            }),
          })),
        }
      : {}),
    certifications: Array.isArray((parsedBaseline as any)?.certifications)
      ? ((parsedBaseline as any).certifications as unknown[]).map((value) => trimToText(value)).filter(Boolean)
      : [],
    diagnostics,
    readiness: {
      status: buildBaselineFileStatus(diagnostics),
      usable: diagnostics.missingRequiredFields.length === 0 && diagnostics.validationReasons.length === 0,
    },
  } as BaselineFileRecord;

  return baselineFile;
}


