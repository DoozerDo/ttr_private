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
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isContactLikeText(value: string): boolean {
  const text = trimToText(value);
  if (!text) return true;
  return (
    /\b(?:https?:\/\/|www\.|linkedin\.com|github\.com|mailto:)\b/i.test(text) ||
    /@/.test(text) ||
    /\+?\d[\d\s().-]{7,}\d/.test(text)
  );
}

function isObviousNonWorkHistoryCompany(value: string): boolean {
  const text = trimToText(value);
  if (!text) return true;
  if (
    /\b(?:technology\s*&\s*tools|operating\s+systems|service\s*&\s*workflow|certifications\s*&\s*development|core\s+areas\s+of\s+expertise|skills|tooling|automation\s*&\s*monitoring|datacenter\s+operations|internal\s+web\s+applications|internal\s+tooling\s*&\s*software\s+development|earlier\s+career)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(?:vue|react|angular|frontend|back\s*end|full[-\s]*stack|builder)\b/i.test(text)) {
    return true;
  }
  if (/^[,;:)\-]/.test(text) || /[,:;]\s*$/.test(text)) return true;
  if (text.includes(')') && !text.includes('(')) return true;
  if (!/[A-Za-z]/.test(text)) return true;
  return false;
}

function looksLikeRoleTitle(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  return /\b(?:engineer|architect|administrator|sysadmin|developer|technician|specialist|founder|co-?founder|webmaster|assistant|manager|director|analyst)\b/i.test(
    text,
  );
}

function isLikelyCompanyName(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  if (
    /\b(?:program\s+manager|project\s+manager|product\s+manager|support\s+operations|operations|customer\s+experience|customer\s+success|engineer|architect|administrator|sysadmin|developer|technician|specialist|founder|co-?founder|webmaster|assistant|manager|director|analyst|contractor|consultant)\b/i.test(
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
    /\b(?:automation\s*&\s*monitoring|datacenter\s+operations|internal\s+web\s+applications|internal\s+tooling\s*&\s+software\s+development|earlier\s+career)\b/i.test(
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

function shouldKeepStructuredExperienceEntry(input: {
  company: string;
  roleTitle: string;
  detailLines: string[];
}): boolean {
  const company = trimToText(input.company);
  const roleTitle = trimToText(input.roleTitle);
  if (!company || !roleTitle) return false;
  if (isContactLikeText(company) || isContactLikeText(roleTitle)) return false;
  if (isObviousNonWorkHistoryCompany(company) || isObviousNonWorkHistoryCompany(roleTitle)) return false;
  if (!Array.isArray(input.detailLines)) return false;
  return true;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const candidate = value as Record<string, unknown>;
      const nested = firstNonEmptyString(candidate.name, candidate.value, candidate.text, candidate.content, candidate.rawContent);
      if (nested) return nested;
    }
  }
  return '';
}

function splitCanonicalDateRangeText(value: string): { start_date?: string; end_date?: string } {
  const text = trimToText(value).replace(/\s*[\u2013\u2014]\s*/g, ' - ');
  if (!text) return {};
  const parts = text.split(/\s+-\s+/).map((part) => trimToText(part)).filter(Boolean);
  if (parts.length >= 2) {
    return { start_date: parts[0], end_date: parts.slice(1).join(' - ') };
  }
  if (parts.length === 1) {
    return { start_date: parts[0] };
  }
  return {};
}

function isTextBulletLine(line: string): boolean {
  return /^[-•*]\s+/.test(trimToText(line));
}

function looksLikeDatesLineText(line: string): boolean {
  const text = trimToText(line);
  if (!text) return false;
  const normalized = text.replace(/\s*[\u2013\u2014]\s*/g, ' - ');
  const yearMatches = normalized.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  return (
    yearMatches.length >= 2 ||
    (yearMatches.length >= 1 && (normalized.includes(' - ') || /\b(?:present|current)\b/i.test(normalized)))
  );
}

function isImplicitBulletCandidate(line: string): boolean {
  const text = trimToText(line);
  if (!text) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 28 || text.length > 180) return false;
  return /^(?:designed|built|led|managed|created|implemented|developed|owned|improved|reduced|increased|delivered|supported|maintained|coordinated|partnered|collaborated|architected|automated|migrated|troubleshot|resolved)\b/i.test(
    text,
  );
}

function stripTrailingDateFragment(value: string): string {
  const text = trimToText(value).replace(/\s*[\u2013\u2014]\s*/g, ' - ');
  if (!text) return '';
  return text
    .replace(
      /\s+(?:[A-Za-z]{3,9}\s+)?(?:19|20)\d{2}(?:\s*-\s*(?:[A-Za-z]{3,9}\s+)?(?:19|20)\d{2}|\s*-\s*(?:present|current))?$/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSimpleExperienceHeaderLine(line: string): { company: string; roleTitle: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;
  if (looksLikeDatesLineText(raw)) return null;

  if (raw.includes('|')) {
    const parts = raw.split('|').map((part) => trimToText(part)).filter(Boolean);
    if (parts.length < 2) return null;
    let [company, roleTitle, dates] = parts;
    if (!company || !roleTitle) return null;
    if (!isLikelyCompanyName(company) && isLikelyCompanyName(roleTitle)) {
      [company, roleTitle] = [roleTitle, company];
    }
    company = stripTrailingDateFragment(company);
    roleTitle = trimToText(roleTitle);
    if (!company || !roleTitle) return null;
    return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  const dashParts = raw.split(/\s[—–-]\s/).map((part) => trimToText(part)).filter(Boolean);
  if (dashParts.length >= 2) {
    if (dashParts.length === 2 && looksLikeDatesLineText(dashParts[1])) return null;
    let [left, right, dates] = dashParts;
    if (!left || !right) return null;
    if (!isLikelyCompanyName(left) && isLikelyCompanyName(right)) {
      [left, right] = [right, left];
    }
    if (looksLikeRoleTitle(left) && isLikelyCompanyName(right)) {
      [left, right] = [right, left];
    }
    left = stripTrailingDateFragment(left);
    right = trimToText(right);
    if (!left || !right) return null;
    return { company: left, roleTitle: right, ...(dates ? { dates } : {}) };
  }

  const atMatch = raw.match(/^(.+?)\s+at\s+(.+?)(?:\s*\(([^()]*)\))?\s*$/i);
  if (atMatch) {
    const roleTitle = trimToText(atMatch[1]);
    const company = trimToText(atMatch[2]);
    const dates = trimToText(atMatch[3]);
    if (company && roleTitle) return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  return null;
}

function parseExperienceTextIntoEntries(text: string): Array<Record<string, unknown>> {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => trimToText(line))
    .filter(Boolean)
    .filter((line) => !isFallbackExperienceNoiseLine(line) || isTextBulletLine(line) || looksLikeDatesLineText(line) || Boolean(parseSimpleExperienceHeaderLine(line)));

  const entries: Array<Record<string, unknown>> = [];
  let current:
    | {
        company: string;
        roleTitle: string;
        dates?: string;
        bullets: string[];
      }
    | null = null;

  const flush = () => {
    if (!current) return;
    if (!current.company || !current.roleTitle || current.bullets.length === 0) {
      current = null;
      return;
    }
    entries.push({
      company: current.company,
      role_title: current.roleTitle,
      ...(current.dates ? { dates: current.dates } : {}),
      ...(current.dates ? splitCanonicalDateRangeText(current.dates) : {}),
      details_text: current.bullets.join('\n'),
    });
    current = null;
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const header = parseSimpleExperienceHeaderLine(line);
    if (header) {
      flush();
      current = {
        company: header.company,
        roleTitle: header.roleTitle,
        ...(header.dates ? { dates: header.dates } : {}),
        bullets: [],
      };
      const nextLine = lines[idx + 1] ?? '';
      if (!current.dates && looksLikeDatesLineText(nextLine)) {
        current.dates = trimToText(nextLine);
        idx += 1;
      }
      continue;
    }

    if (!current) continue;

    if (!current.dates && looksLikeDatesLineText(line)) {
      current.dates = trimToText(line);
      continue;
    }

    if (isTextBulletLine(line)) {
      const bullet = trimToText(line.replace(/^[-•*]\s+/, ''));
      if (bullet) current.bullets.push(bullet);
      continue;
    }

    if (isImplicitBulletCandidate(line)) {
      current.bullets.push(line);
    }
  }

  flush();
  return entries;
}

function parseExperienceBlockString(text: string): Array<Record<string, unknown>> {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => trimToText(line))
    .filter(Boolean)
    .filter((line) => !isFallbackExperienceNoiseLine(line) || isTextBulletLine(line) || looksLikeDatesLineText(line) || Boolean(parseSimpleExperienceHeaderLine(line)));

  const entries: Array<Record<string, unknown>> = [];
  let current:
    | {
        company: string;
        roleTitle: string;
        dates?: string;
        bullets: string[];
      }
    | null = null;

  const flush = () => {
    if (!current) return;
    if (!current.company || !current.roleTitle || current.bullets.length === 0) {
      current = null;
      return;
    }
    entries.push({
      company: current.company,
      role_title: current.roleTitle,
      ...(current.dates ? { dates: current.dates } : {}),
      ...(current.dates ? splitCanonicalDateRangeText(current.dates) : {}),
      details_text: current.bullets.join('\n'),
    });
    current = null;
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const header = parseSimpleExperienceHeaderLine(line);
    if (header) {
      flush();
      current = {
        company: header.company,
        roleTitle: header.roleTitle,
        ...(header.dates ? { dates: header.dates } : {}),
        bullets: [],
      };
      const nextLine = lines[idx + 1] ?? '';
      if (!current.dates && looksLikeDatesLineText(nextLine)) {
        current.dates = trimToText(nextLine);
        idx += 1;
      }
      continue;
    }

    if (!current) continue;

    if (!current.dates && looksLikeDatesLineText(line)) {
      current.dates = trimToText(line);
      continue;
    }

    if (isTextBulletLine(line)) {
      const bullet = trimToText(line.replace(/^[-â€¢*]\s+/, ''));
      if (bullet) current.bullets.push(bullet);
      continue;
    }

    if (isImplicitBulletCandidate(line)) {
      current.bullets.push(line);
    }
  }

  flush();
  return entries;
}

function collectArrayTextLines(source: unknown): string[] {
  if (typeof source === 'string') {
    return [trimToText(source)].filter(Boolean);
  }
  if (Array.isArray(source)) {
    return source.flatMap((item) => collectArrayTextLines(item));
  }
  if (isRecordLike(source)) {
    return [
      firstNonEmptyString(
        source.content,
        source.rawContent,
        source.text,
        source.body,
        source.details_text,
        source.detailsText,
        source.description,
        source.value,
        source.title,
      ),
    ].filter(Boolean);
  }
  return [trimToText(source)].filter(Boolean);
}

function buildSyntheticExperienceSectionsFromSource(
  source: unknown,
  baselineId: string,
  depth = 0,
  seen = new Set<object>(),
): Array<Record<string, unknown>> {
  if (depth > 4 || source === null || source === undefined) return [];
  if (Array.isArray(source)) {
    return source.flatMap((item) => buildSyntheticExperienceSectionsFromSource(item, baselineId, depth + 1, seen));
  }
  if (typeof source === 'string') {
    const content = trimToText(source);
    if (!content) return [];
    return [
      {
        id: 'ingestion-experience-synthetic',
        baselineId,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ];
  }
  if (!isRecordLike(source)) return [];
  if (seen.has(source)) return [];
  seen.add(source);

  const record = source as Record<string, unknown>;
  const sections: Array<Record<string, unknown>> = [];
  const directContent = firstNonEmptyString(
    record.content,
    record.rawContent,
    record.text,
    record.value,
    record.body,
    record.details_text,
    record.detailsText,
    record.description,
  );
  if (directContent) {
    sections.push({
      id: 'ingestion-experience-content',
      baselineId,
      sectionType: BaselineSectionType.EXPERIENCE,
      title: firstNonEmptyString(record.title, record.sectionTitle) || 'Experience',
      content: directContent,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
  }

  const nestedSectionCandidates = [
    record.section,
    record.sections,
    record.entries,
    record.items,
    record.blocks,
    record.experience,
    record.work_history,
  ];
  for (const candidate of nestedSectionCandidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        sections.push(...buildSyntheticExperienceSectionsFromSource(item, baselineId, depth + 1, seen));
      }
      continue;
    }
    if (isRecordLike(candidate)) {
      sections.push(...buildSyntheticExperienceSectionsFromSource(candidate, baselineId, depth + 1, seen));
    }
  }

  const directFieldsPresent = Boolean(
    firstNonEmptyString(
      record.company,
      record.company_name,
      record.companyName,
      record.employer,
      record.organization,
      record.organization_name,
      record.org,
      record.role,
      record.role_title,
      record.roleTitle,
      record.title,
      record.position,
      record.position_title,
      record.positionTitle,
      record.job_title,
      record.jobTitle,
    ),
  );
  if (directFieldsPresent) {
    const company = firstNonEmptyString(
      record.company,
      record.company_name,
      record.companyName,
      record.employer,
      record.organization,
      record.organization_name,
      record.org,
      isRecordLike(record.company) ? (record.company as Record<string, unknown>).name : undefined,
    );
    const roleTitle = firstNonEmptyString(
      record.role_title,
      record.roleTitle,
      record.title,
      record.position,
      record.position_title,
      record.positionTitle,
      record.job_title,
      record.jobTitle,
      record.role,
    );
    const dates = firstNonEmptyString(record.dates, record.date_range, record.dateRange, record.start_date, record.end_date);
    const bulletLines = [
      record.details_text,
      record.detailsText,
      record.responsibilities_text,
      record.responsibilitiesText,
      record.description,
    ]
      .flatMap((value) => {
        if (typeof value === 'string') return value.split(/\r?\n/);
        if (Array.isArray(value)) return value.flatMap((item) => (typeof item === 'string' ? item.split(/\r?\n/) : []));
        return [];
      })
      .map((line) => trimToText(line))
      .filter(Boolean);
    const arrayBullets = [
      record.bullets,
      record.highlights,
      record.responsibilities,
      record.details,
      record.items,
      record.lines,
      record.paragraphs,
    ]
      .flatMap((value) => {
        if (!Array.isArray(value)) return [];
        return value.flatMap((item) => {
          if (typeof item === 'string') return item.split(/\r?\n/);
          if (isRecordLike(item)) return [firstNonEmptyString(item.text, item.value, item.content, item.rawContent)];
          return [trimToText(item)];
        });
      })
      .map((line) => trimToText(line))
      .filter(Boolean);
    const allLines = [...bulletLines, ...arrayBullets].filter(Boolean);
    sections.push({
      ...record,
      company,
      role_title: roleTitle,
      ...(company ? { company } : {}),
      ...(roleTitle ? { role_title: roleTitle } : {}),
      ...(dates ? { dates } : {}),
      ...(dates ? splitCanonicalDateRangeText(dates) : {}),
      ...(allLines.length ? { details_text: allLines.join('\n') } : {}),
    });
  }

  return sections;
}

function normalizeParsedExperienceSource(
  source: unknown,
  baselineId: string,
): {
  entries: Array<Record<string, unknown>>;
  experienceType: string;
  experienceKeys: string[];
  rejectionReasons: Array<{ reason: string; count: number; sampleKeys: string[] }>;
  arrayDiagnostics?: {
    length: number;
    elementTypes: string[];
    redactedSamples: Array<{ type: string; sample: string }>;
    rejectionReasons: Array<{ type: string; reason: string; sample: string }>;
  };
} {
  const experienceType = Array.isArray(source) ? 'array' : source === null ? 'null' : typeof source;
  const experienceKeys = isRecordLike(source) ? Object.keys(source).slice(0, 40) : [];
  const rejectionReasons: Array<{ reason: string; count: number; sampleKeys: string[] }> = [];
  const arrayDiagnostics = Array.isArray(source)
    ? {
        length: source.length,
        elementTypes: [] as string[],
        redactedSamples: [] as Array<{ type: string; sample: string }>,
        rejectionReasons: [] as Array<{ type: string; reason: string; sample: string }>,
      }
    : undefined;

  const addReason = (reason: string, sampleSource: unknown) => {
    const sampleKeys =
      sampleSource && typeof sampleSource === 'object' && !Array.isArray(sampleSource)
        ? Object.keys(sampleSource as Record<string, unknown>).slice(0, 12)
        : [];
    const existing = rejectionReasons.find((entry) => entry.reason === reason);
    if (existing) {
      existing.count += 1;
      return;
    }
    rejectionReasons.push({ reason, count: 1, sampleKeys });
  };

  const normalizeEntryRecord = (entry: Record<string, unknown>): Record<string, unknown> => {
    const company = firstNonEmptyString(
      entry.company_name,
      entry.companyName,
      entry.company,
      entry.employer,
      entry.organization,
      entry.organization_name,
      entry.org,
      isRecordLike(entry.company) ? (entry.company as Record<string, unknown>).name : undefined,
    );
    const role = firstNonEmptyString(
      entry.role_title,
      entry.roleTitle,
      entry.title,
      entry.position,
      entry.position_title,
      entry.positionTitle,
      entry.job_title,
      entry.jobTitle,
      entry.role,
    );
    const dates = firstNonEmptyString(entry.dates, entry.date_range, entry.dateRange, entry.start_date, entry.end_date);
    const bulletSources = [
      entry.details_text,
      entry.detailsText,
      entry.responsibilities_text,
      entry.responsibilitiesText,
      entry.description,
    ];
    const arrayBulletSources = [
      entry.bullets,
      entry.highlights,
      entry.responsibilities,
      entry.details,
      entry.lines,
      entry.paragraphs,
    ];
    const detailsText = [
      ...bulletSources.flatMap((value) => {
        if (typeof value === 'string') return value.split(/\r?\n/);
        if (Array.isArray(value)) {
          return value.flatMap((item) => {
            if (typeof item === 'string') return item.split(/\r?\n/);
            if (isRecordLike(item)) return [firstNonEmptyString(item.text, item.value, item.content, item.rawContent)];
            return [trimToText(item)];
          });
        }
        return [];
      }),
      ...arrayBulletSources.flatMap((value) => {
        if (!Array.isArray(value)) return [];
        return value.flatMap((item) => {
          if (typeof item === 'string') return item.split(/\r?\n/);
          if (isRecordLike(item)) return [firstNonEmptyString(item.text, item.value, item.content, item.rawContent)];
          return [trimToText(item)];
        });
      }),
      ...[
        entry.content,
        entry.rawContent,
        entry.text,
        entry.body,
      ].flatMap((value) => (typeof value === 'string' ? value.split(/\r?\n/) : [])),
    ]
      .map((line) => trimToText(line))
      .filter(Boolean)
      .filter((line) => !isFallbackExperienceNoiseLine(line));

    const normalized: Record<string, unknown> = { ...entry };
    if (company) normalized.company = company;
    if (role) normalized.role_title = role;
    if (dates) {
      normalized.dates = dates;
      const splitDates = splitCanonicalDateRangeText(dates);
      if (splitDates.start_date) normalized.start_date = splitDates.start_date;
      if (splitDates.end_date) normalized.end_date = splitDates.end_date;
    }
    if (detailsText.length) normalized.details_text = detailsText.join('\n');
    return normalized;
  };

  const parseTextSource = (text: string): Array<Record<string, unknown>> => {
    const manualEntries = parseExperienceTextIntoEntries(text);
    if (manualEntries.length) return manualEntries;
    const sections = buildSyntheticExperienceSectionsFromSource(text, baselineId);
    const structured = sections.length ? extractStructuredBaselineFromSections(sections as any) : null;
    const structuredEntries = Array.isArray((structured as any)?.experience)
      ? ((structured as any).experience as Array<Record<string, unknown>>)
      : [];
    if (structuredEntries.length > 0) {
      return structuredEntries
        .map((entry) => {
          const dates = firstNonEmptyString(entry.dates);
          const splitDates = dates ? splitCanonicalDateRangeText(dates) : {};
          return {
            company: firstNonEmptyString(entry.company),
            role_title: firstNonEmptyString(entry.roleTitle),
            ...(dates ? { dates } : {}),
            ...(splitDates.start_date ? { start_date: splitDates.start_date } : {}),
            ...(splitDates.end_date ? { end_date: splitDates.end_date } : {}),
            ...(Array.isArray(entry.bullets) && entry.bullets.length
              ? { details_text: entry.bullets.map((bullet) => trimToText(bullet)).filter(Boolean).join('\n') }
              : {}),
          };
        })
        .filter((entry) => Boolean(entry.company && entry.role_title));
    }

    addReason('structured_extraction_returned_no_experience', { text });
    return [];
  };

  const normalizeArrayElement = (item: unknown, index: number): Array<Record<string, unknown>> => {
    const elementType = Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item;
    if (arrayDiagnostics) {
      arrayDiagnostics.elementTypes.push(elementType);
      const rawSample = trimToText(
        typeof item === 'string'
          ? item
          : isRecordLike(item)
            ? firstNonEmptyString(
                (item as Record<string, unknown>).content,
                (item as Record<string, unknown>).rawContent,
                (item as Record<string, unknown>).text,
                (item as Record<string, unknown>).body,
              )
            : item,
      );
      if (rawSample) {
        arrayDiagnostics.redactedSamples.push({ type: elementType, sample: rawSample.slice(0, 120) });
      }
    }

    if (Array.isArray(item)) {
      const hasStructuredObjectEntry = item.some((nested) => {
        if (!isRecordLike(nested)) return false;
        return Boolean(
          firstNonEmptyString(
            nested.company,
            nested.company_name,
            nested.companyName,
            nested.employer,
            nested.organization,
            nested.organization_name,
            nested.org,
            nested.role_title,
            nested.roleTitle,
            nested.position,
            nested.position_title,
            nested.positionTitle,
            nested.job_title,
            nested.jobTitle,
            nested.role,
          ),
        );
      });

      if (!hasStructuredObjectEntry) {
        const joinedText = collectArrayTextLines(item).join('\n').trim();
        if (joinedText) {
          const blockEntries = parseExperienceBlockString(joinedText);
          if (blockEntries.length) return blockEntries;
          const parsedTextEntries = parseTextSource(joinedText);
          if (parsedTextEntries.length) return parsedTextEntries;
        }
      }

      return item.flatMap((nested, nestedIndex) => normalizeArrayElement(nested, index * 1000 + nestedIndex));
    }

    if (typeof item === 'string') {
      const entries = parseExperienceBlockString(item);
      if (entries.length === 0) {
        const fallbackEntries = parseTextSource(item);
        if (fallbackEntries.length) return fallbackEntries;
      }
      if (entries.length === 0 && arrayDiagnostics) {
        arrayDiagnostics.rejectionReasons.push({
          type: 'string',
          reason: 'unusable_string_experience_entry',
          sample: trimToText(item).slice(0, 120),
        });
      }
      return entries;
    }

    if (!isRecordLike(item)) {
      if (arrayDiagnostics) {
        arrayDiagnostics.rejectionReasons.push({
          type: elementType,
          reason: 'non_object_entry',
          sample: trimToText(item).slice(0, 120),
        });
      }
      return [];
    }

    const record = item as Record<string, unknown>;
    const hasSectionPayloadShape = Boolean(
      firstNonEmptyString(record.content, record.rawContent, record.text, record.body) ||
        record.sectionType ||
        record.type ||
        record.title ||
        record.sectionTitle ||
        record.sections ||
        record.section ||
        record.entries ||
        record.items ||
        record.blocks,
    );
    const directFieldsPresent = Boolean(
      firstNonEmptyString(
        record.company,
        record.company_name,
        record.companyName,
        record.employer,
        record.organization,
        record.organization_name,
        record.org,
        record.role_title,
        record.roleTitle,
        record.position,
        record.position_title,
        record.positionTitle,
        record.job_title,
        record.jobTitle,
      ),
    );

    if (hasSectionPayloadShape && !directFieldsPresent) {
      const sections = buildSyntheticExperienceSectionsFromSource(record, baselineId);
      if (sections.length) {
        const structured = extractStructuredBaselineFromSections(sections as any);
        const structuredEntries = Array.isArray((structured as any)?.experience)
          ? ((structured as any).experience as Array<Record<string, unknown>>)
          : [];
        if (structuredEntries.length) {
          return structuredEntries.map((entry) => {
            const dates = firstNonEmptyString(entry.dates);
            const splitDates = dates ? splitCanonicalDateRangeText(dates) : {};
            return {
              company: firstNonEmptyString(entry.company),
              role_title: firstNonEmptyString(entry.roleTitle),
              ...(dates ? { dates } : {}),
              ...(splitDates.start_date ? { start_date: splitDates.start_date } : {}),
              ...(splitDates.end_date ? { end_date: splitDates.end_date } : {}),
              ...(Array.isArray(entry.bullets) && entry.bullets.length
                ? { details_text: entry.bullets.map((bullet) => trimToText(bullet)).filter(Boolean).join('\n') }
                : {}),
            };
          });
        }
      }
    }

    const normalized = normalizeEntryRecord(record);
    if (firstNonEmptyString(normalized.company, normalized.role_title, normalized.details_text, normalized.content, normalized.rawContent, normalized.text)) {
      return [normalized];
    }

    if (arrayDiagnostics) {
      arrayDiagnostics.rejectionReasons.push({
        type: 'object',
        reason: 'object_entry_unusable',
        sample: JSON.stringify(Object.keys(record).slice(0, 12)).slice(0, 120),
      });
    }
    return [];
  };

  if (Array.isArray(source)) {
    const entries = source.flatMap((item, index) => normalizeArrayElement(item, index));
    if (entries.length === 0) {
      addReason('array_experience_source_had_no_object_entries', source);
      if (arrayDiagnostics) {
        arrayDiagnostics.rejectionReasons.push({
          type: 'array',
          reason: 'array_experience_source_had_no_object_entries',
          sample: `length=${source.length}`,
        });
      }
    }
    return { entries, experienceType, experienceKeys, rejectionReasons, ...(arrayDiagnostics ? { arrayDiagnostics } : {}) };
  }

  if (typeof source === 'string') {
    const entries = parseTextSource(source);
    if (entries.length === 0) addReason('string_experience_source_unusable', source);
    return { entries, experienceType, experienceKeys, rejectionReasons };
  }

  if (!isRecordLike(source)) {
    if (source !== null && source !== undefined) addReason('experience_source_not_record_like', source);
    return { entries: [], experienceType, experienceKeys, rejectionReasons };
  }

  const record = source as Record<string, unknown>;
  const directFieldsPresent = Boolean(
    firstNonEmptyString(
      record.company,
      record.company_name,
      record.companyName,
      record.employer,
      record.organization,
      record.organization_name,
      record.org,
      record.role_title,
      record.roleTitle,
      record.position,
      record.position_title,
      record.positionTitle,
      record.job_title,
      record.jobTitle,
    ),
  );
  if (directFieldsPresent) {
    const entry = normalizeEntryRecord(record);
    if (firstNonEmptyString(entry.company, entry.role_title, entry.details_text, entry.content, entry.rawContent, entry.text)) {
      return { entries: [entry], experienceType, experienceKeys, rejectionReasons };
    }
    addReason('direct_experience_fields_unusable', record);
    return { entries: [], experienceType, experienceKeys, rejectionReasons };
  }

  const nestedSources = [
    record.experience,
    record.work_history,
    record.sections,
    record.section,
    record.entries,
    record.items,
    record.blocks,
  ];
  const nestedEntries = nestedSources.flatMap((nested) => normalizeParsedExperienceSource(nested, baselineId).entries);
  if (nestedEntries.length) {
    return { entries: nestedEntries, experienceType, experienceKeys, rejectionReasons };
  }

  const textEntries = parseTextSource(
    [
      record.content,
      record.rawContent,
      record.text,
      record.body,
      record.details_text,
      record.detailsText,
      record.description,
    ]
      .map((value) => (typeof value === 'string' ? value : ''))
      .filter(Boolean)
      .join('\n\n'),
  );
  if (textEntries.length) {
    return { entries: textEntries, experienceType, experienceKeys, rejectionReasons };
  }

  addReason('no_usable_experience_shape_found', record);
  return { entries: [], experienceType, experienceKeys, rejectionReasons };
}

function summarizeThematicEvidenceDiagnostics(parsedBaseline: Record<string, unknown>) {
  const thematicFieldNames = [
    'people_leadership',
    'operational_ownership',
    'tooling_and_platforms',
    'cross_functional_partnership',
    'customer_advocacy',
    'scale_and_scope',
    'metrics_and_outcomes',
    'skills_and_tools',
  ] as const;

  const summarizeValue = (value: unknown): string => {
    if (typeof value === 'string') return value.slice(0, 120);
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 4)
        .join(' | ')
        .slice(0, 120);
    }
    if (value && typeof value === 'object') {
      return JSON.stringify(Object.entries(value as Record<string, unknown>).slice(0, 4)).slice(0, 120);
    }
    return String(value ?? '').slice(0, 120);
  };

  return thematicFieldNames.map((field) => {
    const value = parsedBaseline[field];
    const hasContent =
      Array.isArray(value)
        ? value.length > 0
        : value && typeof value === 'object'
          ? Object.values(value as Record<string, unknown>).some((item) => {
              if (Array.isArray(item)) return item.length > 0;
              if (typeof item === 'string') return item.trim().length > 0;
              return item !== null && item !== undefined && item !== false;
            })
          : typeof value === 'string'
            ? value.trim().length > 0
            : value !== null && value !== undefined && value !== false;

    return {
      field,
      hasContent,
      rejectionReason: hasContent ? 'missing_company_role_dates_bullets' : 'empty_thematic_field',
      sample: summarizeValue(value),
    };
  });
}

function normalizeExperienceHeaderSeparatorText(value: string): string {
  return trimToText(value)
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€”|â€“|â€”|[—–]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyExperienceEntryTitle(value: string): boolean {
  const text = normalizeExperienceHeaderSeparatorText(value);
  if (!text) return false;
  if (/^(?:experience|professional experience|work experience|summary|skills|education|projects?)$/i.test(text)) {
    return false;
  }
  if (text.includes('|')) return true;
  if (/\s-\s/.test(text)) return true;
  if (/\bat\b/i.test(text)) return true;
  return false;
}

function shouldPromoteSectionTitleToExperienceContent(section: Record<string, unknown>): boolean {
  const title = trimToText(section?.title);
  if (!isLikelyExperienceEntryTitle(title)) return false;
  const normalizedTitle = normalizeExperienceHeaderSeparatorText(title);

  const content = typeof section?.content === 'string' ? section.content : '';
  const firstContentLine = content
    .split(/\r?\n/)
    .map((line) => trimToText(line))
    .find(Boolean) ?? '';
  if (!firstContentLine) return true;
  if (normalizeExperienceHeaderSeparatorText(firstContentLine) === normalizedTitle) return false;
  return (
    /^[-•*]\s+/.test(firstContentLine) ||
    /\b(?:19|20)\d{2}\b/.test(firstContentLine) ||
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|present|current)\b/i.test(
      firstContentLine,
    ) ||
    /^(?:led|built|owned|managed|maintained|supported|developed|improved|reduced|increased|partnered|collaborated|architected|automated|migrated|designed|created)\b/i.test(
      firstContentLine,
    )
  );
}

function coerceResumeV2NormalizedDocument(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const normalized = raw as Record<string, unknown>;
  if (!Array.isArray(normalized.experience)) return normalized;

  return {
    ...normalized,
    experience: normalized.experience.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const experienceEntry = entry as Record<string, unknown>;
      const bullets = Array.isArray(experienceEntry.bullets)
        ? experienceEntry.bullets
            .map((bullet) => {
              if (typeof bullet === 'string') return bullet;
              if (!bullet || typeof bullet !== 'object' || Array.isArray(bullet)) {
                return trimToText(bullet);
              }
              const candidate = bullet as Record<string, unknown>;
              return trimToText(candidate.text ?? candidate.value ?? candidate.content ?? '');
            })
            .filter(Boolean)
        : experienceEntry.bullets;
      return {
        ...experienceEntry,
        bullets,
      };
    }),
  };
}

function isFallbackExperienceNoiseLine(line: string): boolean {
  const text = trimToText(line);
  if (!text) return true;
  if (/\b(?:summary|professional summary|profile)\b/i.test(text)) {
    return true;
  }
  if (/^(experience|professional experience|work experience|skills|technical skills|education|certifications?)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:https?:\/\/|www\.|linkedin\.com|github\.com|mailto:)\b/i.test(text) || /@/.test(text)) {
    return true;
  }
  if (/\+?\d[\d\s().-]{7,}\d/.test(text)) {
    return true;
  }
  if (
    text.split(/\s+/).length <= 12 &&
    (
      /\b(?:19|20)\d{2}\b.*(?:[-–—]|to).*\b(?:19|20)\d{2}\b/i.test(text) ||
      (/\b(?:19|20)\d{2}\b/.test(text) && /\b(?:present|current)\b/i.test(text))
    )
  ) {
    return true;
  }
  return false;
}

function classifyStructuredExperienceKeepDrop(input: {
  company: string;
  roleTitle: string;
  detailLines: string[];
}): {
  kept: boolean;
  dropReason: 'missing_company_or_role' | 'obvious_non_work_history_company' | 'obvious_non_work_history_role' | 'missing_detail_lines' | 'kept';
} {
  const company = trimToText(input.company);
  const roleTitle = trimToText(input.roleTitle);
  if (!company || !roleTitle) return { kept: false, dropReason: 'missing_company_or_role' };
  if (isContactLikeText(company)) return { kept: false, dropReason: 'obvious_non_work_history_company' };
  if (isContactLikeText(roleTitle)) return { kept: false, dropReason: 'obvious_non_work_history_role' };
  if (isObviousNonWorkHistoryCompany(company)) return { kept: false, dropReason: 'obvious_non_work_history_company' };
  if (isObviousNonWorkHistoryCompany(roleTitle)) return { kept: false, dropReason: 'obvious_non_work_history_role' };
  if (!Array.isArray(input.detailLines)) return { kept: false, dropReason: 'missing_detail_lines' };
  return { kept: true, dropReason: 'kept' };
}

export type ResumeV2Usability = {
  usable: boolean;
  usableExperienceCount: number;
  reasons: string[];
};

export type BaselineFileReadinessStatus = 'usable' | 'needs_review';

export type BaselineFileDiagnostics = {
  missingRequiredFields: string[];
  validationReasons: string[];
  validationFailures: Array<{
    path: string;
    field: string;
    message: string;
  }>;
};

export type BaselineFileRecord = {
  heading: {
    name: string;
    contactLine: string;
    links?: string[];
  };
  summary?: string;
  competencies?: string[];
  skills?: string[];
  experience: Array<
    NormalizedResumeDocument['experience'][number] & {
      evidence?: Array<{
        id: string;
        text: string;
        source?: 'parsed_baseline' | 'structured_sections' | 'derived_from_bullets';
      }>;
    }
  >;
  education?: Array<
    NonNullable<NormalizedResumeDocument['education']>[number] & {
      evidence?: Array<{
        id: string;
        text: string;
        source?: 'parsed_baseline' | 'structured_sections';
      }>;
    }
  >;
  certifications?: string[];
  diagnostics: BaselineFileDiagnostics;
  readiness: {
    status: BaselineFileReadinessStatus;
    usable: boolean;
  };
};

function collectBaselineDiagnostics(document: NormalizedResumeDocument): BaselineFileDiagnostics {
  const validation = validateNormalizedResumeDocument(document);
  const failures = buildNormalizedResumeValidationFailures(document);
  const missingRequiredFields = Array.from(
    new Set(
      failures
        .filter((failure) => ['heading.name', 'heading.contactLine'].includes(failure.path) || failure.path.startsWith('experience['))
        .map((failure) => failure.path),
    ),
  );

  return {
    missingRequiredFields,
    validationReasons: validation.reasons,
    validationFailures: failures.map((failure) => ({
      path: failure.path,
      field: failure.field,
      message: failure.message,
    })),
  };
}

function buildBaselineFileStatus(diagnostics: BaselineFileDiagnostics): BaselineFileReadinessStatus {
  return diagnostics.missingRequiredFields.length === 0 && diagnostics.validationReasons.length === 0
    ? 'usable'
    : 'needs_review';
}

function buildEvidenceReferences(input: {
  parsedEvidence?: Array<Record<string, unknown>> | null;
  bullets?: string[];
  source: 'parsed_baseline' | 'structured_sections';
}) {
  const parsedEvidence = Array.isArray(input.parsedEvidence)
    ? input.parsedEvidence
        .map((evidence, index) => {
          const text = trimToText(evidence?.text);
          if (!text) return null;
          return {
            id: trimToText(evidence?.id) || `evidence-${index}`,
            text,
            source: input.source,
          };
        })
        .filter(
          (
            value,
          ): value is { id: string; text: string; source: 'parsed_baseline' | 'structured_sections' } =>
            Boolean(value),
        )
    : [];

  if (parsedEvidence.length) return parsedEvidence;

  return (input.bullets ?? [])
    .map((bullet, index) => {
      const text = trimToText(bullet);
      if (!text) return null;
      return { id: `derived-bullet-${index}`, text, source: 'derived_from_bullets' as const };
    })
    .filter(
      (value): value is { id: string; text: string; source: 'derived_from_bullets' } => Boolean(value),
    );
}

export function evaluateResumeV2Usability(resumeV2Json: unknown): ResumeV2Usability {
  if (!resumeV2Json || typeof resumeV2Json !== 'object') {
    return { usable: false, usableExperienceCount: 0, reasons: ['missing_resume_v2'] };
  }
  const normalized = normalizeNormalizedResumeDocument(resumeV2Json as NormalizedResumeDocument);
  const validation = validateNormalizedResumeDocument(normalized);
  const experienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
  if (experienceCount <= 0) {
    return { usable: false, usableExperienceCount: 0, reasons: ['usable_experience_empty'] };
  }
  // Usability gate is intentionally looser than strict normalized validation: extremely short-but-meaningful
  // bullets can still produce a persisted usable draft, even if some strict rules would fail.
  if (!validation.valid) {
    return { usable: true, usableExperienceCount: experienceCount, reasons: ['validation_warnings', ...validation.reasons] };
  }
  return { usable: true, usableExperienceCount: experienceCount, reasons: [] };
}

export function assertUsableResumeV2(resumeV2Json: unknown) {
  const usability = evaluateResumeV2Usability(resumeV2Json);
  if (usability.usable) return usability;
  if (usability.reasons.includes('missing_resume_v2')) {
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_resume_v2_missing',
        message: 'Baseline ResumeV2 is missing. Repair your baseline before generating.',
        details: { usableExperienceCount: 0 },
      },
    });
  }
  const normalized = resumeV2Json && typeof resumeV2Json === 'object'
    ? normalizeNormalizedResumeDocument(resumeV2Json as NormalizedResumeDocument)
    : null;
  const failures = normalized ? buildNormalizedResumeValidationFailures(normalized as any) : [];
  throw new UnprocessableEntityException({
    error: {
      code: 'baseline_resume_v2_invalid',
      message: formatResumeV2InvalidMessage({ reasons: usability.reasons, failures }),
      details: { usableExperienceCount: 0, reasons: usability.reasons, failures },
    },
  });
}

export function buildValidatedResumeV2FromParsedBaseline(
  parsedBaseline: Record<string, unknown>,
  baselineSections?: Array<Record<string, unknown>> | null,
): BaselineFileRecord {
  const shouldLog = process.env.RESUME_V2_INGEST_DEBUG === 'true';
  const baselineId = String(parsedBaseline['baseline_id'] ?? '');
  const inspectedKeys = Object.keys(parsedBaseline).slice(0, 40);
  const rawExperienceSource = parsedBaseline['experience'] ?? parsedBaseline['work_history'];
  const parsedExperienceSourcePresent = rawExperienceSource !== undefined && rawExperienceSource !== null;
  const parsedExperienceArrayEmpty = Array.isArray(rawExperienceSource) && rawExperienceSource.length === 0;
  const parsedExperienceType = Array.isArray(rawExperienceSource)
    ? 'array'
    : rawExperienceSource === null
      ? 'null'
      : typeof rawExperienceSource;
  const parsedExperienceKeys = isRecordLike(rawExperienceSource) ? Object.keys(rawExperienceSource).slice(0, 40) : [];
  let lastParsedExperienceCount: number | null = null;
  let lastMappingStats:
    | {
        selectedEntries: number;
        mappedEntries: number;
        droppedEmptyEntries: number;
        entriesMissingHeader: number;
        entriesMissingDetails: number;
        survivingBlocks: number;
        experienceType: string;
        experienceKeys: string[];
        arrayDiagnostics?: {
          length: number;
          elementTypes: string[];
          redactedSamples: Array<{ type: string; sample: string }>;
          rejectionReasons: Array<{ type: string; reason: string; sample: string }>;
        };
        rejectionReasons: Array<{ reason: string; count: number; sampleKeys: string[] }>;
      }
    | null = null;
  let resumeV2CandidateKeepDrop:
    | Array<{
        company: string;
        roleTitle: string;
        detailLinesCount: number;
        kept: boolean;
        dropReason: 'missing_company_or_role' | 'obvious_non_work_history_company' | 'obvious_non_work_history_role' | 'missing_detail_lines' | 'kept';
      }>
    | null = null;
  if (shouldLog) {
    try {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][ADAPTER_EXEC]', {
        baselineId,
        schemaVersion: String(parsedBaseline['schema_version'] ?? ''),
        sourceFormat: String(parsedBaseline['source_format'] ?? ''),
        parsedExperiencePresent: parsedExperienceSourcePresent,
        parsedExperienceType,
        parsedExperienceKeys,
        parsedExperienceIsArray: Array.isArray(parsedBaseline['experience']),
        parsedWorkHistoryIsArray: Array.isArray(parsedBaseline['work_history']),
        parsedExperienceCount: parsedExperienceSourcePresent
          ? Array.isArray(parsedBaseline['experience'])
            ? (parsedBaseline['experience'] as any[]).length
            : 0
          : null,
        parsedWorkHistoryCount: Array.isArray(parsedBaseline['work_history'])
          ? (parsedBaseline['work_history'] as any[]).length
          : null,
        experienceArrayEmpty: parsedExperienceArrayEmpty,
      });
    } catch {
      // ignore
    }
  }
  const identity = parsedBaseline['identity'] as Record<string, unknown> | undefined;
  const fullName = typeof identity?.['full_name'] === 'string' ? identity['full_name'] : null;
  const location = typeof identity?.['location'] === 'string' ? identity['location'] : null;

  const sections = [
    {
      id: 'ingestion-experience',
      baselineId,
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      content: '',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ] as any[];

  // Prefer authoritative structured baseline sections when available.
  // This prevents parser-specific malformed header mappings (e.g. location-as-company) from becoming ResumeV2 truth
  // when we already have canonical extracted company/role identity from baseline sections.
  const structuredExperienceBlocks = (() => {
    if (!Array.isArray(baselineSections) || baselineSections.length === 0) return null;
    try {
      const structuredBaselineSections = baselineSections.map((section) => {
        if (!shouldPromoteSectionTitleToExperienceContent(section as any)) {
          return section;
        }
        const title = normalizeExperienceHeaderSeparatorText(String(section?.title ?? ''));
        const content = typeof section?.content === 'string' ? section.content.trim() : '';
        return {
          ...section,
          sectionType: BaselineSectionType.EXPERIENCE,
          content: content ? `${title}\n${content}` : title,
        };
      });

      const structured = extractStructuredBaselineFromSections(structuredBaselineSections as any);
      const experience = Array.isArray((structured as any)?.experience) ? ((structured as any).experience as any[]) : [];
      if (experience.length === 0) return null;
      const blocks = experience
        .map((entry) => {
          const company = typeof entry?.company === 'string' ? entry.company.trim() : '';
          const roleTitle = typeof entry?.roleTitle === 'string' ? entry.roleTitle.trim() : '';
          const dates = typeof entry?.dates === 'string' ? entry.dates.trim() : '';
          const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]).map((b) => String(b ?? '').trim()).filter(Boolean) : [];
          const bulletLines = bullets.map((b) => `- ${b.replace(/^[-*Ã¢â‚¬Â¢]\s*/, '')}`);
          if (!shouldKeepStructuredExperienceEntry({ company, roleTitle, detailLines: bulletLines })) return '';
          const header = [company, roleTitle, dates].filter(Boolean).join(' | ');
          return [header, ...bulletLines].join('\n').trim();
        })
        .filter(Boolean);
      return blocks.length ? blocks : null;
    } catch {
      return null;
    }
  })();

  if (structuredExperienceBlocks?.length) {
    sections[0].content = structuredExperienceBlocks.join('\n\n');
  }

  const normalizedExperienceSource = normalizeParsedExperienceSource(rawExperienceSource, baselineId);
  const experience = normalizedExperienceSource.entries;
  if (!sections[0].content.trim() && parsedExperienceSourcePresent) {
    lastParsedExperienceCount = experience.length;
    const rejectionReasons = new Map<string, { count: number; sampleKeys: string[] }>();
    for (const reason of normalizedExperienceSource.rejectionReasons) {
      rejectionReasons.set(reason.reason, {
        count: reason.count,
        sampleKeys: reason.sampleKeys,
      });
    }
    const recordRejection = (reason: string, entry: unknown) => {
      const keys =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? Object.keys(entry as Record<string, unknown>)
          : [];
      const sampleKeys = keys.slice(0, 12);
      const existing = rejectionReasons.get(reason);
      if (existing) {
        existing.count += 1;
        return;
      }
      rejectionReasons.set(reason, { count: 1, sampleKeys });
    };

    const readString = (...candidates: unknown[]) => {
      for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const obj = value as Record<string, unknown>;
          const nested =
            (typeof obj['name'] === 'string' && obj['name']) ||
            (typeof obj['value'] === 'string' && obj['value']) ||
            (typeof obj['text'] === 'string' && obj['text']) ||
            '';
          if (nested && nested.trim()) return nested.trim();
        }
      }
      return '';
    };

    const readDetailsLines = (entry: Record<string, unknown>) => {
      const directText = readString(
        entry['details_text'],
        entry['detailsText'],
        entry['responsibilities_text'],
        entry['responsibilitiesText'],
        entry['description'],
      );
      if (directText) {
        return directText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .map((line) => String(line ?? '').trim())
          .filter(Boolean)
          .filter((line) => !isFallbackExperienceNoiseLine(line))
          // Keep the replacement narrow; this is ingestion-only and must not rewrite meaning.
          .map((line) => `- ${line.replace(/^[-*â€¢]\s*/, '')}`);
      }

      const arrayCandidate =
        (Array.isArray(entry['bullets']) && entry['bullets']) ||
        (Array.isArray(entry['highlights']) && entry['highlights']) ||
        (Array.isArray(entry['responsibilities']) && entry['responsibilities']) ||
        (Array.isArray(entry['details']) && entry['details']) ||
        null;
      if (arrayCandidate) {
        return arrayCandidate
          .map((line) => (typeof line === 'string' ? line.trim() : ''))
          .filter(Boolean)
          .filter((line) => !isFallbackExperienceNoiseLine(line))
          // Keep the replacement narrow; this is ingestion-only and must not rewrite meaning.
          .map((line) => `- ${line.replace(/^[-*â€¢]\s*/, '')}`);
      }

      return [] as string[];
    };

    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log(
        parsedExperienceType === 'array'
          ? '[RESUME_V2_INGEST][USING_EXPERIENCE_ARRAY]'
          : '[RESUME_V2_INGEST][USING_WORK_HISTORY_FALLBACK]',
        {
          baselineId,
          selectedCount: experience.length,
        },
      );
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][PARSED_BASELINE]', {
        baselineId,
        schemaVersion: String(parsedBaseline['schema_version'] ?? ''),
        sourceFormat: String(parsedBaseline['source_format'] ?? ''),
        identityPresent: Boolean(identity && typeof identity === 'object'),
        experienceCount: experience.length,
        experienceKeysSample: Object.keys(experience[0] ?? {}).slice(0, 12),
      });
    }

    let mappedCount = 0;
    let droppedEmptyCount = 0;
    let rejectedMissingHeaderCount = 0;
    let rejectedMissingDetailsCount = 0;
    const blocks = experience
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          droppedEmptyCount += 1;
          recordRejection('non_object_entry', entry);
          return '';
        }
        const company = readString(
          entry['company_name'],
          entry['companyName'],
          entry['company'],
          (entry as any)?.company?.name,
          entry['employer'],
          entry['organization'],
          entry['organization_name'],
          entry['org'],
        );
        const role = readString(
          entry['role_title'],
          entry['roleTitle'],
          entry['title'],
          entry['position'],
          entry['position_title'],
          entry['positionTitle'],
          entry['job_title'],
          entry['jobTitle'],
          entry['role'],
        );
        const start = readString(entry['start_date'], entry['startDate'], entry['start'], entry['from']);
        const end = readString(entry['end_date'], entry['endDate'], entry['end'], entry['to']) || 'Present';
        // `structuredBaselineExtractor.parseExperienceHeaderLine` expects: "Company | Role Title | Dates".
        // This ordering matters; reversing it can cause experience entries to be rejected as unsafe/not-company-like.
        const header = [company, role, [start, end].filter(Boolean).join(' - ')].filter(Boolean).join(' | ');

        const detailsText = typeof entry['details_text'] === 'string' ? entry['details_text'] : '';
        const details = detailsText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .map((line) => String(line ?? '').trim())
          .filter(Boolean)
          // Keep the replacement narrow; this is ingestion-only and must not rewrite meaning.
          .map((line) => `- ${line.replace(/^[-*•]\s*/, '')}`);

        const fallbackDetails = details.length ? details : readDetailsLines(entry);
        const detailLines = fallbackDetails;
        const keepDrop = classifyStructuredExperienceKeepDrop({ company, roleTitle: role, detailLines });
        if (shouldLog) {
          resumeV2CandidateKeepDrop = resumeV2CandidateKeepDrop ?? [];
          resumeV2CandidateKeepDrop.push({
            company,
            roleTitle: role,
            detailLinesCount: detailLines.length,
            kept: keepDrop.kept,
            dropReason: keepDrop.dropReason,
          });
        }
        if (!keepDrop.kept) {
          rejectedMissingHeaderCount += 1;
          recordRejection('company_not_persistable', entry);
          return '';
        }
        if (detailLines.length === 0) {
          droppedEmptyCount += 1;
          rejectedMissingDetailsCount += 1;
          recordRejection('missing_details_bullets', entry);
          if (shouldLog) {
            // eslint-disable-next-line no-console
            console.warn('[RESUME_V2_INGEST][ENTRY_DROPPED_EMPTY]', {
              baselineId,
              index,
              entryKeysSample: Object.keys(entry ?? {}).slice(0, 12),
            });
          }
          return '';
        }

        mappedCount += 1;
        if (shouldLog) {
          // eslint-disable-next-line no-console
          console.log('[RESUME_V2_INGEST][ENTRY_MAPPED]', {
            baselineId,
            index,
            companyPresent: Boolean(String(company ?? '').trim()),
            rolePresent: Boolean(String(role ?? '').trim()),
            headerPresent: Boolean(String(header ?? '').trim()),
            detailLineCount: detailLines.length,
          });
        }

        return [header, ...detailLines].filter(Boolean).join('\n').trim();
      })
      .filter(Boolean);

    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][MAP_COUNTS]', {
        baselineId,
        selectedEntries: experience.length,
        mappedEntries: mappedCount,
        droppedEmptyEntries: droppedEmptyCount,
        entriesMissingHeader: rejectedMissingHeaderCount,
        entriesMissingDetails: rejectedMissingDetailsCount,
        survivingBlocks: blocks.length,
      });
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][CANDIDATE_KEEP_DROP]', {
        baselineId,
        resumeV2CandidateKeepDrop: resumeV2CandidateKeepDrop ?? [],
      });
      if (rejectionReasons.size) {
        // eslint-disable-next-line no-console
        console.warn('[RESUME_V2_INGEST][REJECTION_REASONS]', {
          baselineId,
          reasons: Array.from(rejectionReasons.entries()).map(([reason, payload]) => ({
            reason,
            count: payload.count,
            sampleKeys: payload.sampleKeys,
          })),
        });
      }
    }

    lastMappingStats = {
      selectedEntries: experience.length,
      mappedEntries: mappedCount,
      droppedEmptyEntries: droppedEmptyCount,
      entriesMissingHeader: rejectedMissingHeaderCount,
      entriesMissingDetails: rejectedMissingDetailsCount,
      survivingBlocks: blocks.length,
      experienceType: parsedExperienceType,
      experienceKeys: parsedExperienceKeys,
      ...(normalizedExperienceSource.arrayDiagnostics
        ? { arrayDiagnostics: normalizedExperienceSource.arrayDiagnostics }
        : {}),
      rejectionReasons: Array.from(rejectionReasons.entries()).map(([reason, payload]) => ({
        reason,
        count: payload.count,
        sampleKeys: payload.sampleKeys,
      })),
    };

    sections[0].content = blocks.join('\n\n');
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][SECTION_BUILD]', {
        baselineId,
        headerBlockCount: blocks.length,
        sectionChars: sections[0].content.length,
        firstBlockPreview: blocks[0]?.slice(0, 180) ?? null,
      });
    }
  }

  if (!sections[0].content.trim()) {
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.warn('[RESUME_V2_INGEST][FINAL_SECTION_EMPTY]', {
        baselineId,
      });
      // eslint-disable-next-line no-console
      console.warn('[RESUME_V2_INGEST][FAILED_NO_USABLE_EXPERIENCE]', {
        baselineId,
        parsedExperiencePresent: parsedExperienceSourcePresent,
        parsedExperienceCount: parsedExperienceSourcePresent ? experience.length : null,
        identityFullNamePresent: Boolean(fullName && String(fullName).trim()),
        identityLocationPresent: Boolean(location && String(location).trim()),
      });
    }
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_resume_v2_ingestion_failed',
        message:
          'Baseline ingestion did not produce any usable experience entries for Resume V2. Please re-upload or reprocess your baseline resume.',
          details: {
            missing: ['experience'],
            hint:
              'No experience entries survived mapping. This often means the parsed baseline schema uses different field names for company/title/bullets, or the resume parser returned empty work history.',
            diagnostics: {
              inspectedKeys,
              parsedExperiencePresent: parsedExperienceSourcePresent,
              parsedWorkHistoryPresent: Array.isArray(parsedBaseline['work_history']),
              parsedExperienceType,
              parsedExperienceKeys,
              parsedExperienceCount: lastParsedExperienceCount,
              experienceArrayEmpty: parsedExperienceArrayEmpty,
              thematicFields: summarizeThematicEvidenceDiagnostics(parsedBaseline),
              mapping: lastMappingStats,
            },
          },
        },
    });
  }

  const result = buildDeterministicResumeV2FromBaseline({
    baselineSections: sections as any,
    identity: { name: fullName ?? 'Candidate', contactLine: location ?? '', links: [] },
  });
  const normalized = normalizeNormalizedResumeDocument(
    coerceResumeV2NormalizedDocument(result.normalized as NormalizedResumeDocument) as NormalizedResumeDocument,
  );

  if (shouldLog) {
    try {
      const experienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
      const bulletCount = Array.isArray((normalized as any)?.experience)
        ? (normalized as any).experience.reduce(
            (sum: number, entry: any) => sum + (Array.isArray(entry?.bullets) ? entry.bullets.length : 0),
            0,
          )
        : 0;
      // eslint-disable-next-line no-console
      console.log('[RESUME_V2_INGEST][NORMALIZED_COUNTS]', {
        baselineId,
        experienceCount,
        bulletCount,
      });
      if (experienceCount === 0) {
        // eslint-disable-next-line no-console
        console.warn('[RESUME_V2_INGEST][VALIDATION_STRIPPED_CONTENT]', {
          baselineId,
          stage: 'post_normalize',
        });
      }
    } catch {
      // ignore
    }
  }

  const normalizedExperienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
  if (normalizedExperienceCount === 0) {
    throw new UnprocessableEntityException({
      error: {
        code: 'baseline_resume_v2_invalid',
        message:
          'Resume V2 produced an invalid normalized resume model. No valid experience entries were produced. Please re-upload or reprocess your baseline resume.',
        details: {
          reasons: ['experience_empty_after_normalize'],
        },
      },
    });
  }

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

  const canonicalExperience = Array.isArray((parsedBaseline as any)?.experience)
    ? ((parsedBaseline as any).experience as Array<Record<string, unknown>>)
    : [];
  const canonicalEducation = Array.isArray((parsedBaseline as any)?.education)
    ? ((parsedBaseline as any).education as Array<Record<string, unknown>>)
    : [];
  const diagnostics = collectBaselineDiagnostics(normalized);
  const baselineFile = {
    heading: {
      name: normalized.heading.name,
      contactLine: normalized.heading.contactLine,
      ...(normalized.heading.links?.length ? { links: normalized.heading.links } : {}),
    },
    ...(normalized.summary ? { summary: normalized.summary } : {}),
    ...(normalized.competencies?.length ? { competencies: normalized.competencies } : {}),
    ...(normalized.coreCompetencies?.length ? { skills: normalized.coreCompetencies } : {}),
    experience: normalized.experience.map((entry, index) => ({
      ...entry,
      evidence: buildEvidenceReferences({
        parsedEvidence: canonicalExperience[index]?.evidence as Array<Record<string, unknown>> | null,
        bullets: entry.bullets,
        source: 'parsed_baseline',
      }),
    })),
    ...(Array.isArray(normalized.education)
      ? {
          education: normalized.education.map((entry, index) => ({
            ...entry,
            evidence: buildEvidenceReferences({
              parsedEvidence: canonicalEducation[index]?.evidence as Array<Record<string, unknown>> | null,
              source: 'parsed_baseline',
            }),
          })),
        }
      : {}),
    certifications: Array.isArray((parsedBaseline as any)?.certifications)
      ? ((parsedBaseline as any).certifications as unknown[]).map((value) => trimToText(value)).filter(Boolean)
      : [],
    diagnostics,
    readiness: {
      status: buildBaselineFileStatus(diagnostics),
      usable: diagnostics.missingRequiredFields.length === 0 && diagnostics.validationReasons.length === 0,
    },
  } as BaselineFileRecord;

  return baselineFile;
}



