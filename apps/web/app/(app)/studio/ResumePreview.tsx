"use client";

import { useMemo } from "react";

type ResumeExperience = {
  company?: string;
  roleTitle?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
  bullets?: string[];
};

type ResumeEducation = {
  institution?: string;
  degree?: string;
  location?: string;
};

type ResumeModel = {
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

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readResumeModel(payload: unknown): ResumeModel | null {
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
    .split(/[|¦｜]/)
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
    if (!key || key === "||" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

type Props = {
  payload: unknown;
  fallbackText?: string;
};

export function ResumePreview({ payload, fallbackText }: Props) {
  const model = useMemo(() => readResumeModel(payload), [payload]);

  if (!model) {
    if (!fallbackText) return null;
    return (
      <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
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
    <div className="space-y-5" data-testid="resume-preview">
      <header className="space-y-1 border-b border-white/10 pb-3">
        <p className="text-base font-semibold text-slate-100">
          {toText(model.heading?.name) || "Candidate"}
        </p>
        {toText(model.heading?.contactLine) ? (
          <p className="text-xs text-slate-300">{toText(model.heading?.contactLine)}</p>
        ) : null}
      </header>

      {summary ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
            Summary
          </h3>
          <p className="text-sm leading-relaxed text-slate-200">{summary}</p>
        </section>
      ) : null}

      {competencies.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
            Core Competencies
          </h3>
          <p className="text-sm leading-relaxed text-slate-200">
            {competencies.join(" | ")}
          </p>
        </section>
      ) : null}

      {experiences.length ? (
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
            Professional Experience
          </h3>
          <div className="space-y-3 border-t border-white/10 pt-2">
            {experiences.map((entry, index) => (
              <article
                key={`${entry.company}-${entry.roleTitle}-${index}`}
                className="space-y-2 rounded-xl border border-white/20 border-l-2 border-l-slate-200/35 bg-slate-900/50 px-4 py-3"
                data-testid="experience-entry-block"
              >
                  <p className="text-sm font-semibold text-slate-100">
                    {[entry.company, entry.location].filter(Boolean).join(" | ")}
                  </p>
                  <p className="text-sm text-slate-200">
                    {[entry.roleTitle, entry.dateRange].filter(Boolean).join(" | ")}
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-200">
                    {entry.bullets.map((bullet, bulletIndex) => (
                      <li key={`${entry.company}-${entry.roleTitle}-bullet-${bulletIndex}`}>
                        {bullet}
                      </li>
                    ))}
                  </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {education.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
            Education
          </h3>
          <ul className="space-y-1 text-sm leading-relaxed text-slate-200">
            {education.map((entry, index) => (
              <li key={`education-${index}`}>
                {[entry.degree, entry.institution, entry.location]
                  .filter(Boolean)
                  .join(" | ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
