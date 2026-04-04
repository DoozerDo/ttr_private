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
const SUMMARY_MAX_WORDS = 90;
const SUMMARY_LABEL_PATTERN = /^(?:professional\s+summary|summary)[:\s-]*/i;
const BULLET_OR_LIST_PATTERN = /^\s*(?:[\u2022\u25CF\u25E6*\-]|(?:\(?\d{1,3}\)?[.)]))\s+/;
const PLACEHOLDER_COMPETENCY_PATTERN = /^[\s\u2022\u25CF\u25E6|,;:\-]+$/;
const MOJIBAKE_BULLET = '\u00e2\u20ac\u00a2';

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

  const normalized = lines
    .flatMap((line) => line.split(/\n+/))
    .map((line) => normalizeSummaryLine(line))
    .filter((line): line is string => Boolean(line))
    .filter((line) => !isContactLike(line));

  if (!normalized.length) {
    return '';
  }

  const bulletLikeCount = normalized.filter(
    (line) =>
      BULLET_OR_LIST_PATTERN.test(line) ||
      line.includes(BULLET_PREFIX) ||
      line.includes(MOJIBAKE_BULLET) ||
      PLACEHOLDER_COMPETENCY_PATTERN.test(line),
  ).length;
  if (bulletLikeCount > 0 && bulletLikeCount >= Math.ceil(normalized.length / 2)) {
    return '';
  }

  const proseOnly = normalized
    .filter(
      (line) =>
        !BULLET_OR_LIST_PATTERN.test(line) &&
        !line.includes(BULLET_PREFIX) &&
        !line.includes(MOJIBAKE_BULLET),
    )
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (!proseOnly.length) {
    return '';
  }

  return limitWords(proseOnly.join(' '), SUMMARY_MAX_WORDS);
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
            lines.push(...splitCompetencyCandidates(normalized));
          }
        }
      }
    }
    if ('lines' in item && Array.isArray(item.lines)) {
      for (const line of item.lines) {
        const normalized = toText(line);
        if (normalized && !isContactLike(normalized)) {
          lines.push(...splitCompetencyCandidates(normalized));
        }
      }
    }
  }

  const normalizedTokens = lines
    .map((line) => normalizeCompetencyToken(line))
    .filter((line): line is string => Boolean(line))
    .filter((line) => !isContactLike(line))
    .filter((line) => !PLACEHOLDER_COMPETENCY_PATTERN.test(line));

  const deduped = normalizedTokens.filter(
    (line, index) =>
      normalizedTokens.findIndex(
        (candidate) => candidate.toLowerCase() === line.toLowerCase(),
      ) === index,
  );
  if (!deduped.length) {
    return '';
  }

  const grouped = chunkArray(deduped, SKILLS_PER_LINE).map((group) =>
    group.join(`  ${BULLET_PREFIX}  `),
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
        .flatMap((bullet) => splitBulletLines(bullet))
        .map((bullet) => normalizeBulletText(bullet))
        .filter((bullet): bullet is string =>
          typeof bullet === 'string' && bullet.length > 0 && !isContactLike(bullet),
        );

      if (!bullets.length && item.description?.trim()) {
        const description = item.description.trim();
        if (!isContactLike(description)) {
          bullets.push(description);
        }
      }

      return {
        title: normalizeHeaderField(item.role),
        company: normalizeHeaderField(item.company),
        dates: normalizeHeaderField(item.dateRange),
        location: normalizeHeaderField(item.location),
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
    .filter((entry) => isMeaningfulEducationEntry(entry));
}

function normalizeSummaryLine(line: string): string | null {
  const trimmed = toText(line).replace(SUMMARY_LABEL_PATTERN, '').trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function splitCompetencyCandidates(value: string): string[] {
  return value
    .split(/[,\u2022;|]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeCompetencyToken(value: string): string | null {
  const normalized = toText(value)
    .replace(/^(?:core\s+competencies|competencies|skills|technical\s+skills)[:\s-]*/i, '')
    .replace(/^[\u2022\u25CF\u25E6*\-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }
  if (PLACEHOLDER_COMPETENCY_PATTERN.test(normalized)) {
    return null;
  }
  if (/^(?:and|or)$/i.test(normalized)) {
    return null;
  }
  if (normalized.length < 2) {
    return null;
  }

  return normalized;
}

function normalizeHeaderField(value?: string | null) {
  return toText(value)
    .replace(/\s+/g, ' ')
    .replace(/^[|,\-]+|[|,\-]+$/g, '')
    .trim();
}

function splitBulletLines(value?: string | null): string[] {
  const text = toText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeBulletText(value: string): string | null {
  const normalized = toText(value)
    .replace(/^[\u2022\u25CF\u25E6*\-]+\s*/, '')
    .replace(new RegExp(`^${escapeRegExp(MOJIBAKE_BULLET)}\\s*`), '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }
  if (PLACEHOLDER_COMPETENCY_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function isMeaningfulEducationEntry(entry: ResumeV2EducationItem): boolean {
  const all = [entry.degree, entry.school, entry.grad_year].map((value) =>
    toText(value),
  );

  if (!all.some(Boolean)) {
    return false;
  }

  return all.some((value) => value.length > 1 && !PLACEHOLDER_COMPETENCY_PATTERN.test(value));
}

function limitWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value;
  }

  const trimmed = words.slice(0, maxWords).join(' ').trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
