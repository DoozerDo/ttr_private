import { buildCoverLetterParagraphs } from "@/src/lib/studio/helpers";
import { estimateResumeModelBodyLength, readResumeModel } from "@/lib/resumePreviewContract";
import { truncateForPreview } from "@/lib/previewTruncation";

type ResumeRoleTeaser = {
  company: string;
  roleTitle: string;
  location: string | null;
  dateRange: string | null;
  bullets: string[];
};

export type ResultsResumeTeaser =
  | {
      renderer: "role_teaser";
      role: ResumeRoleTeaser;
      summarySnippet: string | null;
      previewLength: number;
      totalBodyLength: number;
      truncated: true;
      reason: "results_teaser_contract";
    }
  | {
      renderer: "text_teaser";
      excerpt: string;
      previewLength: number;
      totalBodyLength: number;
      truncated: true;
      reason: "results_teaser_contract";
    }
  | {
      renderer: "none";
      excerpt: null;
      role: null;
      summarySnippet: null;
      previewLength: 0;
      totalBodyLength: 0;
      truncated: false;
      reason: "unavailable";
    };

export type ResultsCoverLetterTeaser =
  | {
      renderer: "paragraph_teaser";
      paragraph: string;
      previewLength: number;
      totalBodyLength: number;
      truncated: true;
      reason: "results_teaser_contract";
    }
  | {
      renderer: "text_teaser";
      paragraph: string;
      previewLength: number;
      totalBodyLength: number;
      truncated: true;
      reason: "results_teaser_contract";
    }
  | {
      renderer: "none";
      paragraph: null;
      previewLength: 0;
      totalBodyLength: 0;
      truncated: false;
      reason: "unavailable";
    };

function trimToString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clipInline(value: string, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function readLooseTextFallback(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.previewText,
    record.preview_text,
    record.text,
    record.rawText,
    record.raw_text,
    record.content,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function readFirstParagraphFromLooseText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const blocks = trimmed.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return null;
  return blocks[0] ?? null;
}

function readFirstUsableResumeRole(payload: unknown): { role: ResumeRoleTeaser; summarySnippet: string | null } | null {
  const model = readResumeModel(payload);
  if (!model) return null;

  const summarySnippet = trimToString(model.summary)
    ? clipInline(trimToString(model.summary), 220)
    : null;

  const experiences = Array.isArray(model.experience) ? model.experience : [];
  const first = experiences.find((entry) => {
    const company = trimToString(entry.company);
    const roleTitle = trimToString(entry.roleTitle);
    const bullets = Array.isArray(entry.bullets)
      ? entry.bullets.map((b) => trimToString(b)).filter(Boolean)
      : [];
    return company.length > 0 && roleTitle.length > 0 && bullets.length > 0;
  });

  if (!first) return null;

  const bullets = Array.isArray(first.bullets)
    ? first.bullets.map((b) => trimToString(b)).filter(Boolean)
    : [];

  const teaser: ResumeRoleTeaser = {
    company: clipInline(trimToString(first.company), 80),
    roleTitle: clipInline(trimToString(first.roleTitle), 80),
    location: trimToString(first.location) ? clipInline(trimToString(first.location), 48) : null,
    dateRange: trimToString(first.dateRange) ? clipInline(trimToString(first.dateRange), 48) : null,
    bullets: bullets.slice(0, 3).map((b) => clipInline(b, 240)),
  };

  return { role: teaser, summarySnippet };
}

export function getResultsResumeTeaser(payload: unknown): ResultsResumeTeaser {
  const role = readFirstUsableResumeRole(payload);
  if (role) {
    const totalBodyLength = estimateResumeModelBodyLength(readResumeModel(payload));
    const previewLength =
      (role.summarySnippet?.length ?? 0) +
      role.role.company.length +
      role.role.roleTitle.length +
      role.role.bullets.join("\n").length;
    return {
      renderer: "role_teaser",
      role: role.role,
      summarySnippet: role.summarySnippet,
      previewLength,
      totalBodyLength,
      truncated: true,
      reason: "results_teaser_contract",
    };
  }

  const fallback = readLooseTextFallback(payload);
  if (!fallback) {
    return {
      renderer: "none",
      excerpt: null,
      role: null,
      summarySnippet: null,
      previewLength: 0,
      totalBodyLength: 0,
      truncated: false,
      reason: "unavailable",
    };
  }

  const preview = truncateForPreview(fallback, { maxChars: 380, maxLines: 6 });
  return {
    renderer: "text_teaser",
    excerpt: preview.text,
    previewLength: preview.previewLength,
    totalBodyLength: preview.totalLength,
    truncated: true,
    reason: "results_teaser_contract",
  };
}

export function getResultsCoverLetterTeaser(payload: unknown): ResultsCoverLetterTeaser {
  const paragraphs = buildCoverLetterParagraphs(payload);
  if (paragraphs.length) {
    const bodyFirst =
      paragraphs.find((p) => {
        const trimmed = p.trim();
        if (!trimmed) return false;
        if (/^dear hiring team[,]?$/i.test(trimmed)) return false;
        if (/^sincerely[,]?$/i.test(trimmed)) return false;
        return true;
      }) ?? paragraphs[0] ?? "";
    const clipped = clipInline(bodyFirst, 600);
    const totalBodyLength = paragraphs.join("\n\n").length;
    return {
      renderer: "paragraph_teaser",
      paragraph: clipped,
      previewLength: clipped.length,
      totalBodyLength,
      truncated: true,
      reason: "results_teaser_contract",
    };
  }

  const fallback = readLooseTextFallback(payload);
  if (!fallback) {
    return {
      renderer: "none",
      paragraph: null,
      previewLength: 0,
      totalBodyLength: 0,
      truncated: false,
      reason: "unavailable",
    };
  }

  const maybeFirst = readFirstParagraphFromLooseText(fallback) ?? "";
  const preview = truncateForPreview(maybeFirst, { maxChars: 600, maxLines: 12 });
  return {
    renderer: "text_teaser",
    paragraph: preview.text,
    previewLength: preview.previewLength,
    totalBodyLength: fallback.length,
    truncated: true,
    reason: "results_teaser_contract",
  };
}
