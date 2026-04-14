import crypto from "crypto";

export type NormalizedJob = {
  responsibilities: string[];
  requirements: string[];
  signals: {
    leadership: string[];
    strategic: string[];
    tactical: string[];
    technical: string[];
    domain: string[];
  };
  meta: {
    source: "normalized" | "raw";
    rawCharCount: number;
    rawSha256: string;
  };
};

export type JobNormalizationDebug = {
  responsibilitiesCount: number;
  responsibilitiesChars: number;
  requirementsCount: number;
  requirementsChars: number;
  headingsDetected: string[];
  bulletsDetected: number;
  fallbackSentenceSplitUsed: boolean;
  sanitizedRequirementCandidates: number;
  rejectedRequirementCandidates: number;
  extractionQuality: 'high' | 'medium' | 'low';
};

const RESPONSIBILITY_HEADINGS = [
  "responsibilities",
  "key responsibilities",
  "what you will do",
  "what youll do",
  "what you'll do",
  "duties",
  "the role",
  "role responsibilities",
  "your impact",
];

const REQUIREMENT_HEADINGS = [
  "requirements",
  "qualifications",
  "what you bring",
  "what youll bring",
  "what you'll bring",
  "skills",
  "experience",
  "minimum qualifications",
  "preferred qualifications",
];

const RESPONSIBILITY_KEYWORDS = [
  "you will",
  "youll",
  "responsible for",
  "own",
  "lead",
  "drive",
  "manage",
  "partner",
  "deliver",
  "establish",
  "build",
];

const REQUIREMENT_KEYWORDS = [
  "must",
  "required",
  "minimum",
  "years",
  "experience",
  "proficient",
  "knowledge of",
  "familiar with",
  "ability to",
];

const LEADERSHIP_KEYWORDS = [
  "lead",
  "director",
  "manager",
  "stakeholder",
  "executive",
  "strategy",
];

const STRATEGIC_KEYWORDS = [
  "strategy",
  "framework",
  "roadmap",
  "operating model",
  "program",
  "governance",
];

const TACTICAL_KEYWORDS = [
  "triage",
  "resolve",
  "runbook",
  "on call",
  "incident",
  "queue",
  "ticket",
];

const TECHNICAL_KEYWORDS = [
  "salesforce",
  "zendesk",
  "freshworks",
  "api",
  "sql",
  "docker",
  "kubernetes",
  "aws",
  "gcp",
  "azure",
  "incident management",
  "sre",
];

const DOMAIN_KEYWORDS = [
  "security",
  "cyber",
  "fraud",
  "finance",
  "health",
  "compliance",
  "saas",
];

const LABEL_ONLY_PHRASES = new Set([
  "about you",
  "about the role",
  "what we offer",
  "nice to have",
  "about the team",
  "team overview",
]);

const LOCATION_ONLY_PATTERNS = [
  /^\s*[a-z .'-]+,\s*[a-z]{2}(?:\s+\d{5})?\s*$/i,
  /^\s*remote(?:\s*-\s*[a-z .'-]+)?\s*$/i,
  /^\s*(?:microsoft|google|amazon|apple|meta|netflix|nvidia|openai)\s*[,|-].*$/i,
];
const BOILERPLATE_PATTERNS = [
  /\bequal opportunity employer\b/i,
  /\ball qualified applicants\b/i,
  /\bwithout regard to\b/i,
  /\breasonable accommodation\b/i,
  /\bapplication process\b/i,
  /\bapply (?:today|now)\b/i,
  /\bbenefits?\b/i,
  /\bcompensation\b/i,
  /\bsalary\b/i,
  /\bpay range\b/i,
  /\bbonus\b/i,
  /\bequity\b/i,
  /\bwork authorization\b/i,
  /\bbackground check\b/i,
  /\bdrug screening\b/i,
];
const MALFORMED_FRAGMENT_PATTERNS = [
  /^[-–—•·\s]*(?:requirements?|qualifications?|skills?|experience|candidate|preferred|required)\s*[:-]?\s*$/i,
  /^\s*(?:or\s+)?equivalent experience\.?$/i,
  /^\s*proficient\.?$/i,
  /^\s*strong ability\.?$/i,
  /^\s*excellent communication\.?$/i,
];

const BULLET_PATTERNS = [
  /^[-*??]\s+(.+)$/,
  /^\d+\.\s+(.+)$/,
  /^\d+\)\s+(.+)$/,
  /^\(\d+\)\s+(.+)$/,
];

function collapseSpaces(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/[:;.,-]+$/u, "")
    .trim();
}

function matchHeading(line: string, phrases: string[]): boolean {
  const normalized = normalizeHeading(line);
  return phrases.some(
    (phrase) =>
      normalized === phrase || normalized.startsWith(phrase + " "),
  );
}

function getHeadingType(line: string): "responsibility" | "requirement" | null {
  if (matchHeading(line, RESPONSIBILITY_HEADINGS)) {
    return "responsibility";
  }
  if (matchHeading(line, REQUIREMENT_HEADINGS)) {
    return "requirement";
  }
  return null;
}

function extractBulletText(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  for (const pattern of BULLET_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractBlockItems(block: string[]): {
  items: string[];
  count: number;
  rejected: number;
} {
  const seen = new Set<string>();
  const items: string[] = [];
  let count = 0;
  let rejected = 0;
  for (const rawLine of block) {
    const candidate = extractBulletText(rawLine);
    if (!candidate || candidate.length < 8) {
      rejected += 1;
      continue;
    }
    const normalized = collapseSpaces(candidate);
    if (!normalized) {
      rejected += 1;
      continue;
    }
    const lower = normalized.toLowerCase();
    if (LABEL_ONLY_PHRASES.has(lower)) {
      rejected += 1;
      continue;
    }
    if (isNoiseCandidate(normalized)) {
      rejected += 1;
      continue;
    }
    count += 1;
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    if (items.length < 60) {
      items.push(normalized);
    }
  }
  return { items, count, rejected };
}

function isNoiseCandidate(value: string): boolean {
  const normalized = collapseSpaces(value);
  if (!normalized) return true;
  if (normalized.length < 12) return true;
  if (LOCATION_ONLY_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (MALFORMED_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (!/[a-z]/i.test(normalized) || !/\b[a-z]{3,}\b/i.test(normalized)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true;
  return false;
}

function containsKeyword(value: string, keywords: string[]): boolean {
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function gatherLineCandidates(
  lines: string[],
  keywords: string[],
  cap: number,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const line of lines) {
    const candidate = collapseSpaces(line);
    if (candidate.length < 8) {
      continue;
    }
    if (!containsKeyword(candidate, keywords)) {
      continue;
    }
    const marker = candidate.toLowerCase();
    if (seen.has(marker)) {
      continue;
    }
    seen.add(marker);
    if (results.length < cap) {
      results.push(candidate);
    }
  }
  return results;
}

function splitSentences(text: string): string[] {
  const chunks = text.split(/(?<=[.!?])\s+|\n+/u);
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

function gatherSentenceCandidates(
  source: string,
  keywords: string[],
  cap: number,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const sentence of splitSentences(source)) {
    if (sentence.length < 12) {
      continue;
    }
    if (!containsKeyword(sentence, keywords)) {
      continue;
    }
    const normalized = collapseSpaces(sentence);
    const marker = normalized.toLowerCase();
    if (seen.has(marker)) {
      continue;
    }
    seen.add(marker);
    if (results.length < cap) {
      results.push(normalized);
    }
  }
  return results;
}

function collectSignalBucket(
  items: string[],
  keywords: string[],
  cap = 30,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of items) {
    if (!containsKeyword(item, keywords)) {
      continue;
    }
    const normalized = collapseSpaces(item);
    const marker = normalized.toLowerCase();
    if (seen.has(marker)) {
      continue;
    }
    seen.add(marker);
    if (results.length < cap) {
      results.push(normalized);
    }
  }
  return results;
}

function sumLengths(items: string[]): number {
  return items.reduce((sum, item) => sum + item.length, 0);
}

export function normalizeJobDescription(
  rawText: string | null | undefined,
): { normalized: NormalizedJob; debug: JobNormalizationDebug } {
  const textValue = typeof rawText === "string" ? rawText : "";
  const rawCharCount = textValue.length;
  const rawSha256 = crypto.createHash("sha256").update(textValue).digest("hex");
  const normalizedText = textValue.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const collapsedText = normalizedText.replace(/[ \t]+/g, " ");
  const lines = collapsedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const respBlock: string[] = [];
  const reqBlock: string[] = [];
  const headingsDetected: string[] = [];
  let current: "responsibility" | "requirement" | null = null;
  let blockCount = 0;

  for (const line of lines) {
    const headingType = getHeadingType(line);
    if (headingType) {
      headingsDetected.push(line);
      current = headingType;
      blockCount = 0;
      continue;
    }
    if (current && blockCount < 120) {
      if (current === "responsibility") {
        respBlock.push(line);
      } else {
        reqBlock.push(line);
      }
      blockCount += 1;
    }
  }

  const respExtraction = extractBlockItems(respBlock);
  const reqExtraction = extractBlockItems(reqBlock);
  let responsibilities = respExtraction.items;
  let requirements = reqExtraction.items;
  const bulletsDetected = respExtraction.count + reqExtraction.count;
  const sanitizedRequirementCandidates = reqExtraction.count;
  const rejectedRequirementCandidates = reqExtraction.rejected;
  let fallbackSentenceSplitUsed = false;

  if (!responsibilities.length) {
    const fromLines = gatherLineCandidates(
      lines,
      RESPONSIBILITY_KEYWORDS,
      60,
    );
    if (fromLines.length) {
      responsibilities = fromLines;
    } else {
      const fromSentences = gatherSentenceCandidates(
        normalizedText,
        RESPONSIBILITY_KEYWORDS,
        60,
      );
      if (fromSentences.length) {
        responsibilities = fromSentences;
        fallbackSentenceSplitUsed = true;
      }
    }
  }

  if (!requirements.length) {
    const fromLines = gatherLineCandidates(lines, REQUIREMENT_KEYWORDS, 60);
    if (fromLines.length) {
      requirements = fromLines;
    } else {
      const fromSentences = gatherSentenceCandidates(
        normalizedText,
        REQUIREMENT_KEYWORDS,
        60,
      );
      if (fromSentences.length) {
        requirements = fromSentences;
        fallbackSentenceSplitUsed = true;
      }
    }
  }

  const requirementPollutionScore = requirements.length
    ? rejectedRequirementCandidates / Math.max(1, sanitizedRequirementCandidates + rejectedRequirementCandidates)
    : 1;
  if (requirements.length && (requirements.length < 2 || requirementPollutionScore >= 0.45)) {
    const fallbackRequirements = gatherSentenceCandidates(
      normalizedText,
      REQUIREMENT_KEYWORDS,
      60,
    ).filter((candidate) => !isNoiseCandidate(candidate));
    if (fallbackRequirements.length) {
      requirements = fallbackRequirements;
      fallbackSentenceSplitUsed = true;
    }
  }

  const combinedSignals = [...responsibilities, ...requirements];
  const signals = {
    leadership: collectSignalBucket(combinedSignals, LEADERSHIP_KEYWORDS),
    strategic: collectSignalBucket(combinedSignals, STRATEGIC_KEYWORDS),
    tactical: collectSignalBucket(combinedSignals, TACTICAL_KEYWORDS),
    technical: collectSignalBucket(combinedSignals, TECHNICAL_KEYWORDS),
    domain: collectSignalBucket(combinedSignals, DOMAIN_KEYWORDS),
  };

  const source =
    responsibilities.length > 0 || requirements.length > 0 ? "normalized" : "raw";

  const normalized: NormalizedJob = {
    responsibilities,
    requirements,
    signals,
    meta: {
      source,
      rawCharCount,
      rawSha256,
    },
  };

  const debug: JobNormalizationDebug = {
    responsibilitiesCount: responsibilities.length,
    responsibilitiesChars: sumLengths(responsibilities),
    requirementsCount: requirements.length,
    requirementsChars: sumLengths(requirements),
    headingsDetected,
    bulletsDetected,
    fallbackSentenceSplitUsed,
    sanitizedRequirementCandidates,
    rejectedRequirementCandidates,
    extractionQuality:
      requirements.length >= 3 && requirementPollutionScore < 0.25
        ? 'high'
        : requirements.length >= 1 && requirementPollutionScore < 0.5
          ? 'medium'
          : 'low',
  };

  return { normalized, debug };
}
