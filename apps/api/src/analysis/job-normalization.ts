export type NormalizedJobSegments = {
  responsibilities: string[];
  requirements: string[];
};

type SegmentType = "responsibility" | "requirement";

const RESPONSIBILITY_HEADINGS = [
  "responsibilities",
  "responsibility",
  "primary responsibilities",
  "key responsibilities",
  "your responsibilities",
  "day to day",
  "day-to-day",
  "what you will do",
  "what you will be doing",
  "what you'll do",
];

const REQUIREMENT_HEADINGS = [
  "requirements",
  "requirement",
  "minimum qualifications",
  "preferred qualifications",
  "qualifications",
  "what you bring",
  "what we look for",
  "what you need",
  "what you will need",
  "experience",
  "you should",
  "you must",
  "you have",
];

const RESPONSIBILITY_TRIGGERS = [
  "responsible for",
  "you will",
  "lead",
  "drive",
  "own",
  "manage",
  "support",
  "partner",
  "collaborate",
  "coordinate",
  "define",
  "develop",
  "build",
  "deliver",
  "maintain",
];

const REQUIREMENT_TRIGGERS = [
  "must",
  "required",
  "preferably",
  "experience with",
  "experience in",
  "experience managing",
  "experience leading",
  "skill",
  "skills",
  "qualification",
  "qualifications",
  "degree",
  "certification",
  "knowledge of",
  "ability to",
  "able to",
  "familiarity with",
  "background in",
];

const BULLET_PATTERN = /^[-*•]\s*(.+)$/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function detectHeadingType(line: string): SegmentType | null {
  const normalized = line.toLowerCase().replace(/[:–—-]+/g, " ");
  if (RESPONSIBILITY_HEADINGS.some((keyword) => normalized.includes(keyword))) {
    return "responsibility";
  }
  if (REQUIREMENT_HEADINGS.some((keyword) => normalized.includes(keyword))) {
    return "requirement";
  }
  return null;
}

function classifySegment(text: string): SegmentType {
  const normalized = text.toLowerCase();
  if (REQUIREMENT_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return "requirement";
  }
  if (RESPONSIBILITY_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return "responsibility";
  }
  return "responsibility";
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[^.!?]+[.!?]*/g);
  if (!matches) {
    return [text];
  }
  return matches.map((segment) => normalizeWhitespace(segment)).filter(Boolean);
}

export function extractNormalizedJobSegments(
  rawDescription: string,
): NormalizedJobSegments {
  if (!rawDescription) {
    return { responsibilities: [], requirements: [] };
  }

  const responsibilities: string[] = [];
  const requirements: string[] = [];
  let currentHeading: SegmentType | null = null;

  for (const rawLine of rawDescription.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      currentHeading = null;
      continue;
    }

    const headingType = detectHeadingType(line);
    if (headingType) {
      currentHeading = headingType;
      continue;
    }

    const bulletMatch = line.match(BULLET_PATTERN);
    const content = bulletMatch?.[1] ?? line;
    const pieces = bulletMatch ? [content] : splitSentences(content);

    for (const piece of pieces) {
      const trimmed = normalizeWhitespace(piece);
      if (!trimmed) {
        continue;
      }

      const entryType = currentHeading ?? classifySegment(trimmed);
      if (entryType === "requirement") {
        requirements.push(trimmed);
      } else {
        responsibilities.push(trimmed);
      }
    }
  }

  return { responsibilities, requirements };
}
