import { createHash } from 'crypto';
import { getCharCount } from '../common/text-metrics';
import type { FitScoreInput } from '../scoring/fit-score/fit-score.types';

export type JobTextCanonical = {
  jobTextUsed: string;
  jobTextSha256: string;
  jobTextCharCount: number;
};

export function canonicalizeJobText(job: FitScoreInput['job']): JobTextCanonical {
  const rawDescription = (job.rawDescription ?? '').trim();
  if (rawDescription.length) {
    return {
      jobTextUsed: rawDescription,
      jobTextSha256: sha256Text(rawDescription),
      jobTextCharCount: getCharCount(rawDescription),
    };
  }

  const normalizedResponsibilities = (job.normalizedResponsibilities ?? []).filter(Boolean);
  const normalizedRequirements = (job.normalizedRequirements ?? []).filter(Boolean);
  const normalizedChunks = [...normalizedResponsibilities, ...normalizedRequirements];
  const normalizedText = normalizedChunks.join('\n').trim();

  if (!normalizedText.length) {
    throw new Error('Job description text is required for scoring.');
  }

  return {
    jobTextUsed: normalizedText,
    jobTextSha256: sha256Text(normalizedText),
    jobTextCharCount: getCharCount(normalizedText),
  };
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
