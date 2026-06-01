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
  const sanitizedRoot = { ...(resume as any) } as NormalizedResumeDocument;
  if (typeof (sanitizedRoot as any).summary === 'string') {
    (sanitizedRoot as any).summary = String((sanitizedRoot as any).summary)
      .replace(/\bSummary\s*\|\s*Summary\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!experience.length) return sanitizedRoot;

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

    return next as unknown as typeof entry;
  }).filter((entry) => {
    const anyEntry = entry as unknown as Record<string, unknown>;
    const finalCompany = typeof anyEntry.company === 'string' ? String(anyEntry.company).trim() : '';
    const finalRoleTitle = typeof anyEntry.roleTitle === 'string' ? String(anyEntry.roleTitle).trim() : '';
    // Never emit placeholder experience rows; if an entry cannot be rendered as a header, drop it.
    return Boolean(finalCompany || finalRoleTitle);
  });

  return {
    ...(sanitizedRoot as unknown as Record<string, unknown>),
    experience: sanitizedExperience as unknown as NormalizedResumeDocument['experience'],
  } as NormalizedResumeDocument;
}
