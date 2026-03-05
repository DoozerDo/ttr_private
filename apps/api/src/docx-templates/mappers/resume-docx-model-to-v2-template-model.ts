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

function toText(value?: string | null): string {
  return value?.trim() ?? '';
}

function pickSummary(model: ResumeDocxModel): string {
  const summarySection = model.sections.find((section) => section.key === 'summary');
  if (!summarySection) return '';
  return summarySection.items
    .filter((item): item is { paragraphs: string[] } => 'paragraphs' in item)
    .flatMap((item) => item.paragraphs)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n');
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
          if (normalized) lines.push(normalized);
        }
      }
    }
    if ('lines' in item && Array.isArray(item.lines)) {
      for (const line of item.lines) {
        const normalized = toText(line);
        if (normalized) lines.push(normalized);
      }
    }
  }

  return lines.map((line) => `• ${line}`).join('\n');
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
        .filter(Boolean);
      if (!bullets.length && item.description?.trim()) {
        bullets.push(item.description.trim());
      }
      return {
        title: toText(item.role),
        company: toText(item.company),
        dates: toText(item.dateRange),
        location: toText(item.location),
        bullets,
      };
    });
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
    raw.match(/\b(19|20)\d{2}\b/)?.[0] ?? parts.find((part) => /\b(19|20)\d{2}\b/.test(part)) ?? '';

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
    }));
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
