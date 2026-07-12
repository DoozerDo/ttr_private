import { Baseline } from './baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from './baseline-section.entity';
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';
import {
  extractEvidenceUnitsFromLogicalUnits,
  reconstructLogicalTextUnits,
} from '../resume/resume-draft-bullets';

type ParsedRecordLike = {
  createdAt?: Date | string;
  parsedJson?: Record<string, unknown>;
  resumeV2Json?: Record<string, unknown>;
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

function estimateEvidenceUnitCount(section: Pick<BaselineSection, 'id' | 'content' | 'sectionType'>): number {
  const content = toStringValue(section.content);
  if (!content) return 0;
  const logicalUnits = reconstructLogicalTextUnits(content);
  return extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits, {
    allowImplicitBullets: true,
  }).length;
}

function extractExperienceSectionsFromStructuredResume(
  resumeDocument: Record<string, unknown> | undefined,
): {
  sections: Array<Pick<BaselineSection, 'title' | 'content' | 'sectionType'>>;
  experienceEntryCount: number;
} {
  if (!resumeDocument) return { sections: [], experienceEntryCount: 0 };

  const extracted: Array<Pick<BaselineSection, 'title' | 'content' | 'sectionType'>> = [];
  const experienceArray = (resumeDocument['experience'] ?? resumeDocument['work_history']) as
    | Array<Record<string, unknown>>
    | undefined;
  let experienceEntryCount = 0;

  if (Array.isArray(experienceArray) && experienceArray.length) {
    experienceEntryCount += experienceArray.length;
    const blocks = experienceArray
      .map((entry) => {
        const company =
          toStringValue(entry['company_name']) ||
          toStringValue(entry['company']) ||
          toStringValue(entry['organization']);
        const role =
          toStringValue(entry['role_title']) ||
          toStringValue(entry['roleTitle']) ||
          toStringValue(entry['title']) ||
          toStringValue(entry['position']);
        const start =
          toStringValue(entry['start_date']) ||
          toStringValue(entry['startDate']) ||
          toStringValue(entry['start']);
        const end =
          toStringValue(entry['end_date']) ||
          toStringValue(entry['endDate']) ||
          toStringValue(entry['end']);
        const scopeSummary = toStringValue(entry['scope_summary']);
        const detailsText = toStringValue(entry['details_text']);
        const bullets = Array.isArray(entry['bullets'])
          ? entry['bullets']
              .map((value) => toStringValue(value))
              .filter(Boolean)
          : [];
        const evidence = Array.isArray(entry['evidence'])
          ? entry['evidence']
              .map((value) => {
                if (!value || typeof value !== 'object') return '';
                const record = value as Record<string, unknown>;
                return (
                  toStringValue(record['text']) ||
                  toStringValue(record['normalizedText']) ||
                  toStringValue(record['sourceText'])
                );
              })
              .filter(Boolean)
          : [];
        const details = [...splitBodyLines(detailsText), ...bullets, ...evidence];

        const header = [company, role, [start, end].filter(Boolean).join(' - ')]
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

  const parsedSections = resumeDocument['sections'] as Array<Record<string, unknown>> | undefined;
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
        experienceEntryCount += 1;
        extracted.push({
          sectionType: BaselineSectionType.EXPERIENCE,
          title: title || 'Experience',
          content,
        });
      }
    }
  }

  return { sections: extracted, experienceEntryCount };
}

export function resolveBaselineSectionsForGeneration(
  baseline: Pick<Baseline, 'id' | 'sections' | 'parsedRecords'>,
): BaselineSection[] {
  const directSections = (baseline.sections ?? []).slice().sort((a, b) => a.order - b.order);

  const parsed = ((baseline.parsedRecords ?? []) as ParsedRecordLike[])
    .slice()
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })[0];

  const resumeV2Sections = extractExperienceSectionsFromStructuredResume(
    parsed && typeof parsed.resumeV2Json === 'object' && parsed.resumeV2Json
      ? parsed.resumeV2Json
      : undefined,
  );
  const parsedJsonSections = extractExperienceSectionsFromStructuredResume(parsed?.parsedJson);

  const candidateScores = [
    {
      sections: resumeV2Sections.sections,
      priority: 2,
      evidenceCount: resumeV2Sections.sections.reduce((score, section) => score + estimateEvidenceUnitCount({
        id: `resume-v2-${score}`,
        sectionType: section.sectionType,
        content: section.content,
      }), 0),
      totalLength: resumeV2Sections.sections.reduce((score, section) => score + toStringValue(section.content).length, 0),
    },
    {
      sections: parsedJsonSections.sections,
      priority: 1,
      evidenceCount: parsedJsonSections.sections.reduce((score, section) => score + estimateEvidenceUnitCount({
        id: `parsed-json-${score}`,
        sectionType: section.sectionType,
        content: section.content,
      }), 0),
      totalLength: parsedJsonSections.sections.reduce((score, section) => score + toStringValue(section.content).length, 0),
    },
    {
      sections: directSections,
      priority: 0,
      evidenceCount: directSections.reduce((score, section) => score + estimateEvidenceUnitCount(section), 0),
      totalLength: directSections.reduce((score, section) => score + toStringValue(section.content).length, 0),
    },
  ];

  const selected = candidateScores
    .filter((candidate) => candidate.sections.length > 0)
    .sort((left, right) => {
      if (right.evidenceCount !== left.evidenceCount) {
        return right.evidenceCount - left.evidenceCount;
      }
      if (right.totalLength !== left.totalLength) {
        return right.totalLength - left.totalLength;
      }
      return right.priority - left.priority;
    })[0];

  if (selected?.sections?.length) {
    if (selected.sections === directSections) {
      return directSections;
    }
    return selected.sections.map((section, index) => ({
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

  return directSections;
}

