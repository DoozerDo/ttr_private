import type { NormalizedResumeDocument } from '../documents/normalized-document.models';

export type RealDocumentClassification =
  | { classification: 'usable'; reasonCodes: string[]; userMessage: null }
  | { classification: 'generated_unusable'; reasonCodes: string[]; userMessage: string }
  | { classification: 'baseline_reprocess_required'; reasonCodes: string[]; userMessage: string };

function trimToText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : String(value ?? '').replace(/\s+/g, ' ').trim();
}

function countSentences(text: string): number {
  const normalized = trimToText(text);
  if (!normalized) return 0;
  return normalized.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).length;
}

function isCompleteSentence(text: string): boolean {
  const normalized = trimToText(text);
  if (!normalized) return false;
  return /[.!?]\s*$/.test(normalized);
}

function hasRoleIdentity(summary: string): boolean {
  const s = summary.toLowerCase();
  return /\b(support operations|customer operations|customer success|customer experience|cx|service operations|operations|leader|manager|director)\b/i.test(s);
}

function looksLikeWeakFragmentRole(company: string, roleTitle: string): boolean {
  const c = company.toLowerCase();
  const r = roleTitle.toLowerCase();
  if (/\b(vue|react|deck builder|frontend)\b/.test(c)) return true;
  if (c.includes('experience entry needs correction')) return true;
  if (/\b(contractor|freelance|consultant)\b/.test(r) && /\b(linux|infrastructure|sysadmin)\b/.test(r)) return true;
  return false;
}

export function validateRealResumeDocument(input: {
  resume: NormalizedResumeDocument | null;
  jobTitle: string | null;
  jobDescription: string | null;
  evidenceExists: boolean;
}): RealDocumentClassification {
  const reasons: string[] = [];
  const resume = input.resume;
  if (!resume) {
    return {
      classification: 'baseline_reprocess_required',
      reasonCodes: ['missing_resume_model'],
      userMessage: 'We could not build a resume draft from your baseline. Reprocess your baseline resume and try again.',
    };
  }

  const summary = trimToText((resume as any).summary);
  if (!summary) reasons.push('resume_contract:missing_summary');
  if (summary && countSentences(summary) < 2) reasons.push('resume_contract:summary_too_thin');
  if (summary && !hasRoleIdentity(summary)) reasons.push('resume_contract:missing_role_identity');

  const experience = Array.isArray((resume as any).experience) ? ((resume as any).experience as any[]) : [];
  const meaningfulEntries = experience.filter((e) => trimToText(e?.company) && trimToText(e?.roleTitle));
  if (input.evidenceExists && meaningfulEntries.length < 2) reasons.push('resume_contract:insufficient_experience_entries');

  const bulletsByEntry = meaningfulEntries.map((e) =>
    Array.isArray(e?.bullets) ? (e.bullets as unknown[]).map(trimToText).filter(Boolean) : [],
  );
  const totalBullets = bulletsByEntry.flat().length;
  if (input.evidenceExists && totalBullets < 4) reasons.push('resume_contract:insufficient_total_bullets');
  if (input.evidenceExists && (bulletsByEntry[0]?.length ?? 0) < 2) reasons.push('resume_contract:primary_role_insufficient_bullets');

  const fragmentBullets = bulletsByEntry.flat().filter((b) => b.length < 12 || !isCompleteSentence(b));
  if (fragmentBullets.length > 0) reasons.push('resume_contract:fragment_bullets_present');

  const weakTopRole = (() => {
    const top = meaningfulEntries[0];
    if (!top) return false;
    return looksLikeWeakFragmentRole(trimToText(top.company), trimToText(top.roleTitle));
  })();
  const hasNonWeak = meaningfulEntries.some((e) => !looksLikeWeakFragmentRole(trimToText(e.company), trimToText(e.roleTitle)));
  if (weakTopRole && hasNonWeak) reasons.push('resume_contract:positioning_mismatch_top_role');

  if (reasons.length === 0) {
    return { classification: 'usable', reasonCodes: [], userMessage: null };
  }
  return {
    classification: 'generated_unusable',
    reasonCodes: reasons,
    userMessage:
      'We generated a draft, but it is not strong enough to use yet. Regenerate or refine your source inputs before exporting.',
  };
}

export function validateRealCoverLetterDocument(input: {
  paragraphs: string[] | null | undefined;
  jobTitle: string | null;
  companyName: string | null;
  requiredEvidenceSnippets: string[];
}): RealDocumentClassification {
  const reasons: string[] = [];
  const paragraphs = Array.isArray(input.paragraphs) ? input.paragraphs.map((p) => trimToText(p)).filter(Boolean) : [];
  const fullText = paragraphs.join('\n');
  if (paragraphs.length < 3) reasons.push('cover_contract:missing_structure');

  const company = trimToText(input.companyName);
  const roleTitle = trimToText(input.jobTitle);
  if (company && !new RegExp(`\\b${company.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(fullText)) {
    reasons.push('cover_contract:missing_company');
  }
  if (roleTitle && !new RegExp(`\\b${roleTitle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(fullText)) {
    reasons.push('cover_contract:missing_role');
  }

  const evidence = (input.requiredEvidenceSnippets ?? []).map(trimToText).filter(Boolean).slice(0, 6);
  const hits = evidence.filter((snippet) => snippet.length >= 8 && fullText.toLowerCase().includes(snippet.toLowerCase()));
  if (evidence.length > 0 && hits.length < 2) reasons.push('cover_contract:insufficient_evidence_grounding');

  const normalized = fullText.toLowerCase();
  if (/\b(passio nate about|fast[-\s]?paced environment|team player|dynamic team)\b/i.test(normalized)) {
    reasons.push('cover_contract:generic_filler');
  }

  if (reasons.length === 0) return { classification: 'usable', reasonCodes: [], userMessage: null };
  return {
    classification: 'generated_unusable',
    reasonCodes: reasons,
    userMessage:
      'We generated a draft, but it is not strong enough to use yet. Regenerate or refine your source inputs before exporting.',
  };
}

