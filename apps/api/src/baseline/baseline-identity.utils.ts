import { Baseline } from './baseline.entity';
import { BaselineSchemaCoreShape } from './baseline-schema';

export type BaselineIdentity = {
  fullName?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  location?: string | null;
  contactLine?: string | null;
};

export function resolveBaselineIdentity(
  baseline: Baseline,
): BaselineIdentity | undefined {
  const parsed = (baseline.parsedRecords ?? [])
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!parsed || !parsed.parsedJson) {
    return resolveIdentityFromSections(baseline);
  }

  const parsedCore = parsed.parsedJson as Partial<BaselineSchemaCoreShape>;
  const identity = parsedCore.identity;

  if (!identity) {
    return resolveIdentityFromSections(baseline);
  }

  return {
    fullName: identity.full_name?.trim() || null,
    currentTitle: identity.current_title?.trim() || null,
    currentCompany: identity.current_company?.trim() || null,
    location: identity.location?.trim() || null,
    contactLine: extractContactLineFromIdentity(identity),
  };
}

function resolveIdentityFromSections(baseline: Baseline): BaselineIdentity | undefined {
  const candidateLines = (baseline.sections ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((section) =>
      (section.content ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );

  const fullName = candidateLines.find((line) => {
    if (/^(summary|experience|skills|education|technical skills|professional experience|projects?)$/i.test(line)) {
      return false;
    }
    if (/^[-\u2022•]/.test(line)) {
      return false;
    }
    return line.split(/\s+/).length >= 2 && line.length <= 80;
  });

  if (!fullName) {
    return undefined;
  }

  const contactLine = extractContactLineFromLines(candidateLines, fullName);

  return {
    fullName,
    currentTitle: null,
    currentCompany: null,
    location: null,
    contactLine,
  };
}

function extractContactLineFromIdentity(identity: unknown): string | null {
  const identityRecord = (identity ?? {}) as Record<string, unknown>;
  const contactParts: string[] = [];
  const email = trimText(identityRecord.email);
  const phone = trimText(identityRecord.phone);
  const location = trimText(identityRecord.location);
  const website = trimText(identityRecord.website);
  const linkedin = trimText(identityRecord.linkedin);
  const github = trimText(identityRecord.github);

  if (email) contactParts.push(email);
  if (phone) contactParts.push(phone);
  if (location) contactParts.push(location);
  if (website) contactParts.push(website);
  if (linkedin) contactParts.push(linkedin);
  if (github) contactParts.push(github);

  return contactParts.length ? contactParts.join(' | ') : null;
}

function extractContactLineFromLines(candidateLines: string[], fullName: string): string | null {
  const nameIndex = candidateLines.findIndex((line) => line === fullName);
  const searchLines = nameIndex >= 0 ? candidateLines.slice(nameIndex + 1) : candidateLines;

  const contactParts: string[] = [];
  for (const line of searchLines) {
    const text = trimText(line);
    if (!text || text === fullName) continue;
    if (isContactDetailLine(text)) {
      contactParts.push(text);
      if (contactParts.length >= 3) break;
    }
  }

  return contactParts.length ? contactParts.join(' | ') : null;
}

function isContactDetailLine(value: string): boolean {
  const text = trimText(value);
  if (!text) return false;
  if (/@/.test(text)) return true;
  if (/\b(?:https?:\/\/|www\.|linkedin\.com|github\.com)\b/i.test(text)) return true;
  if (/\+?\d[\d\s().-]{7,}\d/.test(text)) return true;
  if (/^(?:remote|hybrid|onsite|on-site)\b/i.test(text)) return true;
  if (/^(?:[A-Za-z .'-]+,\s*[A-Z]{2}|[A-Za-z .'-]+,\s*[A-Za-z .'-]+)$/.test(text) && text.split(/\s+/).length <= 6) return true;
  return false;
}

function trimText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
