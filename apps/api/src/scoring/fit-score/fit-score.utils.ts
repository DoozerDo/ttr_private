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
