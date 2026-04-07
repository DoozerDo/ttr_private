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

const REQUIREMENT_NOISE_PATTERNS = [
  /^\s*[a-z .'-]+,\s*[a-z]{2}(?:\s+\d{5})?\s*$/i,
  /^\s*remote(?:\s*-\s*[a-z .'-]+)?\s*$/i,
  /^\s*(?:or\s+)?equivalent experience\.?$/i,
  /^\s*proficient\.?$/i,
  /^\s*strong ability\.?$/i,
  /^\s*excellent communication\.?$/i,
  /^\s*entry[-\s]*level\b.*\bdesigner\b.*$/i,
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

function hasRequirementSemantics(text: string): boolean {
  const normalized = text.toLowerCase();
  return REQUIREMENT_TRIGGERS.some((trigger) => normalized.includes(trigger));
}

function isRequirementNoise(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized || normalized.length < 12) return true;
  if (REQUIREMENT_NOISE_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (!/[a-z]/i.test(normalized) || !/\b[a-z]{3,}\b/i.test(normalized)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length <= 2;
}

function isIncompleteRequirementSentence(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if (!normalized) return true;
  if (/\b(?:the|a|an|to|and|or|for|of|with|in|on|at|by|from|into|as|about)\s*$/.test(normalized)) {
    return true;
  }
  if (normalized.endsWith(':') || normalized.endsWith('-')) return true;
  if (/^(?:the\s+hpc\/ai\s+team|our\s+team|the\s+team|we\s+are)\b/.test(normalized) && !/\b(?:must|required|experience|ability|degree|certification|knowledge)\b/.test(normalized)) {
    return true;
  }
  return false;
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
      if (currentHeading === "requirement" && isRequirementNoise(trimmed)) {
        continue;
      }
      if (currentHeading === "requirement" && isIncompleteRequirementSentence(trimmed)) {
        continue;
      }

      const entryType = currentHeading ?? classifySegment(trimmed);
      if (entryType === "requirement" && isRequirementNoise(trimmed)) {
        continue;
      }
      if (entryType === "requirement" && isIncompleteRequirementSentence(trimmed)) {
        continue;
      }
      if (entryType === "requirement" && !hasRequirementSemantics(trimmed) && !/\b(?:years?|degree|certification|experience|knowledge|ability|familiarity|background|must|required)\b/i.test(trimmed)) {
        continue;
      }
      if (entryType === "requirement") {
        requirements.push(trimmed);
      } else {
        responsibilities.push(trimmed);
      }
    }
  }

  return { responsibilities, requirements };
}
