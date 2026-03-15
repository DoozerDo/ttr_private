const RESPONSIBILITY_HEADINGS = [
  'responsibilities',
  "what you'll do",
  'what you will do',
  'duties',
  'role',
  'the role',
  'your impact',
];

const REQUIREMENT_HEADINGS = [
  'requirements',
  'qualifications',
  'what you bring',
  'skills',
  'experience',
  "what we're looking for",
  'what we are looking for',
];

const BULLET_REGEX = /^([-*•]|\d+[.)])\s+/;

const MIN_ITEM_LENGTH = 3;
const MAX_ITEMS = 40;

const sentenceSplitRegex = /(?<=[.!?])\s+/;
const LEGAL_OR_APPLICATION_BOILERPLATE_PATTERNS = [
  /\bequal opportunity employer\b/i,
  /\ball qualified applicants\b/i,
  /\bwithout regard to\b/i,
  /\bprotected (?:class|characteristic)\b/i,
  /\breasonable accommodation\b/i,
  /\baccommodation (?:during|throughout) the application\b/i,
  /\bif you require an accommodation\b/i,
  /\bapplication process\b/i,
  /\bconsideration for employment\b/i,
  /\bbackground check\b/i,
  /\be-?verify\b/i,
  /\bdrug screening\b/i,
  /\bwork authorization\b/i,
];

const normalizeHeadingText = (line: string) =>
  line.toLowerCase().replace(/[:*]+/g, '').replace(/\s+/g, ' ').trim();

const isHeading = (line: string, headings: string[]) => {
  const normalized = normalizeHeadingText(line);
  if (!normalized || normalized.length > 80) {
    return false;
  }
  return headings.some(
    (heading) =>
      normalized === heading ||
      normalized === `${heading}:` ||
      normalized.startsWith(`${heading}:`) ||
      normalized.startsWith(`${heading} -`),
  );
};

const isBulletLine = (line: string) => BULLET_REGEX.test(line);

const stripBullet = (line: string) => line.replace(BULLET_REGEX, '').trim();

const splitSentences = (lines: string[]) =>
  lines
    .flatMap((line) => line.split(sentenceSplitRegex))
    .map((item) => item.trim())
    .filter(Boolean);

export const sanitizeListItems = (items: string[]) => {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || trimmed.length < MIN_ITEM_LENGTH) {
      continue;
    }
    if (
      LEGAL_OR_APPLICATION_BOILERPLATE_PATTERNS.some((pattern) =>
        pattern.test(trimmed),
      )
    ) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    cleaned.push(trimmed);
    if (cleaned.length >= MAX_ITEMS) {
      break;
    }
  }

  return cleaned;
};

const extractItemsFromLines = (lines: string[]) => {
  const bulletItems = lines.filter(isBulletLine).map(stripBullet);
  const paragraphItems = splitSentences(
    lines.filter((line) => !isBulletLine(line)),
  );

  if (bulletItems.length === 0) {
    return sanitizeListItems(paragraphItems);
  }

  if (paragraphItems.length > 0) {
    return sanitizeListItems([...bulletItems, ...paragraphItems]);
  }

  return sanitizeListItems(bulletItems);
};

export const normalizeJobDescription = (rawDescription: string) => {
  const lines = rawDescription
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sectionLines: Record<'responsibilities' | 'requirements', string[]> = {
    responsibilities: [],
    requirements: [],
  };

  let activeSection: 'responsibilities' | 'requirements' | null = null;

  for (const line of lines) {
    if (isHeading(line, RESPONSIBILITY_HEADINGS)) {
      activeSection = 'responsibilities';
      continue;
    }
    if (isHeading(line, REQUIREMENT_HEADINGS)) {
      activeSection = 'requirements';
      continue;
    }
    if (activeSection) {
      sectionLines[activeSection].push(line);
    }
  }

  let responsibilities = extractItemsFromLines(sectionLines.responsibilities);
  let requirements = extractItemsFromLines(sectionLines.requirements);

  if (responsibilities.length === 0 && requirements.length === 0) {
    const bulletItems = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => isBulletLine(line))
      .map(({ line, index }) => ({ item: stripBullet(line), index }));

    const requirementKeywordIndex = lines.findIndex((line) =>
      isHeading(line, REQUIREMENT_HEADINGS),
    );

    if (bulletItems.length > 0) {
      if (requirementKeywordIndex !== -1) {
        requirements = sanitizeListItems(
          bulletItems
            .filter(({ index }) => index >= requirementKeywordIndex)
            .map(({ item }) => item),
        );
        responsibilities = sanitizeListItems(
          bulletItems
            .filter(({ index }) => index < requirementKeywordIndex)
            .map(({ item }) => item),
        );
      } else {
        const cutoff = Math.floor(lines.length / 3);
        responsibilities = sanitizeListItems(
          bulletItems
            .filter(({ index }) => index >= cutoff)
            .map(({ item }) => item),
        );
        if (responsibilities.length === 0) {
          responsibilities = sanitizeListItems(
            bulletItems.map(({ item }) => item),
          );
        }
      }
    } else {
      responsibilities = sanitizeListItems(splitSentences(lines).slice(0, 8));
    }
  }

  return {
    responsibilities,
    requirements,
  };
};
