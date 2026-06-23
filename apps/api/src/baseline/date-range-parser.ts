export const MONTH_YEAR_TOKEN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+(?:19|20)\\d{2}';
const YEAR_TOKEN = '(?:19|20)\\d{2}';
const DATE_TOKEN = `(?:${MONTH_YEAR_TOKEN}|${YEAR_TOKEN})`;
const DATE_RANGE_SEPARATOR_TOKEN = '(?:\\s*(?:\\||[-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212])\\s*|\\s+to\\s+)';
const DATE_RANGE_RE = new RegExp(
  `\\b(${DATE_TOKEN})\\b${DATE_RANGE_SEPARATOR_TOKEN}(?:(${DATE_TOKEN})|(present|current))`,
  'i',
);
export const MONTH_YEAR_RE = new RegExp(`\\b${MONTH_YEAR_TOKEN}\\b`, 'i');
const DATE_RANGE_GLOBAL_RE = new RegExp(DATE_RANGE_RE.source, 'gi');

export type DateRangeMatch = {
  start: string;
  end: string;
  matchedText: string;
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeDateRangeSeparators(text: string): string {
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

export function extractDateRangeMatch(value: string): DateRangeMatch | null {
  const raw = trimToText(value);
  if (!raw) return null;
  const normalized = normalizeDateRangeSeparators(raw);
  const match = normalized.match(DATE_RANGE_RE);
  if (!match) return null;
  const start = String(match[1] ?? '').replace(/[),.;:]+$/, '').trim();
  const end = String(match[2] ?? match[3] ?? '').replace(/[),.;:]+$/, '').trim();
  if (!start || !end) return null;
  return {
    start,
    end: /\b(?:present|current)\b/i.test(end) ? 'Present' : end,
    matchedText: String(match[0] ?? '').trim(),
  };
}

export function splitCanonicalDateRangeText(value: string): { start_date?: string; end_date?: string } {
  const text = trimToText(value);
  if (!text) return {};
  const match = extractDateRangeMatch(text);
  if (match) return { start_date: match.start, end_date: match.end };
  const normalized = normalizeDateRangeSeparators(text);
  const parts = normalized.split(' - ').map((part) => trimToText(part)).filter(Boolean);
  if (parts.length === 1) {
    return { start_date: parts[0] };
  }
  return {};
}

export function canonicalizeDateRange(text: string): string {
  const match = extractDateRangeMatch(text);
  if (!match) return normalizeDateRangeSeparators(text);
  return `${match.start} – ${match.end}`.replace(/\s+/g, ' ').trim();
}

export function looksLikeDatesLine(value: string): boolean {
  const raw = trimToText(value);
  if (!raw) return false;
  const normalized = normalizeDateRangeSeparators(raw);
  return Boolean(extractDateRangeMatch(normalized)) && normalized.split(/\s+/).length <= 12;
}

export function countDateRangeMatches(text: string): number {
  const raw = trimToText(text);
  if (!raw) return 0;
  const normalized = normalizeDateRangeSeparators(raw);
  const matches = normalized.match(DATE_RANGE_GLOBAL_RE);
  return matches?.length ?? 0;
}

export function supportsDateRangeText(text: string): boolean {
  return Boolean(extractDateRangeMatch(text));
}
