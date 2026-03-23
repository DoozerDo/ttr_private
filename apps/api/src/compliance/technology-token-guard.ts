const PHONE_NUMBER_PATTERN = /^(?:\+?1[\s.-]?)?(?:\d{3}[\s.-]?){2}\d{4}$/;
const YEAR_PATTERN = /^(?:19|20)\d{2}$/;
const PURE_NUMERIC_PATTERN = /^\d+$/;
const YEAR_WORD_MERGE_PATTERN = /^(?:19|20)\d{2}[a-z]+$/i;

const INVALID_HYPHENATED_DESCRIPTORS = new Set([
  'client-impacting',
  'billing-impacting',
  'self-service',
  'multi-system',
]);

const INVALID_HYPHENATED_SUFFIX_PATTERN = /^(?:client|billing|business|revenue|customer|operations)-impacting$/i;

export function isObviouslyInvalidTechnologyToken(value: string): boolean {
  const normalized = String(value ?? '').trim();
  if (!normalized) return true;
  const lower = normalized.toLowerCase();

  if (PHONE_NUMBER_PATTERN.test(normalized)) return true;
  if (YEAR_PATTERN.test(normalized)) return true;
  if (PURE_NUMERIC_PATTERN.test(normalized)) return true;
  if (YEAR_WORD_MERGE_PATTERN.test(normalized)) return true;

  if (INVALID_HYPHENATED_DESCRIPTORS.has(lower)) return true;
  if (INVALID_HYPHENATED_SUFFIX_PATTERN.test(lower)) return true;

  // Suppress zero-padded / numeric fragments (e.g. 000) and numeric-heavy fragments.
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length >= 3 && digitsOnly.length === normalized.length) return true;

  return false;
}

