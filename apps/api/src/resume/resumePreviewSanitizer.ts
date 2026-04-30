import {
  endsWithDanglingHeaderToken,
  isMalformedResumeExperienceCompany,
  isMalformedResumeExperienceRoleTitle,
  looksLikeSentence,
  startsWithActionVerb,
} from '../artifacts/artifactQualityValidator';
import type { NormalizedResumeDocument } from '../documents/normalized-document.models';

function normalizeForBulletMatch(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function shouldAppendHeaderValueAsBullet(value: string): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (endsWithDanglingHeaderToken(text)) return false;
  return looksLikeSentence(text) || startsWithActionVerb(text);
}

export function sanitizeResumePreviewForStudio(
  resume: NormalizedResumeDocument,
): NormalizedResumeDocument {
  const experience = Array.isArray(resume.experience) ? resume.experience : [];
  if (!experience.length) return resume;

  const sanitizedExperience = experience.map((entry) => {
    const rawEntry = entry as unknown as Record<string, unknown>;
    const company = typeof rawEntry.company === 'string' ? rawEntry.company : '';
    const roleTitle = typeof rawEntry.roleTitle === 'string' ? rawEntry.roleTitle : '';
    const bulletsRaw = Array.isArray(rawEntry.bullets) ? (rawEntry.bullets as unknown[]) : [];
    const bullets = bulletsRaw.map((b) => String(b ?? '')).filter(Boolean);
    const bulletIndex = new Set(bullets.map(normalizeForBulletMatch));

    const next = { ...rawEntry } as Record<string, unknown>;
    let removedCompany: string | null = null;
    let removedRoleTitle: string | null = null;

    if (company && isMalformedResumeExperienceCompany(company)) {
      removedCompany = company;
      next.company = '';
    }
    if (roleTitle && isMalformedResumeExperienceRoleTitle(roleTitle)) {
      removedRoleTitle = roleTitle;
      next.roleTitle = '';
    }

    const appendBullet = (value: string | null) => {
      if (!value) return;
      if (!shouldAppendHeaderValueAsBullet(value)) return;
      const key = normalizeForBulletMatch(value);
      if (!key || bulletIndex.has(key)) return;
      bullets.push(value.trim());
      bulletIndex.add(key);
    };

    appendBullet(removedCompany);
    appendBullet(removedRoleTitle);

    next.bullets = bullets;

    const finalCompany = typeof next.company === 'string' ? String(next.company).trim() : '';
    const finalRoleTitle = typeof next.roleTitle === 'string' ? String(next.roleTitle).trim() : '';
    if (!finalCompany && !finalRoleTitle) {
      next.company = 'Experience entry needs correction';
      next.roleTitle = '';
    }

    return next as unknown as typeof entry;
  });

  return {
    ...(resume as unknown as Record<string, unknown>),
    experience: sanitizedExperience as unknown as NormalizedResumeDocument['experience'],
  } as NormalizedResumeDocument;
}
