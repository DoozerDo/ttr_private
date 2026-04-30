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
      const line = trimToText(lines[idx]);
      idx += 1;
      if (!line) continue;
      if (isBulletLine(line)) continue;

      const header = parseExperienceHeaderLine(line);
      if (!header) continue;

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
        if (!isBulletLine(nextLine) && parseExperienceHeaderLine(nextLine)) break;
        if (isBulletLine(nextLine)) {
          const bullet = stripBulletPrefix(nextLine);
          if (bullet) bullets.push(bullet);
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

  return {
    summary: summary || undefined,
    experience,
    education,
    skills,
    missingEvidenceReasons,
  };
}
