import { Baseline } from './baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from './baseline-section.entity';

type ParsedRecordLike = {
  createdAt?: Date | string;
  parsedJson?: Record<string, unknown>;
};

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function splitBodyLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractExperienceSectionsFromParsedJson(
  parsedJson: Record<string, unknown> | undefined,
): Array<Pick<BaselineSection, 'title' | 'content' | 'sectionType'>> {
  if (!parsedJson) return [];

  const extracted: Array<Pick<BaselineSection, 'title' | 'content' | 'sectionType'>> = [];
  const experienceArray = (parsedJson['experience'] ?? parsedJson['work_history']) as
    | Array<Record<string, unknown>>
    | undefined;

  if (Array.isArray(experienceArray) && experienceArray.length) {
    const blocks = experienceArray
      .map((entry) => {
        const company =
          toStringValue(entry['company_name']) ||
          toStringValue(entry['company']) ||
          toStringValue(entry['organization']);
        const role =
          toStringValue(entry['role_title']) ||
          toStringValue(entry['title']) ||
          toStringValue(entry['position']);
        const start = toStringValue(entry['start_date']);
        const end = toStringValue(entry['end_date']) || 'Present';
        const scopeSummary = toStringValue(entry['scope_summary']);
        const detailsText = toStringValue(entry['details_text']);
        const details = splitBodyLines(detailsText);

        const header = [role, company, [start, end].filter(Boolean).join(' - ')]
          .filter(Boolean)
          .join(' | ');
        const detailLines = details.length ? details : scopeSummary ? [scopeSummary] : [];
        if (!header && !detailLines.length) return '';
        return [header, ...detailLines.map((line) => `- ${line.replace(/^[-*•]\s*/, '')}`)]
          .filter(Boolean)
          .join('\n')
          .trim();
      })
      .filter(Boolean);

    if (blocks.length) {
      extracted.push({
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: blocks.join('\n\n'),
      });
    }
  }

  const parsedSections = parsedJson['sections'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(parsedSections)) {
    for (const section of parsedSections) {
      const title = toStringValue(section['title']);
      const type = toStringValue(section['sectionType'] ?? section['type']).toUpperCase();
      const content = toStringValue(section['content']);
      if (!content) continue;
      if (
        type === 'EXPERIENCE' ||
        /\b(experience|work history|employment history|career history)\b/i.test(title)
      ) {
        extracted.push({
          sectionType: BaselineSectionType.EXPERIENCE,
          title: title || 'Experience',
          content,
        });
      }
    }
  }

  return extracted;
}

export function resolveBaselineSectionsForGeneration(
  baseline: Pick<Baseline, 'id' | 'sections' | 'parsedRecords'>,
): BaselineSection[] {
  const directSections = (baseline.sections ?? []).slice().sort((a, b) => a.order - b.order);
  if (directSections.length > 0) {
    return directSections;
  }

  const parsed = ((baseline.parsedRecords ?? []) as ParsedRecordLike[])
    .slice()
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })[0];

  const parsedSections = extractExperienceSectionsFromParsedJson(parsed?.parsedJson);
  return parsedSections.map((section, index) => ({
    id: `parsed-experience-${index}`,
    baselineId: baseline.id,
    sectionType: section.sectionType,
    title: section.title,
    content: section.content,
    includePolicy: BaselineIncludePolicy.ALWAYS,
    order: index,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  })) as BaselineSection[];
}

