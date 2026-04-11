export type UiTextType = "plain_text" | "structured" | "markdown";

export type UiTextContent = {
  type: UiTextType;
  content: string;
};

export type RenderedTextSource = string | UiTextContent | null | undefined;

export type RenderedTextContext = {
  endpoint: string;
  field: string;
  payload?: unknown;
};

export const FALLBACK_RENDERED_TEXT = "We couldn’t display this result. Please retry.";

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;
const UNRESOLVED_TOKEN_PATTERNS = [
  /\$\{[^{}]+\}/,
  /\{\{[^{}]+\}\}/,
  /\[\[[^\]]+\]\]/,
  /<%[\s\S]*?%>/,
  /\$\{[^}]*$/,
  /\{\{[^}]*$/,
  /\[\[[^\]]*$/,
  /\b(?:undefined|null|NaN|Infinity)\b/i,
];
const BROKEN_SYNTAX_PATTERNS = [
  /^[\s\d().,;:+\-*/=^|<>{}\[\]]+$/,
  /(?:^|[^A-Za-z0-9])[-+*/=^]{2,}(?:[^A-Za-z0-9]|$)/,
  /\b\d+\s*[-+*/=^]\s*\d+(?:\s*[-+*/=^]\s*\d+)+\b/,
];

function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

function isUiTextContent(value: unknown): value is UiTextContent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.type === "plain_text" || record.type === "structured" || record.type === "markdown") &&
    typeof record.content === "string"
  );
}

function extractRawText(value: RenderedTextSource): { type: UiTextType; content: string } {
  if (typeof value === "string") {
    return { type: "plain_text", content: value };
  }
  if (isUiTextContent(value)) {
    return { type: value.type, content: value.content };
  }
  return { type: "plain_text", content: "" };
}

function stripNonPrintable(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, " ");
}

function normalizeWhitespace(value: string): string {
  return value.replace(ZERO_WIDTH_PATTERN, "").replace(/\s+/g, " ").trim();
}

function isRenderableText(value: string): boolean {
  if (!value) return false;
  if (UNRESOLVED_TOKEN_PATTERNS.some((pattern) => pattern.test(value))) return false;
  if (BROKEN_SYNTAX_PATTERNS.some((pattern) => pattern.test(value))) return false;

  const hasLetters = /[A-Za-z]/.test(value);
  const looksLikeBareMath =
    !hasLetters &&
    /[+\-*/=^]/.test(value) &&
    value.length <= 80 &&
    /^[\d\s().,;:+\-*/=^|<>{}\[\]]+$/.test(value);

  if (looksLikeBareMath) return false;

  return true;
}

function preview(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 240);
  try {
    return JSON.stringify(value)?.slice(0, 240) ?? "";
  } catch {
    return String(value).slice(0, 240);
  }
}

function logInvalidRenderedText(context: RenderedTextContext, rawValue: unknown, rendered: string) {
  if (!isDevEnvironment()) return;
  console.warn("[ui-text] invalid or sanitized content", {
    endpoint: context.endpoint,
    field: context.field,
    raw: preview(rawValue),
    rendered,
    payload: context.payload ? preview(context.payload) : undefined,
  });
}

export function sanitizeRenderedText(
  value: RenderedTextSource,
  context: RenderedTextContext,
): UiTextContent {
  const raw = extractRawText(value);
  const stripped = normalizeWhitespace(stripNonPrintable(raw.content));
  const rendered = stripped && isRenderableText(stripped) ? stripped : FALLBACK_RENDERED_TEXT;
  const hadRenderableInput = typeof raw.content === "string" && raw.content.trim().length > 0;

  if (
    hadRenderableInput &&
    (rendered !== raw.content || (rendered === FALLBACK_RENDERED_TEXT && stripped !== FALLBACK_RENDERED_TEXT))
  ) {
    logInvalidRenderedText(context, value, rendered);
  }

  return {
    type: raw.type,
    content: rendered,
  };
}

export function sanitizeRenderedTextValue(
  value: RenderedTextSource,
  context: RenderedTextContext,
): string {
  return sanitizeRenderedText(value, context).content;
}

export function sanitizeRenderedTextList(
  values: RenderedTextSource[],
  context: RenderedTextContext,
): string[] {
  return values
    .map((value, index) =>
      sanitizeRenderedText(value, {
        ...context,
        field: `${context.field}[${index}]`,
      }).content,
    )
    .filter((item) => item && item !== FALLBACK_RENDERED_TEXT);
}
