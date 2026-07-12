import { Baseline } from './baseline.entity';
import { BaselineIncludePolicy, BaselineSection, BaselineSectionType } from './baseline-section.entity';
import {
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';

export function resolveBaselineSectionsForGeneration(
  baseline: Pick<Baseline, 'id' | 'sections' | 'parsedRecords'>,
): BaselineSection[] {
  const canonicalSections = (baseline.sections ?? []).slice().sort((a, b) => a.order - b.order);
  if (canonicalSections.length > 0) {
    return canonicalSections;
  }

  const latestPersistedResumeV2 = getLatestPersistedResumeV2Json(baseline.parsedRecords);
  if (!latestPersistedResumeV2) {
    return canonicalSections;
  }

  const normalized = normalizeNormalizedResumeDocument(latestPersistedResumeV2 as any);
  const validation = validateNormalizedResumeDocument(normalized as any);
  if (!validation.valid) {
    return canonicalSections;
  }

  return buildSectionsFromNormalizedResumeV2(baseline.id, normalized);
}

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getLatestPersistedResumeV2Json(
  parsedRecords: Baseline['parsedRecords'] | null | undefined,
): unknown | null {
  if (!Array.isArray(parsedRecords) || parsedRecords.length === 0) return null;
  const candidates = parsedRecords
    .filter(
      (record) =>
        record &&
        typeof record === 'object' &&
        (record as any).resumeV2Json &&
        typeof (record as any).resumeV2Json === 'object',
    )
    .slice();
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const at = (a as any)?.createdAt ? new Date((a as any).createdAt).getTime() : 0;
    const bt = (b as any)?.createdAt ? new Date((b as any).createdAt).getTime() : 0;
    return at - bt;
  });
  return (candidates[candidates.length - 1] as any).resumeV2Json ?? null;
}

function formatExperienceSectionContent(entry: {
  company?: unknown;
  roleTitle?: unknown;
  dates?: unknown;
  dateRange?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  bullets?: unknown;
}): string {
  const company = trimToText(entry.company);
  const roleTitle = trimToText(entry.roleTitle);
  const dateRange = trimToText(entry.dateRange) || trimToText(entry.dates);
  const fallbackDateRange = [trimToText(entry.startDate), trimToText(entry.endDate)].filter(Boolean).join(' - ');
  const header = [company, roleTitle, dateRange || fallbackDateRange].filter(Boolean).join(' | ');
  const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
  const bulletLines = bullets
    .map((bullet) => trimToText(bullet))
    .filter(Boolean)
    .map((bullet) => `- ${bullet.replace(/^[-*•]\s+/, '')}`);
  return [header, ...bulletLines].filter(Boolean).join('\n').trim();
}

function buildSectionsFromNormalizedResumeV2(
  baselineId: string,
  resumeV2: ReturnType<typeof normalizeNormalizedResumeDocument>,
): BaselineSection[] {
  const sections: BaselineSection[] = [];

  const summary = trimToText(resumeV2.summary);
  if (summary) {
    sections.push({
      id: `${baselineId}:resume-v2:summary`,
      baselineId,
      sectionType: BaselineSectionType.SUMMARY,
      title: 'Summary',
      content: summary,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as BaselineSection);
  }

  const skills = [
    ...(Array.isArray((resumeV2 as any)?.competencies) ? ((resumeV2 as any).competencies as unknown[]) : []),
    ...(Array.isArray((resumeV2 as any)?.coreCompetencies) ? ((resumeV2 as any).coreCompetencies as unknown[]) : []),
  ]
    .map((value) => trimToText(value))
    .filter(Boolean);
  if (skills.length > 0) {
    sections.push({
      id: `${baselineId}:resume-v2:skills`,
      baselineId,
      sectionType: BaselineSectionType.SKILLS,
      title: 'Skills',
      content: skills.join(', '),
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as BaselineSection);
  }

  const experience = Array.isArray(resumeV2.experience) ? resumeV2.experience : [];
  experience.forEach((entry, index) => {
    const content = formatExperienceSectionContent(entry as any);
    if (!content) return;
    sections.push({
      id: `parsed-experience-${index}`,
      baselineId,
      sectionType: BaselineSectionType.EXPERIENCE,
      title: trimToText((entry as any)?.roleTitle) || 'Experience',
      content,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 100 + index,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as BaselineSection);
  });

  const education = Array.isArray(resumeV2.education) ? resumeV2.education : [];
  education.forEach((entry, index) => {
    const content = [
      trimToText((entry as any)?.degree),
      trimToText((entry as any)?.institution),
      trimToText((entry as any)?.location),
    ]
      .filter(Boolean)
      .join(' | ');
    if (!content) return;
    sections.push({
      id: `${baselineId}:resume-v2:education-${index}`,
      baselineId,
      sectionType: BaselineSectionType.EDUCATION,
      title: 'Education',
      content,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 500 + index,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as BaselineSection);
  });

  const additionalSections = Array.isArray(resumeV2.additionalSections) ? resumeV2.additionalSections : [];
  additionalSections.forEach((entry, index) => {
    const title = trimToText((entry as any)?.title) || `Additional Section ${index + 1}`;
    const items = Array.isArray((entry as any)?.items)
      ? ((entry as any).items as unknown[]).map((item) => trimToText(item)).filter(Boolean)
      : [];
    const content = items.join('\n');
    if (!content) return;
    sections.push({
      id: `${baselineId}:resume-v2:additional-${index}`,
      baselineId,
      sectionType: BaselineSectionType.OTHER,
      title,
      content,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 700 + index,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as BaselineSection);
  });

  return sections.sort((a, b) => a.order - b.order);
}
