const SHARED_BOILERPLATE_PATTERNS = [
  /\bour mission\b/i,
  /\bwe empower\b/i,
  /\bevery person and every organization\b/i,
  /\bwe are looking for\b/i,
  /\bjoin our team\b/i,
  /\bthis position will\b/i,
  /\bcandidate will\b/i,
  /\bresponsible for\b/i,
  /\babout us\b/i,
  /\bwho we are\b/i,
  /\bat\s+[a-z][a-z0-9&.\- ]{1,40},?\s+our mission\b/i,
];

const GENERIC_GAP_PATTERNS = [
  /^\s*(?:qualifications|skills|requirements|experience|abilities|candidate)\s*:?\.?$/i,
  /^(?:proficient|excellent|strong)\b/i,
  /^\s*ability to\b/i,
  /^\s*responsible for\b/i,
];

const SOFT_SKILL_SLUDGE_PATTERNS = [
  /\bstrong cross-functional influencing\b/i,
  /\bcollaboration skills\b/i,
  /\bexcellent troubleshooting\b/i,
  /\bexcellent communication\b/i,
  /\borganizational skills\b/i,
  /\bleadership and team building\b/i,
];

const ACTION_VERB_PATTERNS = [
  /\bled\b/i,
  /\bbuilt\b/i,
  /\bdesigned\b/i,
  /\bdeveloped\b/i,
  /\bdirected\b/i,
  /\bdrove\b/i,
  /\bmanaged\b/i,
  /\bowned\b/i,
  /\bpartnered\b/i,
  /\boperated\b/i,
  /\bscaled\b/i,
  /\bimplemented\b/i,
  /\bcreated\b/i,
  /\bimproved\b/i,
  /\bprepared\b/i,
];

const KNOWN_ACRONYMS: Record<string, string> = {
  api: "API",
  apis: "APIs",
  sdk: "SDK",
  sdks: "SDKs",
  os: "OS",
  rtos: "RTOS",
  sql: "SQL",
  saas: "SaaS",
  crm: "CRM",
  cx: "CX",
  noc: "NOC",
};

const PROPER_CASE_WORDS: Record<string, string> = {
  microsoft: "Microsoft",
  salesforce: "Salesforce",
  zendesk: "Zendesk",
  rust: "Rust",
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
};

type SignalKind = "strength" | "gap" | "supporting";

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLabelPrefix(value: string): string {
  return value.replace(/^[^:]+:\s*/, "").trim();
}

function normalizePunctuation(value: string): string {
  return value
    .replace(/[’']/g, "'")
    .replace(/\brtos['’]s\b/gi, "RTOS")
    .replace(/\bapis['’]s\b/gi, "APIs")
    .replace(/\b(\w+)['’]s\b/g, "$1")
    .replace(/[–—]\s*$/g, "")
    .replace(/\s*[–—-]\s*(?:to\s+empower|empower|our mission).*$/i, "")
    .replace(/\s+(?:and|or|with|for|to)$/i, "")
    .replace(/\s*[,:;/-]+\s*$/g, "");
}

function firstCompleteSegment(value: string): string {
  const sentenceMatch = value.match(/[^.!?]+[.!?]/);
  if (sentenceMatch?.[0]) {
    return sentenceMatch[0].trim();
  }

  const clause = value.split(/\s*[;:]\s*/)[0]?.trim() ?? value;
  return clause;
}

function applySentenceCase(value: string): string {
  const compact = cleanWhitespace(value);
  if (!compact) return "";

  let isFirstWord = true;
  return compact
    .split(/(\s+|\/|-|,|\(|\))/)
    .map((token) => {
      if (!/[a-z0-9]/i.test(token)) return token;
      const bare = token.replace(/[^a-z0-9']/gi, "");
      if (!bare) return token;

      const normalized = bare.toLowerCase();
      const replacement =
        KNOWN_ACRONYMS[normalized] ??
        PROPER_CASE_WORDS[normalized] ??
        (isFirstWord
          ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
          : normalized);
      isFirstWord = false;
      return token.replace(new RegExp(bare, "i"), replacement);
    })
    .join("");
}

function trimToWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const window = value.slice(0, maxLength);
  const cut = window.lastIndexOf(" ");
  return (cut > 20 ? window.slice(0, cut) : window).trim().replace(/[,:;/-]+$/, "");
}

function compressStrength(value: string): string {
  const words = value.split(/\s+/);
  if (words.length <= 14 && value.length <= 90) {
    return value;
  }

  const actionIndex = words.findIndex((word) =>
    ACTION_VERB_PATTERNS.some((pattern) => pattern.test(word)),
  );
  const compactWords = (actionIndex >= 0 ? words.slice(actionIndex) : words).slice(0, 12);
  return trimToWordBoundary(compactWords.join(" "), 120);
}

function compressGap(value: string): string {
  const compact = value
    .replace(/^(?:experience with|experience in)\s+/i, "")
    .replace(/^(?:ability to|proficient in|excellent|strong)\s+/i, "");
  return trimToWordBoundary(compact, 100);
}

function hasBoilerplate(value: string): boolean {
  return SHARED_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeRaw(value: string): string {
  return cleanWhitespace(normalizePunctuation(stripLabelPrefix(value)));
}

export function sanitizeScoreExplanationLine(
  value: string,
  kind: SignalKind,
): string | null {
  const raw = sanitizeRaw(value);
  if (!raw || hasBoilerplate(raw)) return null;

  let compact = firstCompleteSegment(raw)
    .replace(/^(?:strong|excellent|proficient)\s+/i, "")
    .replace(/^(?:ability to|proven ability to|demonstrated ability to)\s+/i, "")
    .replace(/^(?:at\s+[a-z][a-z0-9&.\- ]+,?\s*)/i, "");
  compact = cleanWhitespace(compact);

  if (!compact || hasBoilerplate(compact)) return null;

  if (kind === "gap") {
    if (GENERIC_GAP_PATTERNS.some((pattern) => pattern.test(compact))) return null;
    compact = compressGap(compact);
  } else if (kind === "strength") {
    if (SOFT_SKILL_SLUDGE_PATTERNS.some((pattern) => pattern.test(compact))) return null;
    if (!ACTION_VERB_PATTERNS.some((pattern) => pattern.test(compact))) return null;
    compact = compressStrength(compact);
  } else {
    compact = trimToWordBoundary(compact, 120);
  }

  compact = applySentenceCase(compact);
  compact = cleanWhitespace(compact).replace(/[.]+$/, "");

  if (!compact || compact.length < 4) return null;
  if (kind === "strength" && compact.length > 120) return null;
  if (kind === "gap" && compact.length > 100) return null;
  if (kind === "gap" && hasBoilerplate(compact)) return null;

  return compact;
}

export function sanitizeScoreExplanationList(
  values: string[],
  kind: SignalKind,
  maxCount: number,
): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const value of values) {
    const cleaned = sanitizeScoreExplanationLine(value, kind);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sanitized.push(cleaned);
    if (sanitized.length >= maxCount) break;
  }

  return sanitized;
}
