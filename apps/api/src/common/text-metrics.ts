import { createHash } from 'crypto';

export const countWords = (text = ''): number => {
  return text
    .trim()
    .split(/\s+/)
    .map((segment) => segment.replace(/^[^a-z0-9]+|[^a-z0-9]+$/giu, ''))
    .filter((segment) => segment.length >= 3).length;
};

export const getCharCount = (text = ''): number => text.length;

export const sha256 = (text = ''): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export const safeSnippet = (text = '', segmentLength = 120): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= segmentLength * 2) {
    return trimmed;
  }

  const start = trimmed.slice(0, segmentLength);
  const end = trimmed.slice(-segmentLength);
  return `${start}…${end}`;
};
