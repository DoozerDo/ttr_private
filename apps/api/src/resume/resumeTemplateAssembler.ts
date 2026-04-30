import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';

export type ResumeTemplateIdentityLike = {
  name?: unknown;
  contactLine?: unknown;
  links?: unknown;
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function assembleResumeFromStructuredBaseline(
  structured: StructuredBaseline,
  identity: ResumeTemplateIdentityLike,
): NormalizedResumeDocument {
  const experience = (structured.experience ?? []).map((entry) => ({
    company: trimToText(entry.company),
    roleTitle: trimToText(entry.roleTitle),
    dateRange: entry.dates ? trimToText(entry.dates) : undefined,
    bullets: (entry.bullets ?? []).map((b) => trimToText(b)).filter(Boolean),
  }));

  const competencies = (structured.skills ?? []).map((s) => trimToText(s)).filter(Boolean);
  const education = (structured.education ?? [])
    .map((line) => trimToText(line))
    .filter(Boolean)
    .map((institution) => ({ institution }));

  const summary = structured.summary ? trimToText(structured.summary) : undefined;

  return {
    heading: {
      name: trimToText(identity.name),
      contactLine: trimToText(identity.contactLine),
      ...(Array.isArray(identity.links) && identity.links.length
        ? { links: identity.links.map((l) => trimToText(l)).filter(Boolean) }
        : {}),
    },
    ...(summary ? { summary } : {}),
    ...(competencies.length ? { competencies } : {}),
    experience,
    ...(education.length ? { education } : {}),
  };
}
