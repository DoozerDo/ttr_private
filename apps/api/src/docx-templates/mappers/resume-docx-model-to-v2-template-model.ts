import {
  ExperienceItem,
  ResumeDocxModel,
  ResumeEducationItem,
  ResumeSectionItem,
  ResumeV2EducationItem,
  ResumeV2ExperienceItem,
  ResumeV2TemplateModel,
} from '../docx-template.types';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /\+?\d[\d().\-\s]{7,}\d/;
const LINKEDIN_PATTERN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,]+/i;
const BULLET_PREFIX = '\u2022';
const SKILLS_PER_LINE = 4;

function toText(value?: string | null): string {
  return value?.trim() ?? '';
}

function isContactLike(value: string): boolean {
  const normalized = toText(value);
  if (!normalized) return false;
  return (
    EMAIL_PATTERN.test(normalized) ||
    PHONE_PATTERN.test(normalized) ||
    LINKEDIN_PATTERN.test(normalized)
  );
}

function pickSummary(model: ResumeDocxModel): string {
  const summarySection = model.sections.find((section) => section.key === 'summary');
  if (!summarySection) return '';

  const lines: string[] = [];
  for (const item of summarySection.items) {
    if ('paragraphs' in item && Array.isArray(item.paragraphs)) {
      lines.push(...item.paragraphs.map((paragraph) => paragraph.trim()));
      continue;
    }
    if ('lines' in item && Array.isArray(item.lines)) {
      lines.push(...item.lines.map((line) => line.trim()));
      continue;
    }
    if ('raw' in item) {
      const raw = toText(item.raw);
      if (raw) lines.push(raw);
    }
  }

  return lines.filter((line) => line.length > 0 && !isContactLike(line)).join('\n');
}

function pickCoreCompetencies(model: ResumeDocxModel): string {
  const skillsSection = model.sections.find((section) => section.key === 'skills');
  if (!skillsSection) return '';
  const lines: string[] = [];

  for (const item of skillsSection.items) {
    if ('groups' in item && Array.isArray(item.groups)) {
      for (const group of item.groups) {
        for (const value of group.values ?? []) {
          const normalized = toText(value);
          if (normalized && !isContactLike(normalized)) {
            lines.push(normalized);
          }
        }
      }
    }
    if ('lines' in item && Array.isArray(item.lines)) {
      for (const line of item.lines) {
        const normalized = toText(line);
        if (normalized && !isContactLike(normalized)) {
          lines.push(normalized);
        }
      }
    }
  }

  const deduped = lines.filter(
    (line, index) =>
      lines.findIndex(
        (candidate) => candidate.toLowerCase() === line.toLowerCase(),
      ) === index,
  );

  const grouped = chunkArray(deduped, SKILLS_PER_LINE).map((group) =>
    group.join('  •  '),
  );
  return grouped.map((line) => `${BULLET_PREFIX} ${line}`).join('\n');
}

function pickExperience(model: ResumeDocxModel): ResumeV2ExperienceItem[] {
  const experienceSection = model.sections.find(
    (section) => section.key === 'experience',
  );
  if (!experienceSection) return [];

  return experienceSection.items
    .filter((item): item is ExperienceItem => 'role' in item && 'bullets' in item)
    .map((item) => {
      const bullets = (item.bullets ?? [])
        .map((bullet) => toText(bullet))
        .filter((bullet) => Boolean(bullet) && !isContactLike(bullet));

      if (!bullets.length && item.description?.trim()) {
        const description = item.description.trim();
        if (!isContactLike(description)) {
          bullets.push(description);
        }
      }

      return {
        title: toText(item.role),
        company: toText(item.company),
        dates: toText(item.dateRange),
        location: toText(item.location),
        bullets,
      };
    })
    .filter(
      (item) =>
        Boolean(item.title || item.company || item.dates || item.location) &&
        item.bullets.length > 0,
    );
}

function parseEducationItem(item: ResumeSectionItem): ResumeV2EducationItem | null {
  if (!('raw' in item || 'degree' in item || 'institution' in item)) {
    return null;
  }
  const entry = item as ResumeEducationItem;
  const raw = toText(entry.raw);
  const parts = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const gradYearFromRaw =
    raw.match(/\b(19|20)\d{2}\b/)?.[0] ??
    parts.find((part) => /\b(19|20)\d{2}\b/.test(part)) ??
    '';

  return {
    degree: toText(entry.degree) || parts[0] || raw,
    school: toText(entry.institution) || parts[1] || '',
    grad_year: toText(entry.dateRange) || gradYearFromRaw,
  };
}

function pickEducation(model: ResumeDocxModel): ResumeV2EducationItem[] {
  const educationSection = model.sections.find(
    (section) => section.key === 'education',
  );
  if (!educationSection) return [];

  return educationSection.items
    .map(parseEducationItem)
    .filter((entry): entry is ResumeV2EducationItem => Boolean(entry))
    .map((entry) => ({
      degree: toText(entry.degree),
      school: toText(entry.school),
      grad_year: toText(entry.grad_year),
    }))
    .filter((entry) => Boolean(entry.degree || entry.school || entry.grad_year));
}

function extractContactFields(contactLines: string[] | undefined) {
  const lines = contactLines ?? [];
  const joined = lines.join(' | ');
  const email = joined.match(EMAIL_PATTERN)?.[0] ?? '';
  const phone = joined.match(PHONE_PATTERN)?.[0] ?? '';
  const linkedin = joined.match(LINKEDIN_PATTERN)?.[0] ?? '';

  const locationParts = lines
    .flatMap((line) => line.split('|'))
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !EMAIL_PATTERN.test(part))
    .filter((part) => !PHONE_PATTERN.test(part))
    .filter((part) => !LINKEDIN_PATTERN.test(part));

  return {
    location: locationParts[0] ?? '',
    email,
    phone,
    linkedin,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (!items.length || size <= 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function mapResumeDocxModelToV2TemplateModel(
  model: ResumeDocxModel,
): ResumeV2TemplateModel {
  const contacts = extractContactFields(model.header.contactLines);
  return {
    full_name: toText(model.header.name),
    headline: toText(model.header.title),
    location: contacts.location,
    email: contacts.email,
    phone: contacts.phone,
    linkedin: contacts.linkedin,
    summary: pickSummary(model),
    core_competencies: pickCoreCompetencies(model),
    experience: pickExperience(model),
    education: pickEducation(model),
  };
}
