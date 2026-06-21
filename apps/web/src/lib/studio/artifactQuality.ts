import type { ResumeExperience, ResumeModel } from "@/lib/resumeModel";

export type ArtifactQualityStatus = "pass" | "needs_refinement";

export type ArtifactQualityIssue = {
  code: string;
  severity: "warning" | "blocking";
  message: string;
  location?: string;
};

export type ArtifactQualityResult = {
  status: ArtifactQualityStatus;
  exportable: boolean;
  issues: ArtifactQualityIssue[];
};

export function getMessageForResumeQualityReason(code: string): string {
  switch (code) {
    case "incomplete_trailing_fragment":
      return "Contains an incomplete trailing fragment.";
    case "malformed_experience_header:company":
      return "Contains a malformed experience company header.";
    case "malformed_experience_header:role_title":
      return "Contains a malformed experience role title header.";
    default:
      return code ? String(code) : "Needs correction.";
  }
}

const DANGLING_TRAILING_WORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "but",
    "because",
    "with",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "from",
  ].map((value) => value.toLowerCase()),
);

const PLACEHOLDER_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "placeholder_tbd", pattern: /\bTBD\b/i },
  { code: "placeholder_todo", pattern: /\bTODO\b/i },
  { code: "placeholder_lorem", pattern: /\bLorem ipsum\b/i },
  { code: "placeholder_insert", pattern: /\bInsert\b/i },
  { code: "placeholder_placeholder", pattern: /\bPlaceholder\b/i },
  { code: "placeholder_na", pattern: /^(?:N\/A|NA)\b/i },
];

const COVER_BANNED_PHRASES: Array<{ code: string; pattern: RegExp }> = [
  { code: "banned_operating_context", pattern: /\boperating context\b/i },
  { code: "banned_execution_systems", pattern: /\bexecution systems\b/i },
  { code: "banned_lens", pattern: /\blens\b/i },
  { code: "banned_strongest_fit", pattern: /\bstrongest fit\b/i },
];

const EXPERIENCE_HEADER_ACTION_VERBS = new Set(
  [
    "designed",
    "built",
    "led",
    "managed",
    "created",
    "implemented",
    "developed",
    "owned",
    "improved",
    "reduced",
    "increased",
    "delivered",
    "supported",
    "maintained",
    "coordinated",
    "partnered",
    "collaborated",
    "architected",
    "automated",
    "migrated",
    "troubleshot",
    "resolved",
  ].map((value) => value.toLowerCase()),
);

const EXPERIENCE_HEADER_DANGLING_SUFFIXES = new Set(
  [
    "and",
    "or",
    "with",
    "for",
    "to",
    "of",
    "full",
    "senior",
    "lead",
    "principal",
    "technical",
    "software",
    "frontend",
    "backend",
    "cloud",
    "platform",
    "systems",
  ].map((value) => value.toLowerCase()),
);

function trimToText(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.replace(/\s+/g, " ").trim();
  }
  return "";
}

function normalizeForTrailingCheck(value: string): string {
  return value
    .trim()
    .replace(/[\s\u00A0]+$/g, "")
    .replace(/[\s.,;:!?)}\]"'`]+$/g, "")
    .trim();
}

function endsWithDanglingFragment(value: string): boolean {
  const normalized = normalizeForTrailingCheck(value);
  if (!normalized) return false;
  const lastToken = normalized.split(/\s+/).pop()?.toLowerCase() ?? "";
  if (!lastToken) return false;
  return DANGLING_TRAILING_WORDS.has(lastToken);
}

function looksLikeSentence(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  if (/[.!?]\s*$/.test(text)) return true;
  if (/[.!?]/.test(text) && text.split(/\s+/).length > 6) return true;
  if (/[,:;]\s/.test(text) && text.split(/\s+/).length > 10) return true;
  return false;
}

function startsWithActionVerb(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  const first = text.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!first) return false;
  return EXPERIENCE_HEADER_ACTION_VERBS.has(first);
}

function endsWithDanglingHeaderToken(value: string): boolean {
  const normalized = normalizeForTrailingCheck(trimToText(value));
  if (!normalized) return false;
  const lastToken = normalized.split(/\s+/).pop()?.toLowerCase() ?? "";
  if (!lastToken) return false;
  return EXPERIENCE_HEADER_DANGLING_SUFFIXES.has(lastToken);
}

function detectPlaceholderIssues(value: string, location: string): ArtifactQualityIssue[] {
  const raw = trimToText(value);
  if (!raw) return [];
  const issues: ArtifactQualityIssue[] = [];
  for (const entry of PLACEHOLDER_PATTERNS) {
    if (entry.pattern.test(raw)) {
      issues.push({
        code: entry.code,
        severity: "blocking",
        message: "Contains placeholder text.",
        location,
      });
    }
  }
  return issues;
}

function detectTrailingFragmentIssue(value: string, location: string): ArtifactQualityIssue | null {
  const raw = trimToText(value);
  if (!raw) return null;
  if (!endsWithDanglingFragment(raw)) return null;
  return {
    code: "incomplete_trailing_fragment",
    severity: "blocking",
    message: "Contains an incomplete trailing fragment.",
    location,
  };
}

function detectResumeExperienceIssues(entry: ResumeExperience, index: number): ArtifactQualityIssue[] {
  const issues: ArtifactQualityIssue[] = [];
  const locationPrefix = `experience[${index}]`;

  const company = trimToText(entry.company);
  const roleTitle = trimToText(entry.roleTitle);
  const bullets = Array.isArray(entry.bullets) ? entry.bullets.map((b) => trimToText(b)).filter(Boolean) : [];

  if (company && (looksLikeSentence(company) || startsWithActionVerb(company))) {
    issues.push({
      code: "malformed_experience_header:company",
      severity: "blocking",
      message: "Contains a malformed experience company header.",
      location: `${locationPrefix}.company`,
    });
  }

  if (roleTitle && (looksLikeSentence(roleTitle) || startsWithActionVerb(roleTitle) || endsWithDanglingHeaderToken(roleTitle))) {
    issues.push({
      code: "malformed_experience_header:role_title",
      severity: "blocking",
      message: "Contains a malformed experience role title header.",
      location: `${locationPrefix}.roleTitle`,
    });
  }

  if ((company || roleTitle) && bullets.length === 0) {
    issues.push({
      code: "empty_role",
      severity: "blocking",
      message: "Contains a role entry with no bullet details.",
      location: locationPrefix,
    });
  }

  for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex++) {
    const bullet = bullets[bulletIndex];
    const location = `${locationPrefix}.bullets[${bulletIndex}]`;
    issues.push(...detectPlaceholderIssues(bullet, location));
    const trailing = detectTrailingFragmentIssue(bullet, location);
    if (trailing) issues.push(trailing);

    if (bullet.length > 0 && bullet.length < 10) {
      issues.push({
        code: "bullet_too_short",
        severity: "warning",
        message: "Contains a very short bullet that may not be useful.",
        location,
      });
    }
  }

  return issues;
}

export function validateResumeQuality(resumeModel: ResumeModel | null): ArtifactQualityResult {
  const issues: ArtifactQualityIssue[] = [];
  if (!resumeModel) {
    return { status: "needs_refinement", exportable: false, issues: [{ code: "missing_model", severity: "blocking", message: "Resume model missing." }] };
  }

  const summaryRaw = typeof resumeModel.summary === "string" ? resumeModel.summary : "";
  const summary = trimToText(summaryRaw);
  if (typeof resumeModel.summary === "string" && !summary) {
    issues.push({
      code: "empty_summary",
      severity: "blocking",
      message: "Professional summary is empty.",
      location: "summary",
    });
  }
  if (summary && summary.length < 40) {
    issues.push({
      code: "summary_too_thin",
      severity: "blocking",
      message: "Professional summary is too thin to use as-is.",
      location: "summary",
    });
  }
  issues.push(...detectPlaceholderIssues(summaryRaw, "summary"));
  const summaryTrailing = detectTrailingFragmentIssue(summaryRaw, "summary");
  if (summaryTrailing) issues.push(summaryTrailing);

  let usableBulletCount = 0;
  if (Array.isArray(resumeModel.experience)) {
    for (let index = 0; index < resumeModel.experience.length; index++) {
      const entry = resumeModel.experience[index];
      issues.push(...detectResumeExperienceIssues(entry, index));
      const bullets = Array.isArray(entry?.bullets)
        ? entry.bullets.map((b) => trimToText(b)).filter(Boolean)
        : [];
      usableBulletCount += bullets.filter((bullet) => bullet.length >= 20).length;
    }
  }

  if (usableBulletCount === 0) {
    issues.push({
      code: "missing_experience_bullets",
      severity: "blocking",
      message: "Resume has no usable experience bullets.",
      location: "experience",
    });
  }

  const blocking = issues.some((issue) => issue.severity === "blocking");
  return {
    status: blocking ? "needs_refinement" : "pass",
    exportable: !blocking,
    issues,
  };
}

function splitSentences(text: string): string[] {
  const normalized = trimToText(text);
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getCoverLetterOpening(paragraphs: string[]): string {
  const first = paragraphs.find((p) => trimToText(p)) ?? "";
  return trimToText(first);
}

function normalizeMatchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsTokenMatch(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeMatchToken(haystack);
  const normalizedNeedle = normalizeMatchToken(needle);
  if (!normalizedNeedle) return true;
  if (normalizedNeedle.length < 3) return true;
  return normalizedHaystack.includes(normalizedNeedle);
}

const COVER_GENERIC_FILLER_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "generic_filler_passionate", pattern: /\bpassionate about\b/i },
  { code: "generic_filler_fast_paced", pattern: /\bfast[-\s]?paced environment\b/i },
  { code: "generic_filler_team_player", pattern: /\bteam player\b/i },
  { code: "generic_filler_dynamic_team", pattern: /\bdynamic team\b/i },
  { code: "generic_filler_thank_you", pattern: /\bthank you for your time and consideration\b/i },
];

export function validateCoverLetterQuality(input: {
  paragraphs: string[];
  jobTitle: string | null;
  companyName: string | null;
  resumeExportable: boolean;
}): ArtifactQualityResult {
  const issues: ArtifactQualityIssue[] = [];
  const normalizedParagraphs = Array.isArray(input.paragraphs)
    ? input.paragraphs.map((p) => String(p ?? "")).filter(Boolean)
    : [];

  const fullText = normalizedParagraphs.map((p) => trimToText(p)).filter(Boolean).join("\n");
  if (!fullText) {
    return {
      status: "needs_refinement",
      exportable: false,
      issues: [{ code: "missing_content", severity: "blocking", message: "Cover letter content missing." }],
    };
  }

  if (!input.resumeExportable) {
    issues.push({
      code: "resume_source_unusable",
      severity: "blocking",
      message: "Resume source evidence is not usable; cover letter needs regeneration after fixing inputs.",
    });
  }

  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  if (wordCount < 80) {
    issues.push({
      code: "cover_letter_too_thin",
      severity: "blocking",
      message: "Cover letter draft is too thin to use as-is.",
    });
  }

  const jobTitle = input.jobTitle ? trimToText(input.jobTitle) : "";
  const companyName = input.companyName ? trimToText(input.companyName) : "";
  if (jobTitle && !containsTokenMatch(fullText, jobTitle)) {
    issues.push({
      code: "missing_role_reference",
      severity: "blocking",
      message: "Cover letter does not reference the target role.",
    });
  }
  if (companyName && !containsTokenMatch(fullText, companyName)) {
    issues.push({
      code: "missing_company_reference",
      severity: "blocking",
      message: "Cover letter does not reference the target company.",
    });
  }

  for (const entry of COVER_BANNED_PHRASES) {
    if (entry.pattern.test(fullText)) {
      issues.push({
        code: entry.code,
        severity: "blocking",
        message: "Contains a banned phrase.",
      });
    }
  }

  for (const filler of COVER_GENERIC_FILLER_PATTERNS) {
    if (filler.pattern.test(fullText)) {
      issues.push({
        code: filler.code,
        severity: "warning",
        message: "Contains generic filler phrasing.",
      });
    }
  }

  const opening = getCoverLetterOpening(normalizedParagraphs);
  const openingLower = opening.toLowerCase();
  if (openingLower.includes("the strongest fit comes from")) {
    issues.push({
      code: "generic_opening_strongest_fit",
      severity: "blocking",
      message: "Opening uses a generic template phrase.",
      location: "opening",
    });
  }
  if (openingLower.includes("my background aligns because")) {
    issues.push({
      code: "generic_opening_aligns_because",
      severity: "blocking",
      message: "Opening uses a mechanical template phrase.",
      location: "opening",
    });
  }

  for (let index = 0; index < normalizedParagraphs.length; index++) {
    const paragraph = normalizedParagraphs[index];
    issues.push(...detectPlaceholderIssues(paragraph, `paragraphs[${index}]`));
    const trailing = detectTrailingFragmentIssue(paragraph, `paragraphs[${index}]`);
    if (trailing) issues.push(trailing);
  }

  const sentenceStarts = new Map<string, number>();
  const sentences = splitSentences(fullText);
  for (const sentence of sentences) {
    const normalized = sentence.replace(/^[\"'([{]+/g, "").trim().toLowerCase();
    const start = normalized.split(/\s+/).slice(0, 2).join(" ");
    if (!start) continue;
    sentenceStarts.set(start, (sentenceStarts.get(start) ?? 0) + 1);
  }
  for (const [start, count] of sentenceStarts) {
    if (count >= 3 && (start === "i have" || start === "i also" || start === "this" || start === "that")) {
      issues.push({
        code: "repetitive_sentence_starts",
        severity: "blocking",
        message: "Contains repetitive weak phrasing.",
        location: "sentences",
      });
      break;
    }
  }

  const blocking = issues.some((issue) => issue.severity === "blocking");
  return {
    status: blocking ? "needs_refinement" : "pass",
    exportable: !blocking,
    issues,
  };
}

export type StudioArtifactQualityContract = {
  resume: ArtifactQualityResult;
  coverLetter: ArtifactQualityResult;
};

export function validateStudioArtifactQuality(input: {
  resumeModel: ResumeModel | null;
  coverLetterParagraphs: string[];
}): StudioArtifactQualityContract {
  return {
    resume: validateResumeQuality(input.resumeModel),
    coverLetter: validateCoverLetterQuality({
      paragraphs: input.coverLetterParagraphs,
      jobTitle: null,
      companyName: null,
      resumeExportable: Boolean(input.resumeModel),
    }),
  };
}
