"use client";

import { useMemo } from "react";

export type ResumeExperience = {
  company?: string;
  roleTitle?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
  bullets?: string[];
};

export type ResumeEducation = {
  institution?: string;
  degree?: string;
  location?: string;
};

export type ResumeModel = {
  heading?: {
    name?: string;
    contactLine?: string;
    links?: string[];
  };
  summary?: string;
  competencies?: string[];
  coreCompetencies?: string[];
  experience?: ResumeExperience[];
  education?: ResumeEducation[];
};

type Props = {
  payload?: unknown;
  model?: ResumeModel | null;
  fallbackText?: string;
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

export function readResumeModel(payload: unknown): ResumeModel | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const preview = record.preview;
  if (!preview || typeof preview !== "object") return null;
  const resume = (preview as Record<string, unknown>).resume;
  if (!resume || typeof resume !== "object") return null;
  return resume as ResumeModel;
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
  isEditing = false,
  hasUnsavedChanges = false,
  onEnterEditMode,
  onSaveEdits,
  onCancelEdits,
  onSummaryChange,
  onBulletChange,
}: Props) {
  const model = useMemo(() => modelOverride ?? readResumeModel(payload), [modelOverride, payload]);

  if (!model) {
    if (!fallbackText) return null;
    return (
      <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm leading-7 text-slate-200">
        {fallbackText}
      </pre>
    );
  }

  const summary = toText(model.summary);
  const competenciesSource = Array.isArray(model.competencies)
    ? model.competencies
    : model.coreCompetencies;
  const competencies = Array.isArray(competenciesSource)
    ? competenciesSource.map((value) => toText(value)).filter(Boolean)
    : [];
  const experiences = Array.isArray(model.experience)
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
        .filter((entry) => entry.company && entry.roleTitle && entry.bullets.length > 0)
    : [];
  const education = Array.isArray(model.education)
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

  return (
    <div className="space-y-6" data-testid="resume-preview">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Preview of tailored resume
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
        <p className="text-xs text-slate-400">
          Edits are user controlled and may affect final review.
        </p>
      ) : null}

      {summary ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
            Professional Summary
          </h3>
          {isEditing ? (
            <textarea
              aria-label="Resume summary"
              value={summary}
              onChange={(event) => onSummaryChange?.(event.target.value)}
              className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition focus:border-sky-300/40"
            />
          ) : (
            <p className="max-w-3xl text-sm leading-7 text-slate-200">{summary}</p>
          )}
        </section>
      ) : null}

      {competencies.length ? (
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

      {experiences.length ? (
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
            Professional Experience
          </h3>
          <div className="space-y-5">
            {experiences.map((entry, experienceIndex) => (
              <article
                key={`${entry.company}-${entry.roleTitle}-${experienceIndex}`}
                className="rounded-2xl border border-white/10 bg-slate-950/35 px-5 py-4"
                data-testid="experience-entry-block"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-slate-50">{entry.company}</p>
                    <p className="text-sm font-medium text-slate-200">
                      {[entry.roleTitle, entry.location].filter(Boolean).join(" | ")}
                    </p>
                  </div>
                  {entry.dateRange ? (
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      {entry.dateRange}
                    </p>
                  ) : null}
                </div>
                <ul className="mt-4 space-y-3 pl-5 text-sm leading-7 text-slate-200">
                  {entry.bullets.map((bullet, bulletIndex) => (
                    <li key={`${entry.company}-${entry.roleTitle}-bullet-${bulletIndex}`} className="marker:text-slate-500">
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
                        <span>{bullet}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {education.length ? (
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
  );
}
