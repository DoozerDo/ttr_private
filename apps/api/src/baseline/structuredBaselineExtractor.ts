import type { BaselineSection } from './baseline-section.entity';

export type StructuredBaseline = {
  contact?: Record<string, unknown>;
  summary?: string;
  experience: Array<{
    company: string;
    roleTitle: string;
    dates?: string;
    bullets: string[];
    source: 'baseline';
  }>;
  education: string[];
  skills: string[];
  missingEvidenceReasons: string[];
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitLines(value: string): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function isBulletLine(line: string): boolean {
  return /^[-•*]\s+/.test(line);
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[-•*]\s+/, '').trim();
}

function looksLikeSentence(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  if (/[.!?]\s*$/.test(text)) return true;
  if (/[.!?]/.test(text) && text.split(/\s+/).length > 6) return true;
  return false;
}

function startsWithActionVerb(value: string): boolean {
  const first = trimToText(value).split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!first) return false;
  // Minimal action-verb set (aligned with quality validator intent).
  const verbs = new Set([
    'designed',
    'built',
    'led',
    'managed',
    'created',
    'implemented',
    'developed',
    'owned',
    'improved',
    'reduced',
    'increased',
    'delivered',
    'supported',
    'maintained',
    'coordinated',
    'partnered',
    'collaborated',
    'architected',
    'automated',
    'migrated',
    'troubleshot',
    'resolved',
  ]);
  return verbs.has(first);
}

function isUnsafeHeaderCandidate(value: string): boolean {
  const text = trimToText(value);
  if (!text) return true;
  // Require at least one letter; pure date/range tokens are not valid headers.
  if (!/[A-Za-z]/.test(text)) return true;
  // Reject obvious prose/bullet-like content.
  if (looksLikeSentence(text) || startsWithActionVerb(text)) return true;
  // Reject very long "headers" that are likely bullets.
  if (text.split(/\s+/).length > 10) return true;
  return false;
}

function hasUnmatchedCompanyPunctuation(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  const openParens = (text.match(/\(/g) ?? []).length;
  const closeParens = (text.match(/\)/g) ?? []).length;
  return openParens !== closeParens;
}

function isLikelyCompanyName(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;

  // Reject obvious section labels / headings.
  if (/\b(?:professional\s+experience|experience|projects|skills|education|summary)\b/i.test(text)) {
    return false;
  }

  // Reject technology / fragment-like "companies" that commonly appear in project bullets.
  // Keep this narrow and conservative to avoid false positives on real company names.
  if (/\b(?:vue|react|angular|frontend|back\s*end|full[-\s]*stack|builder)\b/i.test(text)) {
    return false;
  }

  // Reject malformed fragments with unmatched punctuation (common in truncated bullets like "Vue 3), ...").
  if (hasUnmatchedCompanyPunctuation(text)) return false;

  return true;
}

function parseExperienceHeaderLine(line: string): { company: string; roleTitle: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;

  // Prefer explicit pipe-separated headers:
  // "Company | Role Title | 2020 - 2024"
  if (raw.includes('|')) {
    const parts = raw.split('|').map((p) => trimToText(p)).filter(Boolean);
    if (parts.length < 2) return null;
    const [company, roleTitle, dates] = parts;
    if (!company || !roleTitle) return null;
    return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  // Support "Company — Role Title — dates" and "Company - Role Title - dates"
  const dashParts = raw.split(/\s[—-]\s/).map((p) => trimToText(p)).filter(Boolean);
  if (dashParts.length >= 2) {
    // Avoid misclassifying "Company <Month YYYY> - <Month YYYY|Present>" as a header with company+roleTitle.
    if (dashParts.length === 2 && looksLikeDatesLine(dashParts[1])) return null;

    if (dashParts.length === 2) {
      const monthYear =
        /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}\b/i;
      const leftHasMonthYear = monthYear.test(dashParts[0]);
      const leftEndsWithMonthYear = monthYear.test(dashParts[0].split(/\s+/).slice(-2).join(' '));
      const rightIsEnd = monthYear.test(dashParts[1]) || /\b(?:present|current)\b/i.test(dashParts[1]);
      if (leftHasMonthYear && leftEndsWithMonthYear && rightIsEnd) return null;
    }

    const [company, roleTitle, dates] = dashParts;
    if (!company || !roleTitle) return null;
    return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  return null;
}

const MONTH_YEAR_TOKEN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+(?:19|20)\\d{2}';
const MONTH_YEAR_RE = new RegExp(`\\b${MONTH_YEAR_TOKEN}\\b`, 'i');

function normalizeDateRangeSeparators(text: string): string {
  // Normalize dash-like separators (including mojibake artifacts) and "to" into a canonical hyphen.
  return (
    text
      // Common UTF-8 mojibake renderings of en/em dashes when decoded as ISO-8859-1/Windows-1252.
      .replace(/\u00C3\u00A2\u00E2\u0082\u00AC\u00E2\u0080\u009D/g, '-') // "Ã¢â‚¬â€"
      .replace(/\u00E2\u0080\u0094/g, '-') // "â€”"
      .replace(/\u00E2\u0080\u0093/g, '-') // "â€“"
      // Real unicode dashes/minus.
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/\s+to\s+/gi, ' - ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function canonicalizeDateRange(text: string): string {
  const normalized = normalizeDateRangeSeparators(text);
  const parts = normalized.split(' - ').map((p) => trimToText(p)).filter(Boolean);
  if (parts.length < 2) return normalized;
  const start = parts[0];
  const end = parts.slice(1).join(' - ');
  const canonicalEnd = /\bcurrent\b/i.test(end) ? 'Present' : end;
  return `${start} – ${canonicalEnd}`.replace(/\s+/g, ' ').trim();
}

function looksLikeDatesLine(line: string): boolean {
  const raw = trimToText(line);
  if (!raw) return false;
  const normalized = normalizeDateRangeSeparators(raw);
  const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
  const looksLikeMonthYear = MONTH_YEAR_RE.test(normalized);
  const looksLikeRange =
    (looksLikeMonthYear || hasYear) &&
    (normalized.includes(' - ') || /\b(?:present|current)\b/i.test(normalized));
  return (hasYear || looksLikeMonthYear) && normalized.split(/\s+/).length <= 12 && looksLikeRange;
}

function parseCompanyWithDates(line: string): { company: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s*\(([^()]*\b(19|20)\d{2}[^()]*)\)\s*$/);
  if (!match) return null;
  const company = trimToText(match[1]);
  const dates = trimToText(match[2]);
  if (!company) return null;
  return { company, ...(dates ? { dates } : {}) };
}

function parseCompanyWithInlineDates(line: string): { company: string; dates: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;

  const normalized = normalizeDateRangeSeparators(raw);
  const match = normalized.match(
    new RegExp(`^(.+?)\\s+(${MONTH_YEAR_TOKEN})\\s*-\\s*(?:(${MONTH_YEAR_TOKEN})|present|current)\\s*$`, 'i'),
  );
  if (!match) return null;

  const company = trimToText(match[1]);
  const start = trimToText(match[2]);
  const end = trimToText(match[3] ?? 'Present');
  if (!company || !start || !end) return null;

  return { company, dates: canonicalizeDateRange(`${start} - ${end}`) };
}

function parseCompanyWithTrailingStartDate(line: string): { company: string; start: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;
  const match = raw.match(new RegExp(`^(.*?)(?:\\s+)(${MONTH_YEAR_TOKEN})\\s*$`, 'i'));
  if (!match) return null;
  const company = trimToText(match[1]);
  const start = trimToText(match[2]);
  if (!company || !start) return null;
  return { company, start };
}
function parseRoleAtCompany(line: string): { company: string; roleTitle: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s+at\s+(.+?)(?:\s*\(([^()]*)\))?\s*$/i);
  if (!match) return null;
  const roleTitle = trimToText(match[1]);
  const company = trimToText(match[2]);
  const dates = trimToText(match[3]);
  if (!roleTitle || !company) return null;
  return { company, roleTitle, ...(dates ? { dates } : {}) };
}

function isImplicitBulletCandidate(line: string): boolean {
  const raw = trimToText(line);
  if (!raw) return false;
  if (looksLikeSentence(raw)) return false;
  if (!startsWithActionVerb(raw)) return false;
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (wordCount > 18) return false;
  if (raw.length > 160) return false;
  return true;
}

function readExperienceHeaderAt(
  lines: string[],
  startIndex: number,
): { header: { company: string; roleTitle: string; dates?: string }; consumed: number } | null {
  const line0 = trimToText(lines[startIndex] ?? '');
  if (!line0 || isBulletLine(line0)) return null;

  const single = parseExperienceHeaderLine(line0) ?? parseRoleAtCompany(line0);
  if (single) return { header: single, consumed: 1 };

  // Prevent bullet-like prose from being misclassified as a multi-line header's company line.
  if (startsWithActionVerb(line0) || looksLikeSentence(line0)) {
    return null;
  }

  const line1 = trimToText(lines[startIndex + 1] ?? '');
  if (line1 && !isBulletLine(line1)) {
    const inlineDates = parseCompanyWithInlineDates(line0);
    if (inlineDates) {
      return {
        header: { company: inlineDates.company, roleTitle: line1, dates: inlineDates.dates },
        consumed: 2,
      };
    }

    const monthYearOnly = MONTH_YEAR_RE;

    // Handle split date ranges like:
    //   "Biblioso October 2023"
    //   "March 2024"
    //   "Senior Program Manager"
    // where company/date were incorrectly treated as company/roleTitle.
    if (looksLikeDatesLine(line1) || monthYearOnly.test(line1)) {
      const trailingStart = parseCompanyWithTrailingStartDate(line0);
      const line2 = trimToText(lines[startIndex + 2] ?? '');
      if (trailingStart && line2 && !isBulletLine(line2) && !looksLikeDatesLine(line2)) {
        return {
          header: {
            company: trailingStart.company,
            roleTitle: line2,
            dates: canonicalizeDateRange(`${trailingStart.start} - ${line1}`),
          },
          consumed: 3,
        };
      }
    }

    const companyWithDates = parseCompanyWithDates(line0);
    if (companyWithDates) {
      return {
        header: { company: companyWithDates.company, roleTitle: line1, ...(companyWithDates.dates ? { dates: companyWithDates.dates } : {}) },
        consumed: 2,
      };
    }

    const company = line0;
    const roleTitle = line1;
    const line2 = trimToText(lines[startIndex + 2] ?? '');
    const maybeDates = line2 && !isBulletLine(line2) && looksLikeDatesLine(line2) ? line2 : undefined;
    return {
      header: { company, roleTitle, ...(maybeDates ? { dates: maybeDates } : {}) },
      consumed: maybeDates ? 3 : 2,
    };
  }

  return null;
}

function extractSectionByType(sections: BaselineSection[], type: string): BaselineSection[] {
  return sections.filter((section) => String((section as any).sectionType ?? '').toUpperCase() === type);
}

export function extractStructuredBaselineFromSections(
  baselineSections: BaselineSection[],
): StructuredBaseline {
  const missingEvidenceReasons: string[] = [];

  const summarySection = extractSectionByType(baselineSections, 'SUMMARY')[0];
  const summary = summarySection ? trimToText((summarySection as any).content) : undefined;

  const skills: string[] = [];
  const skillsSections = extractSectionByType(baselineSections, 'SKILLS');
  for (const section of skillsSections) {
    const raw = String((section as any).content ?? '');
    const lines = splitLines(raw);
    for (const line of lines) {
      if (isBulletLine(line)) {
        const bullet = stripBulletPrefix(line);
        if (bullet) {
          if (bullet.includes(',')) {
            for (const token of bullet.split(',').map((t) => trimToText(t)).filter(Boolean)) {
              skills.push(token);
            }
          } else {
            skills.push(bullet);
          }
        }
        continue;
      }
      // Also accept comma-separated skill lines.
      if (line.includes(',')) {
        for (const token of line.split(',').map((t) => trimToText(t)).filter(Boolean)) {
          skills.push(token);
        }
      }
    }
  }

  const education: string[] = [];
  const educationSections = extractSectionByType(baselineSections, 'EDUCATION');
  for (const section of educationSections) {
    const raw = String((section as any).content ?? '');
    const lines = splitLines(raw);
    for (const line of lines) {
      if (isBulletLine(line)) {
        const bullet = stripBulletPrefix(line);
        if (bullet) education.push(bullet);
        continue;
      }
      if (line) education.push(line);
    }
  }

  const experience: StructuredBaseline['experience'] = [];
  const experienceSections = extractSectionByType(baselineSections, 'EXPERIENCE');
  for (const section of experienceSections) {
    const raw = String((section as any).content ?? '');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());

    let idx = 0;
    while (idx < lines.length) {
      const headerRead = readExperienceHeaderAt(lines, idx);
      if (!headerRead) {
        idx += 1;
        continue;
      }
      const header = headerRead.header;
      idx += headerRead.consumed;

      if (
        isUnsafeHeaderCandidate(header.company) ||
        isUnsafeHeaderCandidate(header.roleTitle) ||
        !isLikelyCompanyName(header.company)
      ) {
        missingEvidenceReasons.push('Skipped experience entry with malformed company/role title header.');
        continue;
      }

      const bullets: string[] = [];
      while (idx < lines.length) {
        const nextLine = trimToText(lines[idx]);
        if (!nextLine) {
          idx += 1;
          continue;
        }
        // Stop bullets when we see the next header-looking line.
        if (!isBulletLine(nextLine) && readExperienceHeaderAt(lines, idx)) break;
        if (isBulletLine(nextLine)) {
          const bullet = stripBulletPrefix(nextLine);
          if (bullet) bullets.push(bullet);
        } else if (isImplicitBulletCandidate(nextLine)) {
          bullets.push(nextLine);
        }
        idx += 1;
      }

      experience.push({
        company: header.company,
        roleTitle: header.roleTitle,
        ...(header.dates ? { dates: header.dates } : {}),
        bullets,
        source: 'baseline',
      });
    }
  }

  if (experience.length === 0) {
    missingEvidenceReasons.push('No safely structured experience entries found (company + role title required).');
  }

  const structured: StructuredBaseline = {
    summary: summary || undefined,
    experience,
    education,
    skills,
    missingEvidenceReasons,
  };

  return structured;
}

