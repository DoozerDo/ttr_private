export const DEFAULT_SYNTHETIC_CANDIDATE_NAME = 'Core Loop Candidate';

const ROLE_PHRASE_PATTERN =
  /\b(leader|focused|delivery|execution|operations|operator|strategy|stakeholder|reliable|measurable)\b/i;

export function isValidCandidateName(candidateName: string): boolean {
  const trimmed = String(candidateName ?? '').trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  if (ROLE_PHRASE_PATTERN.test(trimmed)) return false;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > 6) return false;
  if (wordCount < 2) return false;

  return true;
}

export function resolveSyntheticCandidateName(candidateName: string | null | undefined): string {
  const trimmed = String(candidateName ?? '').trim();
  if (!trimmed) return DEFAULT_SYNTHETIC_CANDIDATE_NAME;
  if (!isValidCandidateName(trimmed)) return DEFAULT_SYNTHETIC_CANDIDATE_NAME;
  return trimmed;
}

