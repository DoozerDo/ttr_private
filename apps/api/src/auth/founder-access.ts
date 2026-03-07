export function normalizeEmail(input?: string | null): string {
  return (input ?? '').trim().toLowerCase();
}

export function parseFounderEmails(raw?: string | null): Set<string> {
  if (!raw) {
    return new Set();
  }

  const emails = raw
    .split(',')
    .map((value) => normalizeEmail(value))
    .filter((value) => Boolean(value));

  return new Set(emails);
}

export function isFounderEmail(
  email?: string | null,
  founderEmailsRaw?: string | null,
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  return parseFounderEmails(founderEmailsRaw).has(normalized);
}
