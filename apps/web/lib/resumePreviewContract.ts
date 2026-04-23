import type { ResumeModel } from "@/lib/resumeModel";

export type ResumePreviewLimits = {
  maxSummaryChars: number;
  maxCompetencies: number;
  maxExperiences: number;
  maxBulletsPerExperience: number;
  maxBulletChars: number;
  maxEducationEntries: number;
  maxHeadingChars: number;
  maxContactChars: number;
};

export const RESULTS_RESUME_PREVIEW_LIMITS: ResumePreviewLimits = {
  maxSummaryChars: 650,
  maxCompetencies: 12,
  maxExperiences: 2,
  maxBulletsPerExperience: 4,
  maxBulletChars: 220,
  maxEducationEntries: 2,
  maxHeadingChars: 80,
  maxContactChars: 160,
};

export function readResumeModel(payload: unknown): ResumeModel | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const preview = record.preview;
  if (!preview || typeof preview !== "object") return null;
  const resume = (preview as Record<string, unknown>).resume;
  if (!resume || typeof resume !== "object") return null;
  return resume as ResumeModel;
}

export function estimateResumeModelBodyLength(model: ResumeModel | null): number {
  if (!model) return 0;
  const parts: string[] = [];
  const headingName = typeof model.heading?.name === "string" ? model.heading.name : "";
  const headingContact = typeof model.heading?.contactLine === "string" ? model.heading.contactLine : "";
  if (headingName) parts.push(headingName);
  if (headingContact) parts.push(headingContact);

  if (typeof model.summary === "string" && model.summary.trim()) {
    parts.push(model.summary.trim());
  }

  const competenciesSource = Array.isArray(model.competencies)
    ? model.competencies
    : model.coreCompetencies;
  if (Array.isArray(competenciesSource)) {
    parts.push(
      ...competenciesSource.filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    );
  }

  if (Array.isArray(model.experience)) {
    for (const entry of model.experience) {
      if (typeof entry.company === "string" && entry.company.trim()) parts.push(entry.company.trim());
      if (typeof entry.roleTitle === "string" && entry.roleTitle.trim()) parts.push(entry.roleTitle.trim());
      if (Array.isArray(entry.bullets)) {
        parts.push(...entry.bullets.filter((v): v is string => typeof v === "string" && v.trim().length > 0));
      }
    }
  }

  if (Array.isArray(model.education)) {
    for (const edu of model.education) {
      if (typeof edu.degree === "string" && edu.degree.trim()) parts.push(edu.degree.trim());
      if (typeof edu.institution === "string" && edu.institution.trim()) parts.push(edu.institution.trim());
      if (typeof edu.location === "string" && edu.location.trim()) parts.push(edu.location.trim());
    }
  }

  return parts.join("\n").length;
}

function truncateValue(value: string, maxChars: number): { value: string; truncated: boolean } {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return { value: "", truncated: false };
  if (raw.length <= maxChars) return { value: raw, truncated: false };
  return { value: raw.slice(0, maxChars), truncated: true };
}

export function sliceResumeModelForPreview(
  model: ResumeModel,
  limits: ResumePreviewLimits = RESULTS_RESUME_PREVIEW_LIMITS,
): { model: ResumeModel; truncated: boolean } {
  let truncated = false;

  const headingName = typeof model.heading?.name === "string" ? model.heading.name : undefined;
  const headingContact = typeof model.heading?.contactLine === "string" ? model.heading.contactLine : undefined;
  const nameTrunc = headingName ? truncateValue(headingName, limits.maxHeadingChars) : null;
  const contactTrunc = headingContact ? truncateValue(headingContact, limits.maxContactChars) : null;
  if (nameTrunc?.truncated || contactTrunc?.truncated) truncated = true;

  const summaryRaw = typeof model.summary === "string" ? model.summary : undefined;
  const summaryTrunc = summaryRaw ? truncateValue(summaryRaw, limits.maxSummaryChars) : null;
  if (summaryTrunc?.truncated) truncated = true;

  const competenciesSource = Array.isArray(model.competencies)
    ? model.competencies
    : model.coreCompetencies;
  const competencies = Array.isArray(competenciesSource)
    ? competenciesSource.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const slicedCompetencies = competencies.slice(0, limits.maxCompetencies);
  if (slicedCompetencies.length !== competencies.length) truncated = true;

  const experiences = Array.isArray(model.experience) ? model.experience : [];
  const slicedExperiences = experiences.slice(0, limits.maxExperiences).map((entry) => {
    const bullets = Array.isArray(entry.bullets) ? entry.bullets.filter((v) => typeof v === "string") : [];
    const slicedBullets = bullets.slice(0, limits.maxBulletsPerExperience).map((bullet) => {
      const clipped = truncateValue(bullet, limits.maxBulletChars);
      if (clipped.truncated) truncated = true;
      return clipped.value;
    });
    if (slicedBullets.length !== bullets.length) truncated = true;
    return {
      ...entry,
      bullets: slicedBullets,
    };
  });
  if (slicedExperiences.length !== experiences.length) truncated = true;

  const education = Array.isArray(model.education) ? model.education : [];
  const slicedEducation = education.slice(0, limits.maxEducationEntries);
  if (slicedEducation.length !== education.length) truncated = true;

  return {
    model: {
      ...model,
      heading: {
        ...(model.heading ?? {}),
        name: nameTrunc?.value ?? model.heading?.name,
        contactLine: contactTrunc?.value ?? model.heading?.contactLine,
      },
      summary: summaryTrunc?.value ?? model.summary,
      competencies: Array.isArray(model.competencies) ? slicedCompetencies : model.competencies,
      coreCompetencies: Array.isArray(model.competencies) ? model.coreCompetencies : slicedCompetencies,
      experience: slicedExperiences,
      education: slicedEducation,
    },
    truncated,
  };
}
