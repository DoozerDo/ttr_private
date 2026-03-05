import { BaselineSectionType } from '../../baseline/baseline-section.entity';
import type { BaselineIdentity } from '../../baseline/baseline-identity.utils';
import {
  ExperienceItem,
  ResumeDocxModel,
  ResumeDocxSection,
  ResumeSectionItem,
  ResumeSectionKey,
  ResumeSkillsGroup,
  ResumeSkillsItem,
  ResumeSummaryItem,
  ResumeEducationItem,
  ResumeCertificationItem,
  ResumeOtherItem,
  ResumeDocxHeader,
} from '../docx-template.types';
import type { ResumeDraftBullet } from '../../resume/resume-draft-bullets';

export type ResumeExportSection = {
  id?: string;
  type?: BaselineSectionType | string | null;
  title?: string | null;
  content?: string | null;
  order?: number;
  includePolicy?: string;
  source?: string;
  bullets?: ResumeDraftBullet[] | Array<{ text?: string | null }>;
  rawContent?: string | null;
};

const BULLET_GLYPH = '\u2022';

function splitInlineBullets(input: string): { description?: string; bullets: string[] } {
  const text = (input ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return { bullets: [] };

  const hasBullet = text.includes(BULLET_GLYPH);

  if (!hasBullet) {
    return { description: text, bullets: [] };
  }

  const parts = text
    .split(BULLET_GLYPH)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length <= 1) {
    return {
      description: text.replace(new RegExp(BULLET_GLYPH, 'g'), '').trim() || undefined,
      bullets: [],
    };
  }

  const description = parts[0] || undefined;
  const bullets = parts.slice(1);
  return { description, bullets };
}

const SECTION_TYPE_KEY_MAP: Record<BaselineSectionType, ResumeSectionKey> = {
  [BaselineSectionType.SUMMARY]: 'summary',
  [BaselineSectionType.SKILLS]: 'skills',
  [BaselineSectionType.EXPERIENCE]: 'experience',
  [BaselineSectionType.EDUCATION]: 'education',
  [BaselineSectionType.PROJECT]: 'other',
  [BaselineSectionType.RAW]: 'other',
  [BaselineSectionType.OTHER]: 'other',
};

const SECTION_TITLE_FALLBACK: Record<ResumeSectionKey, string> = {
  summary: 'Summary',
  skills: 'Technical Skills',
  experience: 'Professional Experience',
  education: 'Education',
  certifications: 'Certifications',
  other: 'Intro',
};

const SECTION_ORDER: ResumeSectionKey[] = [
  'summary',
  'skills',
  'experience',
  'education',
  'certifications',
  'other',
];

const BULLET_PATTERN = /^[\u2022✶*-]\s*(.*)$/;
const bulletPrefixPattern = new RegExp('^\\s*' + BULLET_GLYPH + '\\s*');
const cleanBullets = (bullets?: string[]) =>
  (bullets ?? [])
    .map((b) => (b ?? '').replace(bulletPrefixPattern, '').trim())
    .filter((b) => b.length > 0);
const SKILL_LINE_LIMIT = 120;
const EDUCATION_LINE_LIMIT = 140;
const SKILL_VERB_PATTERN = /\b(with|including|designed|developed|managed|led|built|created|implemented|owned)\b/i;
const ADDITIONAL_INFO_TITLE = 'Additional Information';
const DENSE_TEXT_NEWLINE = / {2,}/g;
const ROLE_PREFIX_PATTERN = /(?:Engineer|Administrator|Manager|Lead|Architect|Developer|Analyst|Consultant|Specialist)$/i;

function addQuarantinedLine(quarantined: string[], line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (quarantined[quarantined.length - 1] === trimmed) return;
  quarantined.push(trimmed);
}

export function mapResumeSectionsToDocxModel(
  sections: ResumeExportSection[],
  identity?: BaselineIdentity,
): ResumeDocxModel {
  const header = buildHeader(sections, identity);
  const headerLines = buildHeaderLineSet(header);
  const quarantined: string[] = [];
  const buckets = buildSectionBuckets(sections, headerLines, quarantined);
  const orderedSections = SECTION_ORDER.map((key) => buckets.get(key)).filter(
    (section): section is ResumeDocxSection => Boolean(section),
  );

  return {
    header,
    sections: orderedSections,
  };
}

function buildSectionBuckets(
  sections: ResumeExportSection[],
  headerLines: Set<string>,
  quarantined: string[],
): Map<ResumeSectionKey, ResumeDocxSection> {
  const buckets = new Map<ResumeSectionKey, ResumeDocxSection>();
  const hasExplicitSummary = sections.some((section) => {
    const key = resolveSectionKey(section.type);
    return key === 'summary' && Boolean(normalizeContent(section.content));
  });
  let synthesizedSummaryFromOther = false;

  for (const section of sections) {
    if (shouldSkipSection(section)) {
      continue;
    }

    let key = resolveSectionKey(section.type);
    const sourceContent = section.rawContent ?? section.content;
    const contentWithoutHeader = removeHeaderLines(sourceContent, headerLines);
    const draftBulletTexts = normalizeDraftBulletTexts(section.bullets);
    if (!contentWithoutHeader && !draftBulletTexts.length) {
      continue;
    }

    if (
      key === 'other' &&
      !hasExplicitSummary &&
      !synthesizedSummaryFromOther &&
      isLikelyIntroSection(contentWithoutHeader ?? draftBulletTexts.join('\n'))
    ) {
      key = 'summary';
      synthesizedSummaryFromOther = true;
    }

    const items =
      buildSectionItemsFromDraftBullets(
        key,
        draftBulletTexts,
        contentWithoutHeader,
        section.title,
      ) ?? buildSectionItems(key, contentWithoutHeader, quarantined);
    if (!items.length) {
      continue;
    }

    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, {
        key,
        title: SECTION_TITLE_FALLBACK[key],
        items: [...items],
      });
      continue;
    }

    bucket.items.push(...items);
  }

  if (quarantined.length) {
    const infoItem: ResumeOtherItem = { lines: [...quarantined] };
    const otherBucket = buckets.get('other');
    if (!otherBucket) {
      buckets.set('other', {
        key: 'other',
        title: ADDITIONAL_INFO_TITLE,
        items: [infoItem],
      });
    } else {
      otherBucket.title = ADDITIONAL_INFO_TITLE;
      otherBucket.items.push(infoItem);
    }
  }
  return buckets;
}

function isLikelyIntroSection(content: string) {
  const lines = splitLines(content);
  if (!lines.length) return false;
  if (lines.length > 10) return false;

  const bulletLikeCount = lines.filter(
    (line) => line.startsWith(BULLET_GLYPH) || BULLET_PATTERN.test(line),
  ).length;
  if (bulletLikeCount > 1) return false;

  const longNarrativeLineCount = lines.filter((line) => line.length > 80).length;
  return longNarrativeLineCount > 0;
}

function buildHeaderLineSet(header: ResumeDocxHeader) {
  const lines = new Set<string>();
  const addLine = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed) {
      lines.add(trimmed);
    }
  };
  addLine(header.name);
  addLine(header.title);
  header.contactLines?.forEach(addLine);
  return lines;
}

function removeHeaderLines(content?: string | null, headerLines?: Set<string>) {
  if (!content) return content;
  if (!headerLines?.size) return content;
  const filtered = content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      return !headerLines.has(trimmed);
    });
  if (!filtered.length) {
    return undefined;
  }
  return filtered.join('\n');
}

function shouldSkipSection(section: ResumeExportSection) {
  const content = normalizeContent(section.content);
  if (!content) return true;
  return isLikelyContactOnlySection(content);
}

function isLikelyContactOnlySection(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return true;
  if (lines.length > 5) return false;

  const contactLineCount = lines.filter((line) => isContactLine(line)).length;
  if (!contactLineCount) return false;

  const substantialNonContactCount = lines.filter(
    (line) => !isContactLine(line) && line.length > 20,
  ).length;

  return substantialNonContactCount === 0;
}

function isContactLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phonePattern = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;
  const profilePattern = /\b(?:linkedin|github|portfolio|website)\b|https?:\/\//i;

  return (
    emailPattern.test(trimmed) ||
    phonePattern.test(trimmed) ||
    profilePattern.test(trimmed)
  );
}

function buildHeader(
  sections: ResumeExportSection[],
  identity?: BaselineIdentity,
): ResumeDocxHeader {
  const fallbackLines = extractHeaderLines(sections);
  const header: ResumeDocxHeader = {};
  header.name =
    sanitizeHeaderName(identity?.fullName) ||
    extractFallbackName(fallbackLines[0]);

  header.title =
    sanitizeHeaderTitle(identity?.currentTitle) ||
    sanitizeHeaderTitle(identity?.currentCompany) ||
    fallbackLines
      .slice(1)
      .map((line) => sanitizeHeaderTitle(line))
      .find((line) => Boolean(line));

  const contactLines = new Set<string>();
  if (identity?.location?.trim()) {
    contactLines.add(identity.location.trim());
  }
  fallbackLines.slice(1).forEach((line) => {
    if (looksLikeContact(line)) {
      contactLines.add(line);
    }
  });

  header.contactLines = contactLines.size
    ? Array.from(contactLines)
    : undefined;
  return header;
}


function sanitizeHeaderName(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const firstSegment = trimmed.split('|')[0]?.trim() ?? trimmed;
  if (looksLikeSentence(firstSegment)) {
    return undefined;
  }
  if (firstSegment.length > 60) {
    return undefined;
  }
  return firstSegment;
}

function sanitizeHeaderTitle(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('|')) return undefined;
  if (looksLikeContact(trimmed)) return undefined;
  if (looksLikeSentence(trimmed)) return undefined;
  if (trimmed.length > 80) return undefined;
  return trimmed;
}

function extractFallbackName(firstLine?: string) {
  if (!firstLine) return undefined;
  const normalized = firstLine.trim();
  if (!normalized) return undefined;
  const firstSegment = normalized.split('|')[0]?.trim() ?? normalized;
  if (looksLikeSentence(firstSegment)) return undefined;
  if (firstSegment.length > 60) return undefined;
  return firstSegment;
}

function looksLikeSentence(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/[.!?]/.test(trimmed)) return true;
  return trimmed.split(/\s+/).length > 8;
}

function looksLikeContact(line: string) {
  const cleaned = line.trim();
  if (!cleaned) return false;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phonePattern = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;
  const profilePattern = /\b(?:linkedin|github|portfolio|website)\b|https?:\/\//i;
  return (
    emailPattern.test(cleaned) ||
    phonePattern.test(cleaned) ||
    profilePattern.test(cleaned)
  );
}

function extractHeaderLines(sections: ResumeExportSection[]) {
  for (const section of sections) {
    const lines = splitLines(section.content);
    if (lines.length) {
      return lines.slice(0, 4);
    }
  }
  return [];
}

function resolveSectionKey(type?: BaselineSectionType | string | null) {
  if (!type) {
    return 'other';
  }
  return SECTION_TYPE_KEY_MAP[type as BaselineSectionType] ?? 'other';
}

function normalizeDraftBulletTexts(
  bullets?: ResumeExportSection['bullets'],
): string[] {
  return (bullets ?? [])
    .map((bullet) => {
      if (!bullet || typeof bullet !== 'object') return '';
      const text = 'text' in bullet ? bullet.text : '';
      return (text ?? '').trim();
    })
    .filter((text) => text.length > 0);
}

function buildExperienceItemsFromDraftBullets(
  bulletTexts: string[],
  sectionTitle?: string | null,
): ExperienceItem[] {
  if (!bulletTexts.length) return [];
  return [
    {
      role: sectionTitle?.trim() || 'Professional Experience',
      company: undefined,
      location: undefined,
      dateRange: undefined,
      description: undefined,
      bullets: cleanBullets(bulletTexts),
    },
  ];
}

function mergeDraftBulletsIntoExperienceItems(
  parsedItems: ExperienceItem[],
  draftBulletTexts: string[],
): ExperienceItem[] {
  if (!parsedItems.length) return [];
  if (!draftBulletTexts.length) return parsedItems;

  const merged = parsedItems.map((item) => ({ ...item, bullets: [...(item.bullets ?? [])] }));
  let cursor = 0;

  for (const item of merged) {
    const expectedCount = item.bullets.length;
    if (expectedCount > 0 && cursor < draftBulletTexts.length) {
      const replacement = draftBulletTexts.slice(cursor, cursor + expectedCount);
      if (replacement.length) {
        item.bullets = replacement;
      }
      cursor += replacement.length;
      continue;
    }

    if (!item.bullets.length && cursor < draftBulletTexts.length) {
      item.bullets = [draftBulletTexts[cursor]];
      cursor += 1;
    }
  }

  if (cursor < draftBulletTexts.length && merged.length) {
    merged[merged.length - 1]!.bullets.push(...draftBulletTexts.slice(cursor));
  }

  return merged;
}

function buildSectionItemsFromDraftBullets(
  key: ResumeSectionKey,
  bulletTexts: string[],
  contentWithoutHeader?: string | null,
  sectionTitle?: string | null,
): ResumeSectionItem[] | null {
  if (!bulletTexts.length) return null;

  switch (key) {
    case 'summary':
      return [{ paragraphs: bulletTexts }];
    case 'skills':
      return [
        {
          groups: bulletTexts.map((text) => ({
            values: text
              .split(/[,\u2022;]/)
              .map((segment) => segment.trim())
              .filter(Boolean),
          })),
        },
      ];
    case 'experience':
      if (contentWithoutHeader) {
        const parsedItems = buildExperienceItems(contentWithoutHeader);
        if (parsedItems.length) {
          return mergeDraftBulletsIntoExperienceItems(parsedItems, bulletTexts);
        }
      }
      return buildExperienceItemsFromDraftBullets(bulletTexts, sectionTitle);
    case 'education':
      return bulletTexts.map((raw) => ({ raw }));
    case 'certifications':
      return bulletTexts.map((title) => ({ title }));
    case 'other':
    default:
      return [{ lines: bulletTexts }];
  }
}

function buildSectionItems(
  key: ResumeSectionKey,
  content: string | null | undefined,
  quarantined: string[],
): ResumeSectionItem[] {
  switch (key) {
    case 'summary':
      return buildSummaryItems(content);
    case 'skills':
      return buildSkillsItems(content, quarantined);
    case 'experience':
      return buildExperienceItems(content);
    case 'education':
      return buildEducationItems(content);
    case 'certifications':
      return buildCertificationItems(content);
    case 'other':
    default:
      return buildOtherItems(content);
  }
}

function buildSummaryItems(
  content?: string | null,
): ResumeSummaryItem[] {
  const paragraphs = splitParagraphs(content);
  if (!paragraphs.length) return [];

  const kept = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  if (!kept.length) return [];
  return [
    {
      paragraphs: kept,
    },
  ];
}

function buildSkillsItems(content?: string | null, quarantined: string[] = []): ResumeSkillsItem[] {
  const lines = splitLines(expandDenseText(content));
  const groups: ResumeSkillsGroup[] = [];
  lines.forEach((line) => {
    const normalized = line.replace(/^(Skills|Technical Skills)/i, '').trim();
    if (!normalized) {
      addQuarantinedLine(quarantined, line);
      return;
    }
    if (/^(Summary|Experience|Professional Experience)/i.test(normalized)) {
      addQuarantinedLine(quarantined, normalized);
      return;
    }
    if (
      normalized.length > SKILL_LINE_LIMIT ||
      normalized.includes('.') ||
      SKILL_VERB_PATTERN.test(normalized)
    ) {
      addQuarantinedLine(quarantined, normalized);
      return;
    }
    const segments = normalized
      .split(/[,\u2022;]/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length) {
      groups.push({
        values: segments,
      });
    } else {
      addQuarantinedLine(quarantined, normalized);
    }
  });
  if (!groups.length) return [];
  return [{ groups }];
}

function buildExperienceItems(content?: string | null): ExperienceItem[] {
  const normalized = expandDenseText(content);
  if (!normalized) return [];
  const blocks = splitExperienceBlocks(normalized);

  const entries: ExperienceItem[] = [];
  blocks.forEach((block) => {
    const lines = splitLines(block);
    if (!lines.length) return;
    let roleLine = lines.shift()!;
    let company: string | undefined;
    let dateRange: string | undefined;
    const bullets: string[] = [];
    let description: string | undefined;

    const applyLabelParagraph = (labelLine: string) => {
      const trimmedLabel = labelLine.trim().replace(/:+$/, '');
      if (!description) {
        description = labelLine.trim();
        return;
      }
      bullets.unshift(`${trimmedLabel}:`);
    };

    const handleHeaderRemainder = (remainder: string) => {
      const trimmed = remainder.trim();
      if (!trimmed) return;
      if (!description && !bullets.length) {
        description = trimmed;
        return;
      }
      if (trimmed.includes('.') && !isFunctionalLabel(trimmed)) {
        bullets.unshift(trimmed);
        return;
      }
      applyLabelParagraph(trimmed);
    };

    const initialHeader = sanitizeExperienceHeaderLine(roleLine);
    let headerData = parseExperienceHeaderSegments(initialHeader.cleanedLine);
    let headerInlineBullets = initialHeader.inlineBullets;

    if (!isExperienceHeader(initialHeader.cleanedLine) && lines.length) {
      const peekHeader = sanitizeExperienceHeaderLine(lines[0]!);
      if (isExperienceHeader(peekHeader.cleanedLine)) {
        lines.shift();
        headerData = parseExperienceHeaderSegments(peekHeader.cleanedLine);
        headerInlineBullets = peekHeader.inlineBullets;
      }
    }

    roleLine = headerData.role;
    company = headerData.company;
    dateRange = headerData.dateRange;

    if (lines.length && !company && !dateRange && looksLikeCompanyDateLine(lines[0]!)) {
      const combinedHeader = `${roleLine} | ${lines.shift()!}`;
      headerData = parseExperienceHeaderSegments(combinedHeader);
      roleLine = headerData.role;
      company = headerData.company;
      dateRange = headerData.dateRange;
    }
    if (headerData.remainder) {
      handleHeaderRemainder(headerData.remainder);
    }
    if (headerInlineBullets.length) {
      bullets.push(...headerInlineBullets);
    }

    while (lines.length) {
      const line = lines.shift()!;
      const trimmed = line.trim();
      if (!trimmed) continue;

      const bulletMatch = trimmed.match(BULLET_PATTERN);
      if (bulletMatch) {
        bullets.push(bulletMatch[1]);
        continue;
      }

      if (trimmed.includes(BULLET_GLYPH)) {
        const inline = splitInlineBullets(trimmed);
        if (inline.description) {
          if (isFunctionalLabel(inline.description)) {
            applyLabelParagraph(inline.description);
          } else if (!description && !bullets.length) {
            description = inline.description;
          } else {
            bullets.push(inline.description);
          }
        }
        if (inline.bullets.length) {
          bullets.push(...inline.bullets);
        }
        continue;
      }

      if (isFunctionalLabel(trimmed)) {
        applyLabelParagraph(trimmed);
        continue;
      }

      if (!description && !bullets.length) {
        description = trimmed;
        continue;
      }

      if (!bullets.length) {
        description = `${description} ${trimmed}`;
        continue;
      }

      bullets.push(trimmed);
    }

    const sanitizedDescription =
      description?.replace(new RegExp(BULLET_GLYPH, 'g'), '').trim() || undefined;
    const sanitizedBullets = cleanBullets(bullets);

    entries.push({
      role: roleLine,
      company,
      location: headerData.location,
      dateRange,
      description: sanitizedDescription,
      bullets: sanitizedBullets,
    });
  });

  return entries;
}


function splitExperienceBlocks(content: string): string[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (!current.length) return;
    blocks.push(current.join('\n').trim());
    current = [];
  };

  lines.forEach((line, index) => {
    const next = lines[index + 1];
    const startsNewRoleFromTwoLineHeader =
      current.length > 0 &&
      isLikelyRoleLine(line) &&
      Boolean(next) &&
      looksLikeCompanyDateLine(next!);

    const startsNewRoleFromSingleLineHeader =
      current.length > 0 && isStandaloneExperienceHeader(line);

    if (startsNewRoleFromTwoLineHeader || startsNewRoleFromSingleLineHeader) {
      flush();
    }

    current.push(line);
  });

  flush();
  return blocks;
}

function isStandaloneExperienceHeader(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(BULLET_GLYPH) || BULLET_PATTERN.test(trimmed)) return false;
  if (!isExperienceHeader(trimmed)) return false;

  const parsed = parseExperienceHeaderSegments(trimmed);
  if (!parsed.role?.trim()) return false;

  return Boolean(parsed.company || parsed.dateRange);
}

function isLikelyRoleLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(BULLET_GLYPH) || BULLET_PATTERN.test(trimmed)) return false;
  if (trimmed.includes('|')) return false;
  if (trimmed.includes(':')) return false;
  if (isDateRange(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 10) return false;
  return ROLE_PREFIX_PATTERN.test(trimmed);
}

function looksLikeCompanyDateLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const hasMonth = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\b/i.test(trimmed);
  return isDateRange(trimmed) || (trimmed.includes(',') && (hasMonth || /\b\d{4}\b/.test(trimmed)));
}


function sanitizeExperienceHeaderLine(line: string) {
  const inline = splitInlineBullets(line);
  const cleanedLine = inline.description?.trim() || line.trim();
  return {
    cleanedLine,
    inlineBullets: inline.bullets,
  };
}

function parseExperienceHeaderSegments(line: string) {
  const segments = line
    .replace(/,\s+/g, ' | ')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const role = segments.shift() || line.trim();
  const remaining = [...segments];
  let dateRange: string | undefined;
  if (remaining.length && isDateRange(remaining[remaining.length - 1])) {
    dateRange = remaining.pop();
  }
  let company: string | undefined;
  let location: string | undefined;
  if (remaining.length) {
    const parsed = splitCompanyAndLocation(remaining.shift()!);
    company = parsed.company;
    location = parsed.location;
  }
  const remainderParts = [...remaining];
  if (dateRange) {
    const idx = line.lastIndexOf(dateRange);
    if (idx >= 0) {
      const trailing = line.slice(idx + dateRange.length).trim();
      if (trailing) {
        remainderParts.push(trailing);
      }
    }
  }
  const remainder = remainderParts.filter(Boolean).join(' | ') || undefined;
  return {
    role,
    company,
    location,
    dateRange,
    remainder,
  };
}

function splitCompanyAndLocation(segment: string) {
  const trimmed = segment.trim();
  if (!trimmed) {
    return { company: undefined, location: undefined };
  }

  const divider = /\s[–—-]\s|\s·\s/;
  const parts = trimmed
    .split(divider)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      company: parts[0],
      location: parts.slice(1).join(' | '),
    };
  }

  return {
    company: trimmed,
    location: undefined,
  };
}


function expandDenseText(content?: string | null) {
  const normalized = normalizeContent(content);
  if (!normalized) return normalized;

  return normalized
    .replace(/•\s*/g, '\n• ')
    .replace(/([a-z0-9%])\s+([A-Z][A-Za-z][^\n]{3,45}(?:Experience|Education|Development))/g, '$1\n$2')
    .replace(DENSE_TEXT_NEWLINE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isFunctionalLabel(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 60) return false;
  if (/[.?!]/.test(trimmed)) return false;
  const keywords = ['CI/CD', 'Key Achievements', 'Automation', 'Infrastructure', 'Cloud', 'IaC'];
  const lower = trimmed.toLowerCase();
  const hasKeyword = keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
  return trimmed.includes('&') || trimmed.includes('/') || hasKeyword;
}

function isDateRange(value: string) {
  return /\d{4}\s*[-–—]\s*(\d{4}|present)/i.test(value);
}

function isExperienceHeader(line: string) {
  if (!line) return false;
  const trimmed = line.trim();
  const hasSeparator = trimmed.includes('|');
  const hasYearRange = /\d{4}\s*[-–—]\s*(\d{4}|present)/i.test(trimmed);
  const maybeRole = ROLE_PREFIX_PATTERN.test(trimmed.split('|')[0] ?? trimmed);
  return hasSeparator || hasYearRange || maybeRole;
}

function buildEducationItems(content?: string | null): ResumeEducationItem[] {
  const entries = splitEducationLines(content);
  return entries.map((line) => ({ raw: line }));
}

function splitEducationLines(content?: string | null) {
  const normalized = expandDenseText(content);
  if (!normalized) return [];
  return normalized
    .split(/\r?\n/)
    .flatMap((line) => line.split(BULLET_GLYPH))
    .map((segment) => segment.replace(new RegExp(BULLET_GLYPH, 'g'), '').trim())
    .filter(Boolean);
}

function buildCertificationItems(content?: string | null): ResumeCertificationItem[] {
  const lines = splitLines(content);
  return lines.map((line) => ({
    title: line,
  }));
}

function buildOtherItems(content?: string | null): ResumeOtherItem[] {
  const lines = splitLines(content);
  if (!lines.length) return [];
  return [{ lines }];
}

function splitParagraphs(content?: string | null) {
  return (normalizeContent(content) ?? '')
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitLines(content?: string | null) {
  return (normalizeContent(content) ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeContent(content?: string | null) {
  if (!content) return '';
  return content.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
}
