"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ResumeEducation,
  ResumeExperience,
  ResumeModel,
} from "@/lib/resumeModel";
import { truncateForPreview } from "@/lib/previewTruncation";
import {
  estimateResumeModelBodyLength,
  readResumeModel,
  RESULTS_RESUME_PREVIEW_LIMITS,
  sliceResumeModelForPreview,
  type ResumePreviewLimits,
} from "@/lib/resumePreviewContract";
 

export {
  estimateResumeModelBodyLength,
  readResumeModel,
  RESULTS_RESUME_PREVIEW_LIMITS,
  sliceResumeModelForPreview,
  type ResumePreviewLimits,
} from "@/lib/resumePreviewContract";

type Props = {
  payload?: unknown;
  model?: ResumeModel | null;
  fallbackText?: string;
  claimHighlights?: Array<{
    id: string;
    text: string;
    baselineItem: string;
    verificationStatus: "VERIFIED" | "INFERRED" | "UNVERIFIED";
  }>;
  isEditing?: boolean;
  hasUnsavedChanges?: boolean;
  onEnterEditMode?: () => void;
  onSaveEdits?: () => void;
  onCancelEdits?: () => void;
  onSummaryChange?: (value: string) => void;
  onBulletChange?: (experienceIndex: number, bulletIndex: number, value: string) => void;
};

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isNoiseCompetency(value: string): boolean {
  const normalized = toText(value).toLowerCase();
  if (!normalized) return true;
  if (/^(?:summary|skills|competencies|experience|education)$/i.test(normalized)) return true;
  if (/^[|,;:\-\s]+$/.test(normalized)) return true;
  return normalized.length < 3;
}

function matchesHighlightedClaim(text: string, highlights: Props["claimHighlights"]): boolean {
  if (!highlights?.length) return false;
  const normalized = text.toLowerCase();
  return highlights.some((claim) => {
    const claimText = claim.text.toLowerCase();
    return claimText.length > 0 && (normalized === claimText || normalized.includes(claimText));
  });
}

function readDateRange(entry: ResumeExperience): string {
  if (toText(entry.dateRange)) return toText(entry.dateRange);
  const start = toText(entry.startDate);
  const end = toText(entry.endDate);
  if (start && end) return `${start} - ${end}`;
  return start || end;
}

function normalizePipeTokens(value: unknown): string[] {
  return toText(value)
    .split(/[|Â¦ï½œ]/)
    .map((token) => token.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((token, index, list) => {
      const key = canonicalizeEducationToken(token);
      if (!key) return false;
      return list.findIndex((item) => canonicalizeEducationToken(item) === key) === index;
    });
}

function canonicalizeEducationToken(token: string): string {
  return token
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:|./()[\]{}'"`-]+|[\s,;:|./()[\]{}'"`-]+$/g, "")
    .trim()
    .toLowerCase();
}

function normalizeEducationEntry(entry: ResumeEducation): ResumeEducation {
  const degreeTokens = normalizePipeTokens(entry.degree);
  const degreeSet = new Set(degreeTokens.map((token) => canonicalizeEducationToken(token)));

  const institutionTokens = normalizePipeTokens(entry.institution).filter((token) => {
    const key = canonicalizeEducationToken(token);
    return key.length > 0 && !degreeSet.has(key);
  });
  const institutionSet = new Set(
    institutionTokens.map((token) => canonicalizeEducationToken(token)),
  );

  const locationTokens = normalizePipeTokens(entry.location).filter((token) => {
    const key = canonicalizeEducationToken(token);
    return key.length > 0 && !degreeSet.has(key) && !institutionSet.has(key);
  });

  return {
    degree: degreeTokens.join(" | "),
    institution: institutionTokens.join(" | "),
    location: locationTokens.join(" | "),
  };
}

function dedupeEducationEntries(entries: ResumeEducation[]): ResumeEducation[] {
  const seen = new Set<string>();
  const deduped: ResumeEducation[] = [];
  for (const entry of entries) {
    const normalized = normalizeEducationEntry(entry);
    const key = [normalized.degree, normalized.institution, normalized.location]
      .map((value) => toText(value).toLowerCase())
      .join("|");
    if (!key || key === "||" || seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

export function ResumePreview({
  payload,
  model: modelOverride,
  fallbackText,
  claimHighlights,
  isEditing = false,
  hasUnsavedChanges = false,
  onEnterEditMode,
  onSaveEdits,
  onCancelEdits,
  onSummaryChange,
  onBulletChange,
}: Props) {
  const model = useMemo(() => modelOverride ?? readResumeModel(payload), [modelOverride, payload]);
  const [expandedExperienceIndex, setExpandedExperienceIndex] = useState<number | null>(null);
  const [showFullResume, setShowFullResume] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const summary = model ? toText(model.summary) : "";
  const competenciesSource = model
    ? Array.isArray(model.competencies)
      ? model.competencies
      : model.coreCompetencies
    : null;
  const competencies = Array.isArray(competenciesSource)
    ? competenciesSource.map((value) => toText(value)).filter(Boolean).filter((value) => !isNoiseCompetency(value))
    : [];
  const experiences = model && Array.isArray(model.experience)
    ? model.experience
        .map((entry) => ({
          company: toText(entry.company),
          roleTitle: toText(entry.roleTitle),
          location: toText(entry.location),
          dateRange: readDateRange(entry),
          bullets: Array.isArray(entry.bullets)
            ? entry.bullets.map((value) => toText(value)).filter(Boolean)
            : [],
        }))
        // Allow missing/cleared role titles in correction mode; never require a role title to render
        // the entry as long as we have a safe company label + bullets.
        .filter((entry) => entry.company && entry.bullets.length > 0)
    : [];
  const education = model && Array.isArray(model.education)
    ? dedupeEducationEntries(
        model.education
          .map((entry) => ({
            degree: toText(entry.degree),
            institution: toText(entry.institution),
            location: toText(entry.location),
          }))
          .filter((entry) => entry.degree || entry.institution || entry.location),
      )
    : [];

  const headerActionVerbs = useMemo(
    () =>
      new Set(
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
        ],
      ),
    [],
  );

  const sanitizeHeaderField = useCallback(
    (value: string): string => {
      const text = toText(value).replace(/\s+/g, " ").trim();
      if (!text) return "";

      const words = text.split(/\s+/).filter(Boolean);
      if (words.length > 10) return "";

      const firstWord = (words[0] ?? "").toLowerCase();
      if (firstWord && headerActionVerbs.has(firstWord)) return "";

      // Sentence-like punctuation patterns indicate prose, not headers.
      if (/[.!?]/.test(text)) return "";
      if (/[,:;]\s/.test(text) && words.length > 6) return "";

      return text;
    },
    [headerActionVerbs],
  );

  const deriveHeader = useCallback(
    (entry: { company: string; roleTitle: string }) => {
      const company = sanitizeHeaderField(entry.company);
      const roleTitle = sanitizeHeaderField(entry.roleTitle);

      if (company && roleTitle) {
        return { company, roleTitle, placeholder: false };
      }
      if (company) {
        return { company, roleTitle: "", placeholder: false };
      }
      if (roleTitle) {
        return { company: "", roleTitle, placeholder: false };
      }
      return {
        company: "Experience entry needs correction",
        roleTitle: "",
        placeholder: true,
      };
    },
    [sanitizeHeaderField],
  );

  useEffect(() => {
    if (!isEditing) return;
    setShowFullResume(true);
    setSummaryExpanded(true);
  }, [isEditing]);

  const hasHiddenContent = useMemo(() => {
    if (isEditing) return false;
    return experiences.length > 2 || competencies.length > 0 || education.length > 0;
  }, [competencies.length, education.length, experiences.length, isEditing]);

  const visibleExperiences = useMemo(() => {
    const withIndex = experiences.map((entry, index) => ({ entry, index }));
    if (isEditing || showFullResume) return withIndex;
    return withIndex.slice(0, 2);
  }, [experiences, isEditing, showFullResume]);

  if (!model) {
    if (!fallbackText) return null;
    const preview = truncateForPreview(fallbackText, { maxChars: 4000, maxLines: 120 });
    return (
      <div className="space-y-2">
        <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm leading-7 text-slate-200">
          {preview.text}
        </pre>
        {preview.truncated ? (
          <p className="text-xs text-slate-400">Preview truncated.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="studio-resume-workspace-root">
      <div className="space-y-8" data-testid="resume-preview">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Tailored resume
          </p>
          <p className="text-2xl font-semibold tracking-tight text-slate-50">
            {toText(model.heading?.name) || "Candidate"}
          </p>
          {toText(model.heading?.contactLine) ? (
            <p className="max-w-2xl text-sm text-slate-300">{toText(model.heading?.contactLine)}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasUnsavedChanges ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
              Unsaved edits
            </span>
          ) : null}
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={onCancelEdits}
                className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
              >
                Cancel edits
              </button>
              <button
                type="button"
                onClick={onSaveEdits}
                className="rounded-xl bg-[var(--accent-primary)] px-3 py-2 text-sm font-semibold text-[var(--verdict-apply-text)] transition hover:bg-[var(--accent-primary-hover)]"
              >
                Save edits
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onEnterEditMode}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
            >
              Edit Resume
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="rounded-2xl border border-sky-300/20 bg-sky-500/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Edit mode</p>
          <p className="mt-1 text-xs text-slate-200">
            All sections are expanded for editing. Save changes when you&apos;re done.
          </p>
        </div>
      ) : null}

      {summary ? (
        <section
          className="rounded-2xl border border-white/10 bg-slate-950/20 p-5 data-[studio-focus-highlight=true]:ring-2 data-[studio-focus-highlight=true]:ring-amber-300/60"
          data-testid="studio-resume-summary-section"
          tabIndex={-1}
        >
          {isEditing ? (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
                Professional Summary
              </h3>
              <textarea
                aria-label="Resume summary"
                value={summary}
                onChange={(event) => onSummaryChange?.(event.target.value)}
                className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition focus:border-sky-300/40"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                aria-expanded={summaryExpanded}
                onClick={() => setSummaryExpanded((current) => !current)}
                data-testid="studio-resume-summary-header"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
                  Professional Summary
                </span>
                <span className="text-sm font-semibold text-slate-300" aria-hidden>
                  {summaryExpanded ? "▾" : "▸"}
                </span>
              </button>
              {summaryExpanded ? (
                <p className="max-w-3xl text-sm leading-7 text-slate-200/90">{summary}</p>
              ) : (
                <p className="text-xs text-slate-400">Collapsed. Click to review.</p>
              )}
            </div>
          )}
        </section>
      ) : null}

      {(isEditing || showFullResume) && competencies.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
            Core Competencies
          </h3>
          <div className="flex max-w-3xl flex-wrap gap-2">
            {competencies.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-200"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {!visibleExperiences.length && hasHiddenContent ? (
        <div className="pt-1">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
            onClick={() => setShowFullResume((current) => !current)}
            data-testid="studio-resume-show-full-toggle"
          >
            {showFullResume ? "Hide full resume" : "Show full resume"}
          </button>
        </div>
      ) : null}

      {visibleExperiences.length ? (
        <section className="space-y-4" data-testid="studio-resume-experience-section">
          <h3 className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
            Professional Experience
          </h3>
          <div className="space-y-6" data-testid="studio-resume-experience-accordion">
            {visibleExperiences.map(({ entry, index: experienceIndex }) => {
              const expanded = expandedExperienceIndex === experienceIndex;
              const headerId = `studio-resume-experience-role-header-${experienceIndex}`;
              const bodyId = `studio-resume-experience-role-body-${experienceIndex}`;
              const safeHeader = deriveHeader({ company: entry.company, roleTitle: entry.roleTitle });

              return (
                <article
                  key={`${safeHeader.company || "no-company"}-${safeHeader.roleTitle || "no-role"}-${experienceIndex}`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/20 data-[studio-focus-highlight=true]:ring-2 data-[studio-focus-highlight=true]:ring-amber-300/60"
                  data-testid="experience-entry-block"
                  data-studio-role-block="true"
                  data-role-index={experienceIndex}
                >
                  {isEditing ? (
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-6 py-5 text-left">
                      <div className="space-y-1">
                        {safeHeader.company ? (
                          <p className="text-lg font-semibold text-slate-50">{safeHeader.company}</p>
                        ) : null}
                        {safeHeader.roleTitle ? (
                          <p className="text-base font-medium text-slate-200">{safeHeader.roleTitle}</p>
                        ) : null}
                        <p className="text-xs text-slate-400">
                          {entry.bullets.length} {entry.bullets.length === 1 ? "bullet" : "bullets"}
                        </p>
                      </div>
                      <div className="flex items-start gap-3 text-right">
                        {entry.dateRange ? (
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500/80">
                            {entry.dateRange}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={bodyId}
                      onClick={() =>
                        setExpandedExperienceIndex((current) =>
                          current === experienceIndex ? null : experienceIndex,
                        )
                      }
                      className={`flex w-full items-start justify-between gap-3 px-6 py-5 text-left transition hover:bg-white/[0.03] ${
                        expanded ? "border-b border-white/10" : ""
                      }`}
                      data-testid={headerId}
                    >
                      <div className="space-y-1">
                        {safeHeader.company ? (
                          <p className="text-lg font-semibold text-slate-50">{safeHeader.company}</p>
                        ) : null}
                        {safeHeader.roleTitle ? (
                          <p className="text-base font-medium text-slate-200">{safeHeader.roleTitle}</p>
                        ) : null}
                        <p className="text-xs text-slate-400">
                          {entry.bullets.length} {entry.bullets.length === 1 ? "bullet" : "bullets"}
                        </p>
                      </div>
                      <div className="flex items-start gap-3 text-right">
                        {entry.dateRange ? (
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500/80">
                            {entry.dateRange}
                          </p>
                        ) : null}
                        <span className="text-sm font-semibold text-slate-300" aria-hidden>
                          {expanded ? "▾" : "▸"}
                        </span>
                      </div>
                    </button>
                  )}

                  {isEditing || expanded ? (
                    <div id={bodyId} className="px-6 pb-6 pt-4" data-testid={bodyId}>
                      <div className="rounded-xl border border-white/10 bg-slate-950/35 p-5">
                        <ul className="space-y-2 pl-5 text-sm leading-7 text-slate-200/90">
                          {entry.bullets.map((bullet, bulletIndex) => (
                            <li
                              key={`${entry.company}-${entry.roleTitle}-bullet-${bulletIndex}`}
                              className="marker:text-slate-500"
                            >
                              {isEditing ? (
                                <textarea
                                  aria-label={`Resume bullet ${experienceIndex + 1}-${bulletIndex + 1}`}
                                  value={bullet}
                                  onChange={(event) =>
                                    onBulletChange?.(experienceIndex, bulletIndex, event.target.value)
                                  }
                                  className="min-h-[72px] w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm leading-7 text-slate-100 outline-none transition focus:border-sky-300/40"
                                />
                              ) : (
                                <span
                                  className={
                                    matchesHighlightedClaim(bullet, claimHighlights)
                                      ? "rounded-sm border-b border-dotted border-amber-300/80 pb-0.5 text-slate-50"
                                      : undefined
                                  }
                                  title={
                                    matchesHighlightedClaim(bullet, claimHighlights)
                                      ? "Not yet verified"
                                      : undefined
                                  }
                                >
                                  {bullet}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          {hasHiddenContent ? (
            <div className="mt-4 border-t border-white/10 pt-5">
              <button
                type="button"
                className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
                onClick={() => setShowFullResume((current) => !current)}
                data-testid="studio-resume-show-full-toggle"
              >
                {showFullResume ? "Hide full resume" : "Show full resume"}
              </button>
              {!showFullResume ? (
                <p className="mt-2 text-xs text-slate-400">
                  Preview shows summary + 2 most recent roles. Expand for full resume sections.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {(isEditing || showFullResume) && education.length ? (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
            Education
          </h3>
          <ul className="space-y-2 text-sm leading-7 text-slate-200">
            {education.map((entry, index) => (
              <li key={`education-${index}`} className="rounded-xl border border-white/10 bg-slate-950/25 px-4 py-3">
                {[entry.degree, entry.institution, entry.location].filter(Boolean).join(" | ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>
    </div>
  );
}
