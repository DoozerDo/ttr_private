import {
  ExperienceEntry,
  ResumeDocxHeader,
  ResumeDocxModel,
} from '../docx-template.types';

type ResumeSection = {
  title?: string | null;
  content: string;
};

const SUMMARY_KEYWORDS = ['SUMMARY', 'PROFESSIONAL SUMMARY'];
const SKILLS_KEYWORDS = ['SKILLS', 'TECHNICAL SKILLS'];
const EXPERIENCE_KEYWORDS = ['EXPERIENCE', 'PROFESSIONAL EXPERIENCE'];
const EDUCATION_KEYWORDS = ['EDUCATION'];
const CERTIFICATION_KEYWORDS = ['CERTIFICATIONS'];
const HEADER_TERMINATION_KEYWORDS = [
  ...SUMMARY_KEYWORDS,
  ...SKILLS_KEYWORDS,
  ...EXPERIENCE_KEYWORDS,
  ...EDUCATION_KEYWORDS,
  ...CERTIFICATION_KEYWORDS,
];

const BULLET_PATTERN = /^[•*-]\s+(.*)$/;

function linesFromContent(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractHeaderLines(text: string) {
  const headerLines: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  for (const line of lines) {
    if (!line) {
      continue;
    }
    const upper = line.toUpperCase();
    if (
      HEADER_TERMINATION_KEYWORDS.some((keyword) =>
        upper.startsWith(keyword),
      )
    ) {
      break;
    }
    headerLines.push(line);
    if (headerLines.length >= 3) {
      break;
    }
  }
  return headerLines;
}

function chunkSkills(line: string) {
  const tokens = line
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const groups: string[] = [];
  const chunkSize = 3;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    groups.push(tokens.slice(i, i + chunkSize).join(', '));
  }
  return groups;
}

function findSectionByKeywords(sections: ResumeSection[], keywords: string[]) {
  return sections.find((section) => {
    const title = section.title?.toUpperCase().trim() ?? '';
    return keywords.some((keyword) => title.includes(keyword));
  });
}

function parseExperiences(section?: ResumeSection): ExperienceEntry[] {
  if (!section) return [];
  const blocks = section.content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const entries: ExperienceEntry[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    let roleLine = lines.shift()!;
    let companyLine: string | undefined;
    let dateRange: string | undefined;
    const bullets: string[] = [];

    if (isExperienceHeader(roleLine)) {
      const parts = roleLine.split('|').map((part) => part.trim()).filter(Boolean);
      roleLine = parts[0] ?? roleLine;
      companyLine = parts.slice(1).join(' | ') || undefined;
      dateRange = parts.slice(-1)[0] ?? undefined;
      if (parts.length > 2) {
        dateRange = parts.slice(-1)[0];
        companyLine = parts.slice(1, -1).join(' | ');
      }
    } else if (lines.length && isExperienceHeader(lines[0])) {
      const headerParts = lines.shift()!.split('|').map((part) => part.trim()).filter(Boolean);
      companyLine = headerParts.slice(1).join(' | ') || undefined;
      dateRange = headerParts.slice(-1)[0];
    }

    for (const contentLine of lines) {
      const match = contentLine.match(BULLET_PATTERN);
      if (match) {
        bullets.push(match[1]);
      } else {
        // treat as bullet fallback
        bullets.push(contentLine);
      }
    }

    entries.push({
      role: roleLine,
      company: companyLine,
      dateRange,
      bullets,
    });
  }
  return entries;
}

function isExperienceHeader(line: string) {
  return line.includes('|') || /\d{4}\s*[-–]\s*(\d{4}|Present|present)/.test(line);
}

export function mapResumeTextToModel(text: string, sections: ResumeSection[]): ResumeDocxModel {
  const headerLines = extractHeaderLines(text);
  const header: ResumeDocxHeader = {
    name: headerLines[0],
    title: headerLines[1],
    contactLines: headerLines.slice(2, 5),
  };

  const summarySection = findSectionByKeywords(sections, SUMMARY_KEYWORDS);
  const summary = summarySection
    ? summarySection.content
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

  const skillsSection = findSectionByKeywords(sections, SKILLS_KEYWORDS);
  const skillGroups: string[][] = [];
  if (skillsSection) {
    linesFromContent(skillsSection.content).forEach((line) => {
      skillGroups.push(chunkSkills(line));
    });
  }

  const experienceSection = findSectionByKeywords(sections, EXPERIENCE_KEYWORDS);
  const experiences = parseExperiences(experienceSection);

  const educationSection = findSectionByKeywords(sections, EDUCATION_KEYWORDS);
  const education = educationSection ? linesFromContent(educationSection.content) : [];

  const certificationSection = findSectionByKeywords(sections, CERTIFICATION_KEYWORDS);
  const certifications = certificationSection ? linesFromContent(certificationSection.content) : [];

  return {
    header,
    summary,
    skills: skillGroups,
    experiences,
    education,
    certifications,
  };
}
