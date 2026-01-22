import type { FitScoreInput } from './fit-score.types';

export const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const countWords = (text: string) => {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
};

export const tokenize = (text: string) => {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length >= 2);
};

export const clamp = (value: number, min = 0, max = 100) => {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
};

export const mapSimilarityToScore = (similarity: number, floor = 0.25, ceiling = 0.75) => {
  if (similarity <= floor) return 0;
  if (similarity >= ceiling) return 100;
  const ratio = (similarity - floor) / (ceiling - floor);
  return clamp(Math.round(ratio * 100));
};

const RAW_JOB_LABEL = 'FULL JOB DESCRIPTION (AUTHORITATIVE)';
const SUPPLEMENTAL_RESP_LABEL = 'SUPPLEMENTAL RESPONSIBILITIES';
const SUPPLEMENTAL_REQ_LABEL = 'SUPPLEMENTAL REQUIREMENTS';
const SECTION_SEPARATOR = '\n\n---\n\n';

export type JobPromptSelection = {
  text: string;
  wordCount: number;
  source: 'rawDescription' | 'normalizedSections';
  rawDescription: string;
  normalizedText: string;
};

export const buildJobPromptText = (job: FitScoreInput['job']): JobPromptSelection => {
  const rawDescription = (job.rawDescription ?? '').trim();
  const normalizedResponsibilities = (job.normalizedResponsibilities ?? []).filter(Boolean);
  const normalizedRequirements = (job.normalizedRequirements ?? []).filter(Boolean);
  const normalizedText = [...normalizedResponsibilities, ...normalizedRequirements].join('\n');
  const sections: string[] = [];

  if (rawDescription.length) {
    sections.push(`${RAW_JOB_LABEL}\n\n${rawDescription}`);
  }

  if (normalizedResponsibilities.length) {
    sections.push(`${SUPPLEMENTAL_RESP_LABEL}\n\n${normalizedResponsibilities.join('\n')}`);
  }

  if (normalizedRequirements.length) {
    sections.push(`${SUPPLEMENTAL_REQ_LABEL}\n\n${normalizedRequirements.join('\n')}`);
  }

  const text = sections.length
    ? sections.join(SECTION_SEPARATOR)
    : normalizedText || rawDescription;
  const wordCount = countWords(text);
  const source = rawDescription.length ? 'rawDescription' : 'normalizedSections';

  return {
    text,
    wordCount,
    source,
    rawDescription,
    normalizedText,
  };
};
