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

export function buildValidatedResumeV2FromParsedBaseline(parsedBaseline: Record<string, unknown>): NormalizedResumeDocument {
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

  const experience = parsedBaseline['experience'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(experience) && experience.length) {
    const blocks = experience
      .map((entry) => {
        const company =
          (typeof entry['company_name'] === 'string' && entry['company_name']) ||
          (typeof entry['company'] === 'string' && entry['company']) ||
          '';
        const role =
          (typeof entry['role_title'] === 'string' && entry['role_title']) ||
          (typeof entry['role'] === 'string' && entry['role']) ||
          '';
        const start = typeof entry['start_date'] === 'string' ? entry['start_date'] : '';
        const end = typeof entry['end_date'] === 'string' ? entry['end_date'] : '';
        const header = [role, company, [start, end].filter(Boolean).join(' - ')].filter(Boolean).join(' | ');
        const detailsText = typeof entry['details_text'] === 'string' ? entry['details_text'] : '';
        const details = detailsText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .map((line) => String(line ?? '').trim())
          .filter(Boolean)
          .map((line) => `- ${line.replace(/^[-*â€¢]\s*/, '')}`);
        return [header, ...details].filter(Boolean).join('\n').trim();
      })
      .filter(Boolean);
    sections[0].content = blocks.join('\n\n');
  }

  const result = buildDeterministicResumeV2FromBaseline({
    baselineSections: sections as any,
    identity: { name: fullName ?? 'Candidate', contactLine: location ?? '', links: [] },
  });
  const normalized = normalizeNormalizedResumeDocument(result.normalized as NormalizedResumeDocument);

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

