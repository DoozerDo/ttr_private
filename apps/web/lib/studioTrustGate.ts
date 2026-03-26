import { buildCoverLetterParagraphs, trimToString } from "@/src/lib/studio/helpers";

type TrustGateParams = {
  score: number | null;
  baselineId: string;
  baselineVersionId: string;
  allowMissingBaselineVersion?: boolean;
  evidenceUnits: string[];
  hasActiveComplianceViolations: boolean;
  hasMissingBaselineEvidenceIssue?: boolean | null;
};

export type TrustGateDecision = {
  allowed: boolean;
  reason: string | null;
  baselineStatusLabel: "verified" | "incomplete";
  roleAlignmentLabel: "strong match" | "competitive" | "needs improvement";
};

export type OutputValidationResult = {
  valid: boolean;
  reasons: string[];
};

type GenerationDocumentType = "resume" | "cover_letter";

type ResumeModel = {
  summary?: string;
  competencies?: string[];
  coreCompetencies?: string[];
  experience?: Array<{
    company?: string;
    roleTitle?: string;
    bullets?: string[];
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    location?: string;
  }>;
};

const JD_ECHO_BLOCK_RATIO = 0.65;
const INFLATED_SCOPE_PATTERN =
  /\b(global(?:ly)?|worldwide|end[\s-]?to[\s-]?end|enterprise[\s-]?wide|org[\s-]?wide|all teams|entire company)\b/i;
const INVENTED_ENTITY_PATTERN =
  /\b(confidential company|stealth startup|fortune\s*\d{2,3}|unnamed company|undisclosed company)\b/i;
const ROLE_FRAGMENT_SPLIT = /\s*[|/]\s*/;
const JD_REUSE_SNIPPET_LENGTH = 28;

const MIN_EVIDENCE_UNITS = 2;
const BULLET_ARTIFACT_PATTERN = /^(?:[•*\-]\s+|\d{1,2}[.)]\s+)/m;

function parseResumeModel(payload: unknown): ResumeModel | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const preview = record.preview as Record<string, unknown> | undefined;
  if (!preview || typeof preview !== "object") return null;
  const resume = preview.resume;
  if (!resume || typeof resume !== "object") return null;
  return resume as ResumeModel;
}

function normalizeEducationKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9| ]+/g, "")
    .trim();
}

function computeWordCount(text: string): number {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
}

function computeTokenOverlapRatio(source: string, target: string): number {
  const sourceTokens = new Set(
    source
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
  const targetTokens = new Set(
    target
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
  if (!sourceTokens.size || !targetTokens.size) return 0;
  let overlap = 0;
  sourceTokens.forEach((token) => {
    if (targetTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(sourceTokens.size, 1);
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRoleHeader(value: string): string {
  const trimmed = normalizeLine(value);
  if (!trimmed) return "";
  return trimmed.split(ROLE_FRAGMENT_SPLIT)[0]?.trim() ?? trimmed;
}

function normalizeBulletLine(value: string): string {
  return normalizeLine(value.replace(/^[â€¢*\-\d.)\s]+/, ""));
}

function shouldDropBulletFragment(value: string): boolean {
  if (!value) return true;
  if (value.length < 18) return true;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length < 4;
}

function normalizeEditedResumeModel(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const experience = Array.isArray(source.experience) ? source.experience : [];
  const normalizedExperience = experience
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const typed = entry as Record<string, unknown>;
      const company = normalizeRoleHeader(trimToString(typed.company));
      const roleTitle = normalizeRoleHeader(trimToString(typed.roleTitle));
      const bulletsRaw = Array.isArray(typed.bullets) ? typed.bullets : [];
      const bullets = Array.from(
        new Set(
          bulletsRaw
            .map((bullet) => normalizeBulletLine(trimToString(bullet)))
            .filter((bullet) => !shouldDropBulletFragment(bullet)),
        ),
      ).slice(0, 8);
      if (!company || !roleTitle || bullets.length === 0) {
        return null;
      }
      return {
        ...typed,
        company,
        roleTitle,
        bullets,
      };
    })
    .filter(Boolean);

  return {
    ...source,
    experience: normalizedExperience,
  };
}

export function normalizeGenerationPayload(
  payload: Record<string, unknown>,
  documentType: GenerationDocumentType,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...payload,
    documentType,
    evidenceSourcePolicy: "verified_baseline_and_accepted_interview_additions_only",
    strictEvidenceOnly: true,
    preventCrossRoleBleed: true,
  };

  if (documentType === "resume" && payload.editedResume !== undefined) {
    normalized.editedResume = normalizeEditedResumeModel(payload.editedResume);
  }

  return normalized;
}

export function evaluateStudioTrustGate(params: TrustGateParams): TrustGateDecision {
  const hasBaseline = Boolean(
    params.baselineId && (params.baselineVersionId || params.allowMissingBaselineVersion),
  );
  const hasEvidence =
    params.hasMissingBaselineEvidenceIssue === true
      ? false
      : params.hasMissingBaselineEvidenceIssue === false
        ? true
        : params.evidenceUnits.length >= MIN_EVIDENCE_UNITS;

  const baselineStatusLabel: TrustGateDecision["baselineStatusLabel"] =
    hasBaseline && hasEvidence ? "verified" : "incomplete";

  const roleAlignmentLabel: TrustGateDecision["roleAlignmentLabel"] =
    params.score !== null && params.score > 80
      ? "strong match"
      : params.score !== null && params.score >= 70
        ? "competitive"
        : "needs improvement";

  if (params.score === null || params.score < 70) {
    return {
      allowed: false,
      reason: "You need to improve your fit before generating materials.",
      baselineStatusLabel,
      roleAlignmentLabel,
    };
  }

  if (!hasBaseline || !hasEvidence) {
    return {
      allowed: false,
      reason: "Your baseline is incomplete. Add more experience before generating.",
      baselineStatusLabel,
      roleAlignmentLabel,
    };
  }

  if (params.hasActiveComplianceViolations) {
    return {
      allowed: false,
      reason:
        "Generation is blocked until compliance violations are resolved (invented role, company, or metrics).",
      baselineStatusLabel,
      roleAlignmentLabel,
    };
  }

  return {
    allowed: true,
    reason: null,
    baselineStatusLabel,
    roleAlignmentLabel,
  };
}

export function validateResumeOutput(generation: unknown): OutputValidationResult {
  const model = parseResumeModel(generation);
  if (!model) {
    return { valid: false, reasons: ["Resume preview data is missing."] };
  }

  const reasons: string[] = [];
  const experiences = Array.isArray(model.experience) ? model.experience : [];
  const education = Array.isArray(model.education) ? model.education : [];
  const competencies = Array.isArray(model.competencies)
    ? model.competencies
    : Array.isArray(model.coreCompetencies)
      ? model.coreCompetencies
      : [];

  if (!experiences.length) {
    reasons.push("Resume must include at least one experience section.");
  }

  experiences.forEach((entry, index) => {
    const company = trimToString(entry.company);
    const role = trimToString(entry.roleTitle);
    const bullets = Array.isArray(entry.bullets)
      ? entry.bullets.map((item) => trimToString(item)).filter(Boolean)
      : [];
    if (!company || !role || bullets.length === 0) {
      reasons.push(`Experience entry ${index + 1} is incomplete or missing bullets.`);
    }
    if ((company.match(/[|/]/g)?.length ?? 0) > 1 || (role.match(/[|/]/g)?.length ?? 0) > 1) {
      reasons.push("Role header appears merged across multiple entries.");
    }
    if (INVENTED_ENTITY_PATTERN.test(company)) {
      reasons.push(`Experience entry ${index + 1} includes an invented company placeholder.`);
    }
    if (INVENTED_ENTITY_PATTERN.test(role)) {
      reasons.push(`Experience entry ${index + 1} includes an invented role placeholder.`);
    }
    bullets.forEach((bullet) => {
      if (INFLATED_SCOPE_PATTERN.test(bullet)) {
        reasons.push(`Experience entry ${index + 1} appears to inflate scope.`);
      }
      if (bullet.includes("\n")) {
        reasons.push(`Experience entry ${index + 1} includes merged paragraph bullets.`);
      }
    });
  });

  const educationKeys = new Set<string>();
  for (const entry of education) {
    const key = normalizeEducationKey(
      [trimToString(entry.degree), trimToString(entry.institution), trimToString(entry.location)].join("|"),
    );
    if (!key || key === "||") continue;
    if (educationKeys.has(key)) {
      reasons.push("Duplicate education entries detected.");
      break;
    }
    educationKeys.add(key);
  }

  const hasEmptySections =
    !trimToString(model.summary) &&
    competencies.length === 0 &&
    experiences.length === 0 &&
    education.length === 0;
  if (hasEmptySections) {
    reasons.push("Resume contains empty sections.");
  }

  return { valid: reasons.length === 0, reasons };
}

export function validateCoverLetterOutput(
  generation: unknown,
  jobDescriptionText: string,
): OutputValidationResult {
  const paragraphs = buildCoverLetterParagraphs(generation);
  const reasons: string[] = [];

  if (!paragraphs.length) {
    reasons.push("Cover letter paragraphs are missing.");
    return { valid: false, reasons };
  }

  const fullText = paragraphs.join("\n\n");
  const wordCount = computeWordCount(fullText);
  if (wordCount < 250 || wordCount > 400) {
    reasons.push("Cover letter word count must be between 250 and 400 words.");
  }

  const greetingCount = paragraphs.filter((p) => /^dear\b/i.test(trimToString(p))).length;
  if (greetingCount > 1) {
    reasons.push("Duplicate greeting detected.");
  }

  const closingCount = paragraphs.filter((p) => /\b(sincerely|best regards|regards)\b/i.test(trimToString(p))).length;
  if (closingCount > 1) {
    reasons.push("Duplicate closing detected.");
  }

  if (BULLET_ARTIFACT_PATTERN.test(fullText)) {
    reasons.push("Bullet formatting artifacts detected in cover letter.");
  }

  if (paragraphs.length < 4) {
    reasons.push("Cover letter should contain properly structured paragraphs.");
  }

  const overlapRatio = computeTokenOverlapRatio(fullText, jobDescriptionText);
  if (overlapRatio > JD_ECHO_BLOCK_RATIO) {
    reasons.push("Cover letter appears to echo the job description verbatim.");
  }
  const normalizedJd = normalizeLine(jobDescriptionText);
  const normalizedLetter = normalizeLine(fullText).toLowerCase();
  if (
    normalizedJd.length >= JD_REUSE_SNIPPET_LENGTH &&
    normalizedLetter.includes(normalizedJd.slice(0, JD_REUSE_SNIPPET_LENGTH).toLowerCase())
  ) {
    reasons.push("Cover letter reuses job description sentence fragments.");
  }
  if (INVENTED_ENTITY_PATTERN.test(fullText)) {
    reasons.push("Cover letter includes invented company or role placeholders.");
  }
  if (INFLATED_SCOPE_PATTERN.test(fullText)) {
    reasons.push("Cover letter appears to inflate scope beyond verified evidence.");
  }

  return { valid: reasons.length === 0, reasons };
}

export async function generateWithRetry<T>(params: {
  generate: (strictMode: boolean) => Promise<T>;
  validate: (output: T) => OutputValidationResult;
}): Promise<{ success: true; output: T; attempts: number } | { success: false; attempts: number; reasons: string[] }> {
  let reasons: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const output = await params.generate(attempt === 1);
    const validation = params.validate(output);
    if (validation.valid) {
      return { success: true, output, attempts: attempt + 1 };
    }
    reasons = validation.reasons;
  }
  return { success: false, attempts: 2, reasons };
}

export function hasBlockingComplianceViolations(
  warnings: Array<{ code?: string; severity?: string }>,
): boolean {
  return warnings.some((warning) => {
    const code = trimToString(warning.code).toLowerCase();
    const severity = trimToString(warning.severity).toLowerCase();
    if (severity === "block") {
      return (
        code.includes("invented_role") ||
        code.includes("invented_company") ||
        code.includes("invented_metric") ||
        code.includes("scope_inflation") ||
        code.includes("jd_echo")
      );
    }
    return (
      code.includes("invented_role") ||
      code.includes("invented_company") ||
      code.includes("invented_metric") ||
      code.includes("scope_inflation") ||
      code.includes("jd_echo")
    );
  });
}
