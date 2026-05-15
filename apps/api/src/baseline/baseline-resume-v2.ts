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

export function buildValidatedResumeV2FromParsedBaseline(
  parsedBaseline: Record<string, unknown>,
  baselineSections?: Array<Record<string, unknown>> | null,
): NormalizedResumeDocument {
  const shouldLog = process.env.RESUME_V2_INGEST_DEBUG === 'true';
  const baselineId = String(parsedBaseline['baseline_id'] ?? '');
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
          if (!company || !roleTitle) return '';
          const header = [company, roleTitle, dates].filter(Boolean).join(' | ');
          const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]).map((b) => String(b ?? '').trim()).filter(Boolean) : [];
          const bulletLines = bullets.map((b) => `- ${b.replace(/^[-*Ã¢â‚¬Â¢]\s*/, '')}`);
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
        const company =
          (typeof entry['company_name'] === 'string' && entry['company_name']) ||
          (typeof entry['companyName'] === 'string' && entry['companyName']) ||
          (typeof entry['company'] === 'string' && entry['company']) ||
          (typeof entry['employer'] === 'string' && entry['employer']) ||
          (typeof entry['organization'] === 'string' && entry['organization']) ||
          (typeof entry['org'] === 'string' && entry['org']) ||
          '';
        const role =
          (typeof entry['role_title'] === 'string' && entry['role_title']) ||
          (typeof entry['roleTitle'] === 'string' && entry['roleTitle']) ||
          (typeof entry['title'] === 'string' && entry['title']) ||
          (typeof entry['position'] === 'string' && entry['position']) ||
          (typeof entry['position_title'] === 'string' && entry['position_title']) ||
          (typeof entry['positionTitle'] === 'string' && entry['positionTitle']) ||
          (typeof entry['job_title'] === 'string' && entry['job_title']) ||
          (typeof entry['jobTitle'] === 'string' && entry['jobTitle']) ||
          (typeof entry['role'] === 'string' && entry['role']) ||
          '';
        const start =
          (typeof entry['start_date'] === 'string' && entry['start_date']) ||
          (typeof entry['startDate'] === 'string' && entry['startDate']) ||
          (typeof entry['start'] === 'string' && entry['start']) ||
          (typeof entry['from'] === 'string' && entry['from']) ||
          '';
        const end =
          (typeof entry['end_date'] === 'string' && entry['end_date']) ||
          (typeof entry['endDate'] === 'string' && entry['endDate']) ||
          (typeof entry['end'] === 'string' && entry['end']) ||
          (typeof entry['to'] === 'string' && entry['to']) ||
          'Present';
        const scopeSummary =
          (typeof entry['scope_summary'] === 'string' && entry['scope_summary']) ||
          (typeof entry['scopeSummary'] === 'string' && entry['scopeSummary']) ||
          (typeof entry['scope'] === 'string' && entry['scope']) ||
          '';

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

  return normalized;
}
