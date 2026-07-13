import type { DocumentStrategyPlanLike } from "./document-strategy-plan.types";
import type {
  NormalizedResumeDocument,
  CanonicalCoverLetterDocument,
} from "./documents/normalized-document.models";
import type { CoverLetterGenerationResult } from "./cover-letters/generators/cover-letter-generator.interface";

export type LanguageStyleIssueType =
  | "generic_phrase"
  | "repetition_pattern"
  | "ai_cadence"
  | "overly_verbose"
  | "weak_opening"
  | "redundant_modifier";

export type LanguageStyleIssue = {
  type: LanguageStyleIssueType;
  severity: "high" | "medium" | "low";
  location: string;
};

export type LanguageStylePass = {
  issues: LanguageStyleIssue[];
  transformationsApplied: string[];
};

export type LanguageStylePassInput = {
  plan: DocumentStrategyPlanLike;
  roleLabel?: string | null;
  resumeSummary?: string | null;
  resumeBullets?: string[] | null;
  coverOpening?: string | null;
  coverParagraphs?: string[] | null;
};

const GENERIC_PHRASES = [
  "results-driven",
  "proven track record",
  "dynamic leader",
  "leveraged",
  "utilized",
  "responsible for",
  "driven by outcomes",
  "delivered results",
  "excited to apply",
  "passionate about",
];

const REWRITE_PHRASES: Array<[RegExp, string]> = [
  [/\bresults-driven\b/gi, ""],
  [/\bproven track record\b/gi, ""],
  [/\bdynamic leader\b/gi, "leader"],
  [/\bleveraged\b/gi, "used"],
  [/\butilized\b/gi, "used"],
  [/\bresponsible for\b/gi, ""],
  [/\bdriven by outcomes\b/gi, "focused on outcomes"],
  [/\bdelivered results\b/gi, "delivered measurable impact"],
  [/\bexcited to apply\b/gi, "applying for"],
  [/\bpassionate about\b/gi, "focused on"],
];

const REDUNDANT_MODIFIERS = [
  "very",
  "highly",
  "really",
  "extremely",
  "significantly",
  "substantially",
  "clearly",
  "practically",
  "strategically",
  "meaningfully",
  "purposefully",
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanPunctuation(value: string): string {
  return value
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?]){2,}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sentenceCase(value: string): string {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter(Boolean);
}

function stripGenericPhrases(text: string): string {
  let next = text;
  for (const [pattern, replacement] of REWRITE_PHRASES) {
    next = next.replace(pattern, replacement);
  }
  for (const modifier of REDUNDANT_MODIFIERS) {
    next = next.replace(new RegExp(`\\b${modifier}\\b\\s+`, "gi"), "");
  }
  return cleanPunctuation(next.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1"));
}

function joinThemes(values: string[]): string {
  const deduped = Array.from(new Set(values.map(normalizeText).filter(Boolean)));
  if (!deduped.length) return "";
  if (deduped.length === 1) return deduped[0];
  if (deduped.length === 2) return `${deduped[0]} and ${deduped[1]}`;
  return `${deduped[0]}, ${deduped[1]}, and ${deduped[2]}`;
}

function repeatedOpenings(sentences: string[]): boolean {
  const starts = new Map<string, number>();
  for (const sentence of sentences) {
    const opening = normalizeText(sentence).toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    if (!opening) continue;
    starts.set(opening, (starts.get(opening) ?? 0) + 1);
  }
  return Array.from(starts.values()).some((count) => count >= 2);
}

function countGenericMatches(text: string): number {
  const lowered = text.toLowerCase();
  return GENERIC_PHRASES.reduce((count, phrase) => (lowered.includes(phrase) ? count + 1 : count), 0);
}

function buildIssue(
  type: LanguageStyleIssueType,
  severity: LanguageStyleIssue["severity"],
  location: string,
): LanguageStyleIssue {
  return { type, severity, location };
}

function polishSummary(summary: string, input: LanguageStylePassInput, pass: LanguageStylePass): string {
  const sentences = splitSentences(summary);
  if (!sentences.length) return summary;

  const leadGeneric = countGenericMatches(sentences[0]) > 0;
  const weakLead = leadGeneric || /^\s*(i am|i'm|results-driven|proven track record|dynamic leader)\b/i.test(sentences[0]);

  if (weakLead) {
    pass.transformationsApplied.push("summary_opening_reframed");
    pass.issues.push(buildIssue("weak_opening", "high", "resume.summary"));
    const lead = input.plan.positioningFrame || input.roleLabel || "Experienced professional";
    const emphasis = joinThemes([
      ...(input.plan.resumeEmphasis ?? []).slice(0, 2),
      ...(input.plan.qualityPass?.topNarrativeAxes ?? []).slice(0, 1),
    ]);
    const opening = emphasis ? `${lead} focused on ${emphasis}.` : `${lead}.`;
    const tail = sentences
      .slice(1)
      .map((sentence) => stripGenericPhrases(sentence))
      .map(sentenceCase)
      .filter(Boolean);
    return [opening, ...tail].join(" ");
  }

  return sentences.map((sentence) => sentenceCase(stripGenericPhrases(sentence))).join(" ");
}

function polishBullets(bullets: string[], pass: LanguageStylePass): string[] {
  const seenOpenings = new Set<string>();
  return bullets.map((bullet, index) => {
    const original = normalizeText(bullet);
    const cleaned = stripGenericPhrases(original);
    const lowered = cleaned.toLowerCase();

    if (countGenericMatches(original) > 0) {
      pass.issues.push(buildIssue("generic_phrase", index === 0 ? "high" : "medium", `resume.experience[${index}]`));
      pass.transformationsApplied.push("removed_generic_language_from_bullets");
    }

    const opening = lowered.split(/\s+/).slice(0, 3).join(" ");
    if (opening && seenOpenings.has(opening)) {
      pass.issues.push(buildIssue("repetition_pattern", "medium", `resume.experience[${index}]`));
      pass.transformationsApplied.push("reduced_repeated_bullet_openings");
    }
    if (opening) {
      seenOpenings.add(opening);
    }

    if (cleaned.split(/\s+/).length > 28) {
      pass.issues.push(buildIssue("overly_verbose", "low", `resume.experience[${index}]`));
      pass.transformationsApplied.push("tightened_verbose_bullets");
    }

    return sentenceCase(cleaned);
  });
}

function polishCoverOpening(opening: string, input: LanguageStylePassInput, pass: LanguageStylePass): string {
  const cleaned = stripGenericPhrases(opening);
  const weakLead =
    countGenericMatches(opening) > 0 ||
    /^\s*(i am|i'm|i am excited|i'm excited|dear)\b/i.test(opening) ||
    cleaned.length < 50;

  if (!weakLead) {
    return sentenceCase(cleaned);
  }

  pass.issues.push(buildIssue("weak_opening", "high", "cover_letter.opening"));
  pass.transformationsApplied.push("tightened_cover_letter_opening");

  const roleLabel = input.roleLabel || input.plan.positioningFrame;
  const themes = joinThemes([
    ...(input.plan.coverLetterThemes ?? []).slice(0, 2),
    ...((input.plan.qualityPass?.coverLetterDelta ?? []) as string[]).slice(0, 1),
  ]);
  const lead = roleLabel ? `I am applying for ${roleLabel}.` : "I am applying for this role.";
  const second = themes ? `My background aligns most strongly with ${themes}.` : "";
  const sentences = splitSentences(cleaned).slice(1).map(sentenceCase).filter(Boolean);
  return [lead, second, ...sentences].filter(Boolean).join(" ");
}

function polishCoverParagraphs(paragraphs: string[], input: LanguageStylePassInput, pass: LanguageStylePass): string[] {
  if (!paragraphs.length) return paragraphs;
  const next = paragraphs.map((paragraph) => sentenceCase(stripGenericPhrases(paragraph)));
  next[0] = polishCoverOpening(next[0], input, pass);

  if (repeatedOpenings(next.flatMap(splitSentences))) {
    pass.issues.push(buildIssue("ai_cadence", "medium", "cover_letter.body"));
    pass.transformationsApplied.push("varied_sentence_cadence");
  }

  if (next.some((paragraph) => paragraph.split(/\s+/).length > 35)) {
    pass.issues.push(buildIssue("overly_verbose", "low", "cover_letter.body"));
    pass.transformationsApplied.push("tightened_cover_letter_prose");
  }

  return next;
}

export function buildLanguageStylePass(input: LanguageStylePassInput): LanguageStylePass {
  const pass: LanguageStylePass = {
    issues: [],
    transformationsApplied: [],
  };

  const resumeSummary = normalizeText(input.resumeSummary ?? "");
  if (
    resumeSummary &&
    (countGenericMatches(resumeSummary) > 0 ||
      /^\s*(i am|i'm|results-driven|proven track record|dynamic leader)\b/i.test(resumeSummary))
  ) {
    pass.issues.push(buildIssue("generic_phrase", "high", "resume.summary"));
  }

  const resumeBullets = (input.resumeBullets ?? []).map(normalizeText).filter(Boolean);
  if (resumeBullets.length && repeatedOpenings(resumeBullets.flatMap(splitSentences))) {
    pass.issues.push(buildIssue("repetition_pattern", "medium", "resume.experience"));
  }

  if (resumeBullets.some((bullet) => bullet.split(/\s+/).length > 28)) {
    pass.issues.push(buildIssue("overly_verbose", "low", "resume.experience"));
  }

  const coverOpening = normalizeText(input.coverOpening ?? "");
  if (
    coverOpening &&
    (countGenericMatches(coverOpening) > 0 ||
      /^\s*(i am|i'm|i am excited|i'm excited|dear)\b/i.test(coverOpening))
  ) {
    pass.issues.push(buildIssue("weak_opening", "high", "cover_letter.opening"));
  }

  const coverParagraphs = (input.coverParagraphs ?? []).map(normalizeText).filter(Boolean);
  if (coverParagraphs.length && repeatedOpenings(coverParagraphs.flatMap(splitSentences))) {
    pass.issues.push(buildIssue("ai_cadence", "medium", "cover_letter.body"));
  }

  if (
    [...resumeBullets, coverOpening, ...coverParagraphs].some((text) =>
      REDUNDANT_MODIFIERS.some((modifier) => new RegExp(`\\b${modifier}\\b`, "i").test(text)),
    )
  ) {
    pass.issues.push(buildIssue("redundant_modifier", "low", "language"));
  }

  return pass;
}

export function polishNormalizedResumeDocument(
  document: NormalizedResumeDocument,
  input: LanguageStylePassInput,
): { document: NormalizedResumeDocument; pass: LanguageStylePass } {
  const pass = buildLanguageStylePass({
    ...input,
    resumeSummary: document.summary ?? "",
    resumeBullets: document.experience.flatMap((entry) => entry.bullets ?? []),
  });

  const summary = document.summary ? polishSummary(document.summary, input, pass) : document.summary;
  const experience = document.experience.map((entry) => ({
    ...entry,
    bullets: polishBullets(entry.bullets ?? [], pass),
  }));

  return {
    pass,
    document: {
      ...document,
      ...(summary ? { summary } : {}),
      experience,
    },
  };
}

export function polishCoverLetterGeneration(
  generation: CoverLetterGenerationResult,
  input: LanguageStylePassInput,
): { generation: CoverLetterGenerationResult; pass: LanguageStylePass } {
  const pass = buildLanguageStylePass({
    ...input,
    coverOpening: generation.document?.opening ?? "",
    coverParagraphs: [
      generation.document?.opening ?? "",
      ...(generation.document?.bodyParagraphs ?? []),
      generation.document?.closingParagraph ?? "",
    ],
  });

  const document: CanonicalCoverLetterDocument = generation.document
    ? {
        ...generation.document,
        opening: polishCoverOpening(generation.document.opening, input, pass),
        bodyParagraphs: polishCoverParagraphs(generation.document.bodyParagraphs ?? [], input, pass),
        closingParagraph: sentenceCase(stripGenericPhrases(generation.document.closingParagraph)),
      }
    : generation.document;

  const content = document
    ? [
        document.salutation,
        document.opening,
        ...document.bodyParagraphs,
        document.closingParagraph,
        document.signoff,
        document.signatureName,
      ]
        .map((line) => normalizeText(line ?? ""))
        .filter(Boolean)
        .join("\n\n")
        .trim()
    : generation.content;

  return {
    pass,
    generation: {
      ...generation,
      document,
      content,
      paragraphs: document
        ? [document.opening, ...document.bodyParagraphs, document.closingParagraph]
        : generation.paragraphs,
    },
  };
}
