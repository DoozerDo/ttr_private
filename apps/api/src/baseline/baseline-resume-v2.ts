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

export function buildValidatedResumeV2FromParsedBaseline(
  parsedBaseline: Record<string, unknown>,
): NormalizedResumeDocument {
  const shouldLog = process.env.RESUME_V2_INGEST_DEBUG === 'true';
  if (shouldLog) {
    try {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][ADAPTER_EXEC]', {
        baselineId: String(parsedBaseline['baseline_id'] ?? ''),
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
      baselineId: String(parsedBaseline['baseline_id'] ?? ''),
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      content: '',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ] as any[];

  const experience = (parsedBaseline['experience'] ?? parsedBaseline['work_history']) as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(experience) && experience.length) {
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log(
        parsedBaseline['experience'] ? '[RESUME_V2_INGEST][USING_EXPERIENCE_ARRAY]' : '[RESUME_V2_INGEST][USING_WORK_HISTORY_FALLBACK]',
        {
          baselineId: String(parsedBaseline['baseline_id'] ?? ''),
          selectedCount: experience.length,
        },
      );
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][PARSED_BASELINE]', {
        baselineId: String(parsedBaseline['baseline_id'] ?? ''),
        schemaVersion: String(parsedBaseline['schema_version'] ?? ''),
        sourceFormat: String(parsedBaseline['source_format'] ?? ''),
        identityPresent: Boolean(identity && typeof identity === 'object'),
        experienceCount: experience.length,
        experienceKeysSample: Object.keys(experience[0] ?? {}).slice(0, 12),
      });
    }

    let mappedCount = 0;
    let droppedEmptyCount = 0;
    const blocks = experience
      .map((entry, index) => {
        const company =
          (typeof entry['company_name'] === 'string' && entry['company_name']) ||
          (typeof entry['company'] === 'string' && entry['company']) ||
          (typeof entry['organization'] === 'string' && entry['organization']) ||
          '';
        const role =
          (typeof entry['role_title'] === 'string' && entry['role_title']) ||
          (typeof entry['title'] === 'string' && entry['title']) ||
          (typeof entry['position'] === 'string' && entry['position']) ||
          (typeof entry['role'] === 'string' && entry['role']) ||
          '';
        const start = typeof entry['start_date'] === 'string' ? entry['start_date'] : '';
        const end = typeof entry['end_date'] === 'string' ? entry['end_date'] : 'Present';
        const scopeSummary = typeof entry['scope_summary'] === 'string' ? entry['scope_summary'] : '';

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

        const detailLines = details.length ? details : scopeSummary ? [`- ${String(scopeSummary).trim()}`] : [];
        if (!header && detailLines.length === 0) {
          droppedEmptyCount += 1;
          if (shouldLog) {
            // eslint-disable-next-line no-console
            console.warn('[RESUME_V2_INGEST][ENTRY_DROPPED_EMPTY]', {
              baselineId: String(parsedBaseline['baseline_id'] ?? ''),
              index,
              entryKeysSample: Object.keys(entry ?? {}).slice(0, 12),
            });
          }
          return '';
        }

        mappedCount += 1;
        if (shouldLog) {
          // eslint-disable-next-line no-console
          console.log('[RESUME_V2_INGEST][ENTRY_MAPPED]', {
            baselineId: String(parsedBaseline['baseline_id'] ?? ''),
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
        baselineId: String(parsedBaseline['baseline_id'] ?? ''),
        selectedEntries: experience.length,
        mappedEntries: mappedCount,
        droppedEmptyEntries: droppedEmptyCount,
        survivingBlocks: blocks.length,
      });
    }

    sections[0].content = blocks.join('\n\n');
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][SECTION_BUILD]', {
        baselineId: String(parsedBaseline['baseline_id'] ?? ''),
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
        baselineId: String(parsedBaseline['baseline_id'] ?? ''),
      });
      // eslint-disable-next-line no-console
      console.warn('[RESUME_V2_INGEST][FAILED_NO_USABLE_EXPERIENCE]', {
        baselineId: String(parsedBaseline['baseline_id'] ?? ''),
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
        baselineId: String(parsedBaseline['baseline_id'] ?? ''),
        experienceCount,
        bulletCount,
      });
      if (experienceCount === 0) {
        // eslint-disable-next-line no-console
        console.warn('[RESUME_V2_INGEST][VALIDATION_STRIPPED_CONTENT]', {
          baselineId: String(parsedBaseline['baseline_id'] ?? ''),
          stage: 'post_normalize',
        });
      }
    } catch {
      // ignore
    }
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
