"use client";

import { useMemo, useState } from "react";

type ResumeDraftBulletSource = {
  baselineSectionId?: string;
  baselineSectionType?: string;
  baselineSectionOrder?: number;
  bulletIndex?: number;
};

type ResumeDraftBullet = {
  id?: string;
  text?: string;
  confidence?: "High" | "Medium" | "Low";
  source?: ResumeDraftBulletSource;
};

type ResumeSection = {
  id?: string;
  type?: string;
  title?: string;
  content?: string;
  bullets?: ResumeDraftBullet[];
};

type ResumePreviewSection = {
  id: string;
  heading: "Summary" | "Core Competencies" | "Professional Experience" | "Education";
  bullets: Array<{
    id: string;
    text: string;
    confidence?: string;
    source?: ResumeDraftBulletSource;
  }>;
};

const SECTION_ORDER: Array<ResumePreviewSection["heading"]> = [
  "Summary",
  "Core Competencies",
  "Professional Experience",
  "Education",
];

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeHeading(type?: string, title?: string): ResumePreviewSection["heading"] | null {
  const normalizedType = (type ?? "").toUpperCase().trim();
  if (normalizedType === "SUMMARY") return "Summary";
  if (normalizedType === "SKILLS") return "Core Competencies";
  if (normalizedType === "EXPERIENCE") return "Professional Experience";
  if (normalizedType === "EDUCATION") return "Education";

  const normalizedTitle = (title ?? "").toLowerCase().trim();
  if (normalizedTitle.includes("summary")) return "Summary";
  if (normalizedTitle.includes("skill") || normalizedTitle.includes("competenc")) {
    return "Core Competencies";
  }
  if (normalizedTitle.includes("experience")) return "Professional Experience";
  if (normalizedTitle.includes("education")) return "Education";
  return null;
}

function extractBulletsFromContent(content?: string): string[] {
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:[-*•●◦▪▹►‣]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length > 0);
}

function extractResumeSections(payload: unknown): ResumeSection[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.sections)) return [];

  const sections: ResumeSection[] = [];
  for (const section of record.sections) {
    if (!section || typeof section !== "object") continue;
    const entry = section as Record<string, unknown>;
    const id = trimText(entry.id);
    const type = trimText(entry.type);
    const title = trimText(entry.title);
    const content = trimText(entry.content);
    const bullets = Array.isArray(entry.bullets)
      ? entry.bullets
          .filter((item) => item && typeof item === "object")
          .map((item) => item as ResumeDraftBullet)
      : [];

    if (!id && !type && !title && !content && !bullets.length) continue;
    sections.push({ id, type, title, content, bullets });
  }

  return sections;
}

function buildPreviewSections(payload: unknown): ResumePreviewSection[] {
  const sections = extractResumeSections(payload);
  const grouped = new Map<ResumePreviewSection["heading"], ResumePreviewSection>();

  for (const section of sections) {
    const heading = normalizeHeading(section.type, section.title);
    if (!heading) continue;
    const existing =
      grouped.get(heading) ??
      {
        id: heading.toLowerCase().replace(/\s+/g, "-"),
        heading,
        bullets: [],
      };

    const explicitBullets = (section.bullets ?? [])
      .map((bullet, index) => {
        const text = trimText(bullet.text);
        if (!text) return null;
        const bulletId = trimText(bullet.id) ?? `${existing.id}-${section.id ?? "section"}-${index}`;
        return {
          id: bulletId,
          text,
          confidence: trimText(bullet.confidence),
          source: bullet.source,
        };
      })
      .filter((bullet): bullet is NonNullable<typeof bullet> => Boolean(bullet));

    if (explicitBullets.length) {
      existing.bullets.push(...explicitBullets);
    } else {
      const fallback = extractBulletsFromContent(section.content);
      fallback.forEach((text, index) => {
        existing.bullets.push({
          id: `${existing.id}-${section.id ?? "section"}-fallback-${index}`,
          text,
          confidence: undefined,
          source: undefined,
        });
      });
    }

    grouped.set(heading, existing);
  }

  return SECTION_ORDER
    .map((heading) => grouped.get(heading))
    .filter((section): section is ResumePreviewSection => section !== undefined)
    .filter((section) => section.bullets.length > 0);
}

type Props = {
  payload: unknown;
  fallbackText?: string;
};

export function ResumePreview({ payload, fallbackText }: Props) {
  const sections = useMemo(() => buildPreviewSections(payload), [payload]);
  const [showEvidenceByDefault, setShowEvidenceByDefault] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());

  if (!sections.length) {
    if (!fallbackText) return null;
    return (
      <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
        {fallbackText}
      </pre>
    );
  }

  return (
    <div className="space-y-5" data-testid="resume-preview">
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border border-white/20 bg-slate-900/30"
          checked={showEvidenceByDefault}
          onChange={(event) => setShowEvidenceByDefault(event.target.checked)}
        />
        Show evidence by default
      </label>

      {sections.map((section) => (
        <article key={section.id} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
            {section.heading}
          </h3>
          <ul className="space-y-2 pl-4 text-sm leading-relaxed text-slate-200">
            {section.bullets.map((bullet) => {
              const isExpanded = showEvidenceByDefault || expandedEvidence.has(bullet.id);
              return (
                <li key={bullet.id} className="space-y-2">
                  <p>{bullet.text}</p>
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-300 underline underline-offset-2"
                    onClick={() =>
                      setExpandedEvidence((current) => {
                        const next = new Set(current);
                        if (next.has(bullet.id)) next.delete(bullet.id);
                        else next.add(bullet.id);
                        return next;
                      })
                    }
                  >
                    {isExpanded ? "Hide evidence" : "Show evidence"}
                  </button>
                  {isExpanded ? (
                    <div className="rounded-lg border border-white/10 bg-slate-900/30 px-2 py-1 text-xs text-slate-300">
                      <p>Baseline section type: {bullet.source?.baselineSectionType ?? "Unknown"}</p>
                      <p>Baseline section id: {bullet.source?.baselineSectionId ?? "Unknown"}</p>
                      <p>
                        Bullet index:{" "}
                        {typeof bullet.source?.bulletIndex === "number"
                          ? bullet.source.bulletIndex
                          : "Unknown"}
                      </p>
                      <p>Confidence: {bullet.confidence ?? "Unknown"}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}
