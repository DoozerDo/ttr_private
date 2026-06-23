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
  diagnostics?: {
    structuredExtractionStage: string;
    structuredBaselineExperienceCount: number;
    detectedExperienceHeaders: Array<{ company: string; roleTitle: string; dates?: string }>;
    rejectedExperienceHeaders: Array<{ company: string; roleTitle: string; dates?: string; reason: string }>;
    headerNormalizationFailures: string[];
    parsedEmployerRoleKeys: string[];
  };
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : trimToText(value);
}

function splitLines(value: string): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function getSectionText(section: BaselineSection): string {
  const content = (section as any)?.content;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    const rawContent = (content as any)?.rawContent;
    if (typeof rawContent === 'string') return rawContent;
    const innerContent = (content as any)?.content;
    if (typeof innerContent === 'string') return innerContent;
  }
  return '';
}

function isBulletLine(line: string): boolean {
  return /^[-•*]\s+/.test(line);
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[-•*]\s+/, '').trim();
}

const MONTH_YEAR_TOKEN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+(?:19|20)\\d{2}';
const MONTH_YEAR_RE = new RegExp(`\\b${MONTH_YEAR_TOKEN}\\b`, 'i');

function normalizeDateRangeSeparators(text: string): string {
  return String(text ?? '')
    .replace(/\u00C3\u00A2\u00E2\u0082\u00AC\u00E2\u0080\u009D/g, '-')
    .replace(/\u00E2\u0080\u0094/g, '-')
    .replace(/\u00E2\u0080\u0093/g, '-')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\s+to\s+/gi, ' - ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingLocationFromDatesLine(value: string): string {
  const raw = trimToText(value);
  if (!raw) return '';
  const normalized = normalizeDateRangeSeparators(raw);
  const monthYearStart = new RegExp(`^(${MONTH_YEAR_TOKEN})\\b`, 'i');
  const yearStart = /^(19|20)\d{2}\b/;
  const tokens = normalized.split(' ').filter(Boolean);
  for (let i = 0; i < Math.min(tokens.length, 6); i += 1) {
    const candidate = tokens.slice(i).join(' ');
    if (monthYearStart.test(candidate) || yearStart.test(candidate)) return candidate;
  }
  return normalized;
}

function canonicalizeDateRange(text: string): string {
  const normalized = normalizeDateRangeSeparators(stripLeadingLocationFromDatesLine(text));
  const parts = normalized.split(' - ').map((part) => trimToText(part)).filter(Boolean);
  if (parts.length < 2) return normalized;
  const start = parts[0];
  const end = parts.slice(1).join(' - ');
  const canonicalEnd = /\bcurrent\b/i.test(end) ? 'Present' : end;
  return `${start} – ${canonicalEnd}`.replace(/\s+/g, ' ').trim();
}

function splitCanonicalDateRangeText(value: string): { start_date?: string; end_date?: string } {
  const text = trimToText(value);
  if (!text) return {};
  const normalized = normalizeDateRangeSeparators(text);
  const parts = normalized.split(' - ').map((part) => trimToText(part)).filter(Boolean);
  if (parts.length >= 2) {
    return { start_date: parts[0], end_date: parts.slice(1).join(' - ') };
  }
  if (parts.length === 1) {
    return { start_date: parts[0] };
  }
  return {};
}

function looksLikeDatesLine(value: string): boolean {
  const raw = trimToText(value);
  if (!raw) return false;
  const normalized = normalizeDateRangeSeparators(stripLeadingLocationFromDatesLine(raw));
  const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
  const looksLikeMonthYear = MONTH_YEAR_RE.test(normalized);
  const looksLikeRange =
    (looksLikeMonthYear || hasYear) &&
    (normalized.includes(' - ') || /\b(?:present|current)\b/i.test(normalized));
  return (hasYear || looksLikeMonthYear) && normalized.split(/\s+/).length <= 12 && looksLikeRange;
}

function looksLikeRoleTitle(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  return /\b(?:engineer|architect|administrator|sysadmin|developer|technician|specialist|founder|co-?founder|webmaster|assistant|manager|director|analyst|lead|program)\b/i.test(
    text,
  );
}

function isLikelyCompanyName(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  if (
    /\b(?:program\s+manager|project\s+manager|product\s+manager|support\s+operations|operations|customer\s+experience|customer\s+success|engineer|architect|administrator|sysadmin|developer|technician|specialist|founder|co-?founder|webmaster|assistant|manager|director|analyst|contractor|consultant|lead)\b/i.test(
      text,
    ) &&
    !/\b(?:inc|inc\.|llc|l\.l\.c\.|co|co\.|corp|corp\.|ltd|ltd\.|pllc|pllc\.)\b/i.test(text)
  ) {
    return false;
  }
  if (/\b(?:professional\s+experience|experience|project|projects|skills|education|summary)\b/i.test(text)) {
    return false;
  }
  if (
    /\b(?:automation\s*&\s*monitoring|datacenter\s+operations|internal\s+web\s+applications|internal\s+tooling\s*&\s*software\s+development|earlier\s+career)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (/\b(?:vue|react|angular|frontend|back\s*end|full[-\s]*stack|builder)\b/i.test(text)) {
    return false;
  }
  if (/^\p{Ll}[\s\S]*$/u.test(text) || /^[,;:)\-]/.test(text) || /[,:;]\s*$/.test(text)) {
    return false;
  }
  const openParens = (text.match(/\(/g) ?? []).length;
  const closeParens = (text.match(/\)/g) ?? []).length;
  if (openParens !== closeParens) return false;
  const stateSuffixMatch = text.match(
    /^(?:[A-Za-z][A-Za-z .'-]+),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b\.?$/i,
  );
  const locationLike =
    Boolean(stateSuffixMatch) ||
    /^(?:Seattle|San Francisco|New York|Los Angeles|Austin|Chicago|Boston|Denver|Portland|Miami|Dallas|Houston|Phoenix|San Diego|San Jose)\b/i.test(
      text,
    );
  if (locationLike && text.split(/\s+/).length <= 4) return false;
  return true;
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

function looksLikeSentence(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  if (/[.!?]\s*$/.test(text)) {
    // Avoid treating common company suffix punctuation as prose.
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 6 && /\b(?:inc|inc\.|llc|l\.l\.c\.|co|co\.|corp|corp\.|ltd|ltd\.|pllc|pllc\.)\b/i.test(text)) {
      return false;
    }
    return true;
  }
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

function parseExperienceHeaderLine(line: string): { company: string; roleTitle: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;

  // Prefer explicit pipe-separated headers:
  // "Company | Role Title | 2020 - 2024"
  if (raw.includes('|')) {
    const parts = raw.split('|').map((p) => trimToText(p)).filter(Boolean);
    if (parts.length < 2) return null;
    let [company, roleTitle, dates] = parts;
    if (!company || !roleTitle) return null;

    // Support role-first pipe ordering observed in some baselines:
    // "Senior Program Manager | Example Co | 2020 - 2024"
    const companyLooksWrong = !isLikelyCompanyName(company) && isLikelyCompanyName(roleTitle);
    const roleFirstOrdering = looksLikeRoleTitle(company) && isLikelyCompanyName(roleTitle);
    if (companyLooksWrong || roleFirstOrdering) {
      const swappedCompany = roleTitle;
      const swappedRole = company;
      company = swappedCompany;
      roleTitle = swappedRole;
    }

    if (!company || !roleTitle) return null;
    return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  // Support "Company — Role Title — dates" and "Company - Role Title - dates"
  const dashParts = raw.split(/\s[—–-]\s/).map((p) => trimToText(p)).filter(Boolean);
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

    let [company, roleTitle, dates] = dashParts;
    if (!company || !roleTitle) return null;

    // Support role-first dash headers observed in production:
    // "Senior Manager, Customer Operations – SentinelOne"
    // "Director, Cloud Development and Support – CenturyLink Business for Enterprise"
    if (!isLikelyCompanyName(company) && isLikelyCompanyName(roleTitle)) {
      const swappedCompany = roleTitle;
      const swappedRole = company;
      company = swappedCompany;
      roleTitle = swappedRole;
    }

    if (!company || !roleTitle) return null;
    return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  return null;
}

function isImplicitBulletCandidate(line: string): boolean {
  const raw = trimToText(line);
  if (!raw) return false;
  // Accept lightly structured bullet-like lines without explicit bullet prefixes.
  // Many strong resumes use sentence punctuation; require an action-verb start to avoid
  // promoting arbitrary prose into bullets.
  if (!startsWithActionVerb(raw)) return false;
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (wordCount > 28) return false;
  if (raw.length > 160) return false;
  return true;
}

function isBulletPrefixedExperienceHeader(line: string): boolean {
  const raw = trimToText(line);
  if (!raw || !isBulletLine(raw)) return false;
  const candidate = stripBulletPrefix(raw);
  if (!candidate) return false;
  const parsed = parseExperienceHeaderLine(candidate) ?? parseRoleAtCompany(candidate);
  return Boolean(parsed && parsed.company && parsed.roleTitle);
}

function readExperienceHeaderAt(
  lines: string[],
  startIndex: number,
): { header: { company: string; roleTitle: string; dates: string }; consumed: number } | null {
  const line0 = trimToText(lines[startIndex] ?? '');
  if (!line0) return null;

  // Some baselines (PDF/DOCX conversions) represent experience headers as bullet-prefixed lines.
  // Treat "- Company | Role | Dates" as a header candidate, not an experience bullet.
  const headerCandidate0 = isBulletLine(line0) ? stripBulletPrefix(line0) : line0;
  if (!headerCandidate0) return null;

  const single = parseExperienceHeaderLine(headerCandidate0) ?? parseRoleAtCompany(headerCandidate0);
  if (single) {
    const line1 = trimToText(lines[startIndex + 1] ?? '');
    if (line1 && !isBulletLine(line1) && looksLikeDatesLine(line1)) {
      const dates = canonicalizeDateRange(line1);
      return {
        header: {
          company: single.company,
          roleTitle: single.roleTitle,
          dates,
        },
        consumed: 2,
      };
    }
    if (single.dates) {
      const dates = canonicalizeDateRange(single.dates);
      const splitDates = splitCanonicalDateRangeText(dates);
      if (splitDates.start_date && splitDates.end_date) {
        return {
          header: {
            company: single.company,
            roleTitle: single.roleTitle,
            dates,
          },
          consumed: 1,
        };
      }
    }
    return null;
  }

  // Prevent bullet-like prose from being misclassified as a multi-line header's company line.
  if (startsWithActionVerb(headerCandidate0) || looksLikeSentence(headerCandidate0)) {
    return null;
  }

  const line1 = trimToText(lines[startIndex + 1] ?? '');
  if (line1 && !isBulletLine(line1)) {
    const inlineDates = parseCompanyWithInlineDates(headerCandidate0);
    if (inlineDates) {
      const splitDates = splitCanonicalDateRangeText(inlineDates.dates);
      if (!splitDates.start_date || !splitDates.end_date) return null;
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
      const trailingStart = parseCompanyWithTrailingStartDate(headerCandidate0);
      const line2 = trimToText(lines[startIndex + 2] ?? '');
      if (trailingStart && line2 && !isBulletLine(line2) && !looksLikeDatesLine(line2)) {
        const dates = canonicalizeDateRange(`${trailingStart.start} - ${line1}`);
        const splitDates = splitCanonicalDateRangeText(dates);
        if (!splitDates.start_date || !splitDates.end_date) return null;
        return {
          header: {
            company: trailingStart.company,
            roleTitle: line2,
            dates,
          },
          consumed: 3,
        };
      }
    }

    const companyWithDates = parseCompanyWithDates(headerCandidate0);
    if (companyWithDates) {
      const dates = companyWithDates.dates ? canonicalizeDateRange(companyWithDates.dates) : '';
      const splitDates = dates ? splitCanonicalDateRangeText(dates) : {};
      if (splitDates.start_date && splitDates.end_date && looksLikeRoleTitle(line1)) {
        return {
          header: { company: companyWithDates.company, roleTitle: line1, dates },
          consumed: 2,
        };
      }
    }

    const line2 = trimToText(lines[startIndex + 2] ?? '');
    const maybeDates = line2 && !isBulletLine(line2) && looksLikeDatesLine(line2) ? canonicalizeDateRange(line2) : null;
    const splitMaybeDates = maybeDates ? splitCanonicalDateRangeText(maybeDates) : {};

    // Common PDF-derived ordering: role title first, company second, optional dates third.
    // Example:
    //   "Technical Architect & Full-Stack Engineer"
    //   "Of Fates Games LLC"
    //   "May 2021 – Present"
    const line0LooksLikeCompany = isLikelyCompanyName(headerCandidate0);
    const line1LooksLikeCompany = isLikelyCompanyName(line1);
    const line0LooksLikeRole = looksLikeRoleTitle(headerCandidate0);
    if ((!line0LooksLikeCompany || line0LooksLikeRole) && line1LooksLikeCompany) {
      if (!splitMaybeDates.start_date || !splitMaybeDates.end_date) return null;
      return {
        header: { company: line1, roleTitle: headerCandidate0, dates: maybeDates ?? '' },
        consumed: maybeDates ? 3 : 2,
      };
    }

    if (line0LooksLikeCompany && looksLikeRoleTitle(line1)) {
      if (!splitMaybeDates.start_date || !splitMaybeDates.end_date) return null;
      return {
        header: { company: headerCandidate0, roleTitle: line1, dates: maybeDates ?? '' },
        consumed: maybeDates ? 3 : 2,
      };
    }

    if (line0LooksLikeCompany && line1 && looksLikeDatesLine(line1)) {
      const line2 = trimToText(lines[startIndex + 2] ?? '');
      if (line2 && !isBulletLine(line2) && looksLikeRoleTitle(line2)) {
        const dates = canonicalizeDateRange(line1);
        const splitDates = splitCanonicalDateRangeText(dates);
        if (!splitDates.start_date || !splitDates.end_date) return null;
        return {
          header: { company: headerCandidate0, roleTitle: line2, dates },
          consumed: 3,
        };
      }
    }
  }

  return null;
}

function extractSectionByType(sections: BaselineSection[], type: string): BaselineSection[] {
  const normalized = type.toUpperCase();
  const synonyms =
    normalized === 'EXPERIENCE'
      ? new Set(['EXPERIENCE', 'PROFESSIONAL_EXPERIENCE', 'WORK_EXPERIENCE'])
      : new Set([normalized]);
  return sections.filter((section) => {
    const sectionType = String((section as any).sectionType ?? (section as any).type ?? '').toUpperCase();
    return synonyms.has(sectionType);
  });
}

export function extractStructuredBaselineFromSections(
  baselineSections: BaselineSection[],
): StructuredBaseline {
  const missingEvidenceReasons: string[] = [];
  const diagnosticsEnabled = process.env.DOCGEN_DIAGNOSTICS === 'true';
  const detectedExperienceHeaders: Array<{ company: string; roleTitle: string; dates?: string }> = [];
  const rejectedExperienceHeaders: Array<{ company: string; roleTitle: string; dates?: string; reason: string }> = [];
  const headerNormalizationFailures: string[] = [];
  const parsedEmployerRoleKeys: string[] = [];
  const structuredExtractionStage = 'structured_baseline_extractor_v2';

  const summarySection = extractSectionByType(baselineSections, 'SUMMARY')[0];
  const summary = summarySection ? trimToText(getSectionText(summarySection)) : undefined;

  const skills: string[] = [];
  const skillsSections = extractSectionByType(baselineSections, 'SKILLS');
  for (const section of skillsSections) {
    const raw = getSectionText(section);
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
    const raw = getSectionText(section);
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
	    const raw = getSectionText(section);
	    // Normalize and drop empty lines so header reads (company/role/date) don't fail when
	    // PDF-derived resumes insert blank spacer lines between header components.
	    const lines = raw
	      .split(/\r?\n/)
	      .map((l) => l.replace(/\s+/g, ' ').trim())
	      .filter(Boolean);

    let idx = 0;
    while (idx < lines.length) {
      const headerRead = readExperienceHeaderAt(lines, idx);
      if (!headerRead) {
        idx += 1;
        continue;
      }
      const header = headerRead.header;
      idx += headerRead.consumed;
      if (diagnosticsEnabled) {
        detectedExperienceHeaders.push({
          company: safeText(header.company).slice(0, 120),
          roleTitle: safeText(header.roleTitle).slice(0, 120),
          ...(header.dates ? { dates: safeText(header.dates).slice(0, 120) } : {}),
        });
      }

      if (
        isUnsafeHeaderCandidate(header.company) ||
        isUnsafeHeaderCandidate(header.roleTitle) ||
        !isLikelyCompanyName(header.company)
      ) {
        missingEvidenceReasons.push('Skipped experience entry with malformed company/role title header.');
        if (diagnosticsEnabled) {
          rejectedExperienceHeaders.push({
            company: safeText(header.company).slice(0, 120),
            roleTitle: safeText(header.roleTitle).slice(0, 120),
            ...(header.dates ? { dates: safeText(header.dates).slice(0, 120) } : {}),
            reason: !isLikelyCompanyName(header.company) ? 'company_not_likely' : 'unsafe_header_candidate',
          });
        }
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
        if ((!isBulletLine(nextLine) && readExperienceHeaderAt(lines, idx)) || isBulletPrefixedExperienceHeader(nextLine)) break;
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
      if (diagnosticsEnabled) {
        parsedEmployerRoleKeys.push(`${safeText(header.company)}::${safeText(header.roleTitle)}`.slice(0, 200));
      }
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

  if (diagnosticsEnabled) {
    structured.diagnostics = {
      structuredExtractionStage,
      structuredBaselineExperienceCount: experience.length,
      detectedExperienceHeaders,
      rejectedExperienceHeaders,
      headerNormalizationFailures,
      parsedEmployerRoleKeys,
    };
  }

  return structured;
}

