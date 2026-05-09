import { GenericLanguageDetector } from './generic-language-detector';

export type NarrativeQualityScore = {
  total: number; // 0-100
  specificity: number;
  cohesion: number;
  readability: number;
  evidenceIntegration: number;
  positioningClarity: number;
  redundancy: number;
  sentenceVariation: number;
  executiveTone: number;
};

function clamp(score: number) {
  return Math.max(0, Math.min(100, score));
}

function tokenize(text: string): string[] {
  return (
    String(text ?? '')
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((t) => t.length >= 3) ?? []
  );
}

function sentenceStarts(text: string): string[] {
  const sentences =
    String(text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return sentences.map((s) => (s.split(/\s+/)[0] ?? '').toLowerCase()).filter(Boolean);
}

export class NarrativeQualityEvaluator {
  private detector = new GenericLanguageDetector();

  evaluate(input: { text: string; positioningThesis?: string | null; evidenceKeywords?: string[] | null }): {
    score: NarrativeQualityScore;
    genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']>;
  } {
    const text = String(input.text ?? '').trim();
    const flags = this.detector.detect(text);
    const tokens = tokenize(text);
    const unique = new Set(tokens);

    const keywordHits = (input.evidenceKeywords ?? [])
      .map((k) => String(k ?? '').toLowerCase())
      .filter(Boolean)
      .reduce((acc, keyword) => acc + (text.toLowerCase().includes(keyword) ? 1 : 0), 0);

    const starts = sentenceStarts(text);
    const startUnique = new Set(starts);
    const variation = starts.length ? Math.round((startUnique.size / starts.length) * 100) : 0;

    const specificity = clamp(30 + Math.round(unique.size / 6) + Math.min(15, keywordHits * 4) - flags.length * 3);
    const redundancy = clamp(80 - Math.max(0, tokens.length - unique.size) - flags.length * 4);
    const sentenceVariation = clamp(variation - flags.filter((f) => f.type === 'repetitive_openings').length * 20);
    const readability = clamp(55 + Math.min(30, Math.round(text.length / 120)) - flags.length * 4);

    const thesis = String(input.positioningThesis ?? '').trim().toLowerCase();
    const positioningClarity = clamp(
      thesis ? (text.toLowerCase().includes(thesis.slice(0, Math.min(18, thesis.length))) ? 85 : 60) : 60,
    );

    const cohesion = clamp(55 + Math.min(20, Math.round(keywordHits * 6)) - flags.length * 3);
    const evidenceIntegration = clamp(45 + Math.min(40, keywordHits * 7) - flags.length * 4);
    const executiveTone = clamp(60 + Math.min(20, Math.round(unique.size / 10)) - flags.length * 6);

    const total = clamp(
      Math.round(
        (specificity +
          cohesion +
          readability +
          evidenceIntegration +
          positioningClarity +
          redundancy +
          sentenceVariation +
          executiveTone) /
          8,
      ),
    );

    return {
      score: {
        total,
        specificity,
        cohesion,
        readability,
        evidenceIntegration,
        positioningClarity,
        redundancy,
        sentenceVariation,
        executiveTone,
      },
      genericLanguageFlags: flags,
    };
  }
}

