import { Baseline } from './baseline.entity';
import { BaselineIncludePolicy, BaselineSection, BaselineSectionType } from './baseline-section.entity';
import { buildValidatedResumeV2FromParsedBaseline } from './baseline-resume-v2';
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';
import {
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';

export function resolveBaselineSectionsForGeneration(
  baseline: Pick<Baseline, 'id' | 'sections' | 'parsedRecords'>,
  options: { preferRicherParsedBaseline?: boolean } = {},
): BaselineSection[] {
  const canonicalSections = (baseline.sections ?? []).slice().sort((a, b) => a.order - b.order);
  const structured = extractStructuredBaselineFromSections(canonicalSections as any);
  const canonicalExperienceCount = Array.isArray(structured.experience) ? structured.experience.length : 0;
  const latestParsedBaseline = getLatestParsedBaseline(baseline.parsedRecords);
  if (!options.preferRicherParsedBaseline) {
    return canonicalSections;
  }

  const rawParsedExperienceCount = countParsedExperienceEntries(latestParsedBaseline);
  if (!rawParsedExperienceCount) {
    return canonicalSections;
  }
  if (canonicalExperienceCount > 0 && canonicalExperienceCount >= rawParsedExperienceCount) {
    return canonicalSections;
  }

  const nonExperienceCanonicalSections = canonicalSections.filter(
    (section) => String(section.sectionType ?? section.type ?? '').toUpperCase() !== BaselineSectionType.EXPERIENCE,
  );

  const authoritativeResumeV2 = getAuthoritativeResumeV2(nonExperienceCanonicalSections, latestParsedBaseline);
  if (!authoritativeResumeV2) {
    return canonicalSections;
  }

  const normalized = normalizeNormalizedResumeDocument(authoritativeResumeV2 as any);
  const validation = validateNormalizedResumeDocument(normalized as any);
  if (!validation.valid) {
    return canonicalSections;
  }

  if (canonicalSections.length === 0) {
    return buildSectionsFromNormalizedResumeV2(baseline.id, normalized);
  }

  const synthesizedSections = buildSectionsFromNormalizedResumeV2(baseline.id, normalized);
  const experienceSections = synthesizedSections.filter(
    (section) => String(section.sectionType ?? section.type ?? '').toUpperCase() === BaselineSectionType.EXPERIENCE,
  );
  const supplementalSections = synthesizedSections.filter((section) => {
    const sectionType = String(section.sectionType ?? section.type ?? '').toUpperCase();
    if (sectionType === BaselineSectionType.EXPERIENCE) return false;
    return !nonExperienceCanonicalSections.some(
      (existing) => String(existing.sectionType ?? existing.type ?? '').toUpperCase() === sectionType,
    );
  });

  if (experienceSections.length === 0 && supplementalSections.length === 0) {
    return nonExperienceCanonicalSections;
  }

  return [...nonExperienceCanonicalSections, ...supplementalSections, ...experienceSections].sort(
    (a, b) => a.order - b.order,
  );
}

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getLatestParsedBaseline(
  parsedRecords: Baseline['parsedRecords'] | null | undefined,
): Record<string, unknown> | null {
  if (!Array.isArray(parsedRecords) || parsedRecords.length === 0) return null;
  const candidates = parsedRecords
    .filter((record) => record && typeof record === 'object' && (record as any).parsedJson && typeof (record as any).parsedJson === 'object')
    .slice();
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const at = (a as any)?.createdAt ? new Date((a as any).createdAt).getTime() : 0;
    const bt = (b as any)?.createdAt ? new Date((b as any).createdAt).getTime() : 0;
    return at - bt;
  });
  return ((candidates[candidates.length - 1] as any).parsedJson ?? null) as Record<string, unknown> | null;
}

function countParsedExperienceEntries(parsedBaseline: Record<string, unknown> | null): number {
  if (!parsedBaseline || typeof parsedBaseline !== 'object') return 0;
  const experience = Array.isArray(parsedBaseline.experience) ? parsedBaseline.experience : [];
  const workHistory = Array.isArray(parsedBaseline.work_history) ? parsedBaseline.work_history : [];
  return Math.max(experience.length, workHistory.length);
}

function getAuthoritativeResumeV2(
  canonicalSections: BaselineSection[],
  parsedBaseline: Record<string, unknown> | null,
): unknown | null {
  const authoritativeFromParsedBaseline = (() => {
    if (!parsedBaseline || typeof parsedBaseline !== 'object') return null;
    try {
      const built = buildValidatedResumeV2FromParsedBaseline(parsedBaseline, canonicalSections as any);
      const candidate = built && typeof built === 'object' ? built : null;
      if (!candidate || typeof candidate !== 'object') return null;
      const experienceCount = Array.isArray((candidate as any)?.experience)
        ? (candidate as any).experience.length
        : 0;
      if (experienceCount > 0) return candidate;
      return null;
    } catch {
      return null;
    }
  })();

  if (authoritativeFromParsedBaseline) return authoritativeFromParsedBaseline;
  return null;
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

  sections.push(...buildExperienceSectionsFromNormalizedResumeV2(baselineId, resumeV2));

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

function buildExperienceSectionsFromNormalizedResumeV2(
  baselineId: string,
  resumeV2: ReturnType<typeof normalizeNormalizedResumeDocument>,
): BaselineSection[] {
  const experience = Array.isArray(resumeV2.experience) ? resumeV2.experience : [];
  return experience.flatMap((entry, index) => {
    const content = formatExperienceSectionContent(entry as any);
    if (!content) return [];
    return [{
      id: `parsed-experience-${index}`,
      baselineId,
      sectionType: BaselineSectionType.EXPERIENCE,
      title: trimToText((entry as any)?.roleTitle) || 'Experience',
      content,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 100 + index,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as BaselineSection];
  });
}
