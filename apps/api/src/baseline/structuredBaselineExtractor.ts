import type { BaselineSection } from './baseline-section.entity';

export type StructuredBaseline = {
  contact?: Record<string, unknown>;
  summary?: string;
  experience: Array<{
    company: string;
    roleTitle: string;
    dates?: string;
    bullets: string[];
    source: 'baseline';
  }>;
  education: string[];
  skills: string[];
  missingEvidenceReasons: string[];
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitLines(value: string): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function isBulletLine(line: string): boolean {
  return /^[-•*]\s+/.test(line);
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[-•*]\s+/, '').trim();
}

function looksLikeSentence(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  if (/[.!?]\s*$/.test(text)) return true;
  if (/[.!?]/.test(text) && text.split(/\s+/).length > 6) return true;
  return false;
}

function startsWithActionVerb(value: string): boolean {
  const first = trimToText(value).split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!first) return false;
  // Minimal action-verb set (aligned with quality validator intent).
  const verbs = new Set([
    'designed',
    'built',
    'led',
    'managed',
    'created',
    'implemented',
    'developed',
    'owned',
    'improved',
    'reduced',
    'increased',
    'delivered',
    'supported',
    'maintained',
    'coordinated',
    'partnered',
    'collaborated',
    'architected',
    'automated',
    'migrated',
    'troubleshot',
    'resolved',
  ]);
  return verbs.has(first);
}

function isUnsafeHeaderCandidate(value: string): boolean {
  const text = trimToText(value);
  if (!text) return true;
  // Require at least one letter; pure date/range tokens are not valid headers.
  if (!/[A-Za-z]/.test(text)) return true;
  // Reject obvious prose/bullet-like content.
  if (looksLikeSentence(text) || startsWithActionVerb(text)) return true;
  // Reject very long "headers" that are likely bullets.
  if (text.split(/\s+/).length > 10) return true;
  return false;
}

function parseExperienceHeaderLine(line: string): { company: string; roleTitle: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;

  // Prefer explicit pipe-separated headers:
  // "Company | Role Title | 2020 - 2024"
  if (raw.includes('|')) {
    const parts = raw.split('|').map((p) => trimToText(p)).filter(Boolean);
    if (parts.length < 2) return null;
    const [company, roleTitle, dates] = parts;
    if (!company || !roleTitle) return null;
    return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  // Support "Company — Role Title — dates" and "Company - Role Title - dates"
  const dashParts = raw.split(/\s[—-]\s/).map((p) => trimToText(p)).filter(Boolean);
  if (dashParts.length >= 2) {
    const [company, roleTitle, dates] = dashParts;
    if (!company || !roleTitle) return null;
    return { company, roleTitle, ...(dates ? { dates } : {}) };
  }

  return null;
}

function looksLikeDatesLine(line: string): boolean {
  const raw = trimToText(line);
  if (!raw) return false;
  return /\b(19|20)\d{2}\b/.test(raw) && raw.split(/\s+/).length <= 8;
}

function parseCompanyWithDates(line: string): { company: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s*\(([^()]*\b(19|20)\d{2}[^()]*)\)\s*$/);
  if (!match) return null;
  const company = trimToText(match[1]);
  const dates = trimToText(match[2]);
  if (!company) return null;
  return { company, ...(dates ? { dates } : {}) };
}

function parseRoleAtCompany(line: string): { company: string; roleTitle: string; dates?: string } | null {
  const raw = trimToText(line);
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s+at\s+(.+?)(?:\s*\(([^()]*)\))?\s*$/i);
  if (!match) return null;
  const roleTitle = trimToText(match[1]);
  const company = trimToText(match[2]);
  const dates = trimToText(match[3]);
  if (!roleTitle || !company) return null;
  return { company, roleTitle, ...(dates ? { dates } : {}) };
}

function isImplicitBulletCandidate(line: string): boolean {
  const raw = trimToText(line);
  if (!raw) return false;
  if (looksLikeSentence(raw)) return false;
  if (!startsWithActionVerb(raw)) return false;
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (wordCount > 18) return false;
  if (raw.length > 160) return false;
  return true;
}

function readExperienceHeaderAt(
  lines: string[],
  startIndex: number,
): { header: { company: string; roleTitle: string; dates?: string }; consumed: number } | null {
  const line0 = trimToText(lines[startIndex] ?? '');
  if (!line0 || isBulletLine(line0)) return null;

  const single = parseExperienceHeaderLine(line0) ?? parseRoleAtCompany(line0);
  if (single) return { header: single, consumed: 1 };

  // Prevent bullet-like prose from being misclassified as a multi-line header's company line.
  if (startsWithActionVerb(line0) || looksLikeSentence(line0)) {
    return null;
  }

  const line1 = trimToText(lines[startIndex + 1] ?? '');
  if (line1 && !isBulletLine(line1)) {
    const companyWithDates = parseCompanyWithDates(line0);
    if (companyWithDates) {
      return {
        header: { company: companyWithDates.company, roleTitle: line1, ...(companyWithDates.dates ? { dates: companyWithDates.dates } : {}) },
        consumed: 2,
      };
    }

    const company = line0;
    const roleTitle = line1;
    const line2 = trimToText(lines[startIndex + 2] ?? '');
    const maybeDates = line2 && !isBulletLine(line2) && looksLikeDatesLine(line2) ? line2 : undefined;
    return {
      header: { company, roleTitle, ...(maybeDates ? { dates: maybeDates } : {}) },
      consumed: maybeDates ? 3 : 2,
    };
  }

  return null;
}

function extractSectionByType(sections: BaselineSection[], type: string): BaselineSection[] {
  return sections.filter((section) => String((section as any).sectionType ?? '').toUpperCase() === type);
}

export function extractStructuredBaselineFromSections(
  baselineSections: BaselineSection[],
): StructuredBaseline {
  const missingEvidenceReasons: string[] = [];

  const summarySection = extractSectionByType(baselineSections, 'SUMMARY')[0];
  const summary = summarySection ? trimToText((summarySection as any).content) : undefined;

  const skills: string[] = [];
  const skillsSections = extractSectionByType(baselineSections, 'SKILLS');
  for (const section of skillsSections) {
    const raw = String((section as any).content ?? '');
    const lines = splitLines(raw);
    for (const line of lines) {
      if (isBulletLine(line)) {
        const bullet = stripBulletPrefix(line);
        if (bullet) {
          if (bullet.includes(',')) {
            for (const token of bullet.split(',').map((t) => trimToText(t)).filter(Boolean)) {
              skills.push(token);
            }
          } else {
            skills.push(bullet);
          }
        }
        continue;
      }
      // Also accept comma-separated skill lines.
      if (line.includes(',')) {
        for (const token of line.split(',').map((t) => trimToText(t)).filter(Boolean)) {
          skills.push(token);
        }
      }
    }
  }

  const education: string[] = [];
  const educationSections = extractSectionByType(baselineSections, 'EDUCATION');
  for (const section of educationSections) {
    const raw = String((section as any).content ?? '');
    const lines = splitLines(raw);
    for (const line of lines) {
      if (isBulletLine(line)) {
        const bullet = stripBulletPrefix(line);
        if (bullet) education.push(bullet);
        continue;
      }
      if (line) education.push(line);
    }
  }

  const experience: StructuredBaseline['experience'] = [];
  const experienceSections = extractSectionByType(baselineSections, 'EXPERIENCE');
  for (const section of experienceSections) {
    const raw = String((section as any).content ?? '');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());

    let idx = 0;
    while (idx < lines.length) {
      const headerRead = readExperienceHeaderAt(lines, idx);
      if (!headerRead) {
        idx += 1;
        continue;
      }
      const header = headerRead.header;
      idx += headerRead.consumed;

      if (isUnsafeHeaderCandidate(header.company) || isUnsafeHeaderCandidate(header.roleTitle)) {
        missingEvidenceReasons.push('Skipped experience entry with malformed company/role title header.');
        continue;
      }

      const bullets: string[] = [];
      while (idx < lines.length) {
        const nextLine = trimToText(lines[idx]);
        if (!nextLine) {
          idx += 1;
          continue;
        }
        // Stop bullets when we see the next header-looking line.
        if (!isBulletLine(nextLine) && readExperienceHeaderAt(lines, idx)) break;
        if (isBulletLine(nextLine)) {
          const bullet = stripBulletPrefix(nextLine);
          if (bullet) bullets.push(bullet);
        } else if (isImplicitBulletCandidate(nextLine)) {
          bullets.push(nextLine);
        }
        idx += 1;
      }

      experience.push({
        company: header.company,
        roleTitle: header.roleTitle,
        ...(header.dates ? { dates: header.dates } : {}),
        bullets,
        source: 'baseline',
      });
    }
  }

  if (experience.length === 0) {
    missingEvidenceReasons.push('No safely structured experience entries found (company + role title required).');
  }

  const structured: StructuredBaseline = {
    summary: summary || undefined,
    experience,
    education,
    skills,
    missingEvidenceReasons,
  };

  return structured;
}
