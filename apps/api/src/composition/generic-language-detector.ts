export type GenericLanguageFlag = {
  type:
    | 'banned_phrase'
    | 'vague_filler'
    | 'repetitive_openings'
    | 'low_information_opening';
  phrase?: string;
  detail?: string;
};

const BANNED_PHRASES = [
  'results-driven',
  'team player',
  'passionate',
  'dynamic leader',
  'hard-working',
  'detail-oriented',
  'go-getter',
  'self-starter',
  'fast-paced environment',
  'synergy',
  'leverage',
  'utilize',
  'results oriented',
  'results-focused',
  'highly motivated',
];

const VAGUE_FILLER = [
  'responsible for',
  'worked on',
  'helped with',
  'assisted with',
  'various',
  'multiple',
  'many',
  'things',
];

function trimToText(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function tokenizeLines(text: string): string[] {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => trimToText(line))
    .filter(Boolean);
}

export class GenericLanguageDetector {
  detect(text: string): GenericLanguageFlag[] {
    const normalized = trimToText(text);
    if (!normalized) return [];

    const flags: GenericLanguageFlag[] = [];
    const lowered = normalized.toLowerCase();

    for (const phrase of BANNED_PHRASES) {
      if (lowered.includes(phrase)) {
        flags.push({ type: 'banned_phrase', phrase });
      }
    }
    for (const phrase of VAGUE_FILLER) {
      if (lowered.includes(phrase)) {
        flags.push({ type: 'vague_filler', phrase });
      }
    }

    const lines = tokenizeLines(normalized);
    const openings = lines
      .map((line) => line.split(/\s+/).slice(0, 3).join(' ').toLowerCase())
      .filter(Boolean);
    const counts = new Map<string, number>();
    for (const opening of openings) {
      counts.set(opening, (counts.get(opening) ?? 0) + 1);
    }
    const repetitive = Array.from(counts.entries()).filter(([, count]) => count >= 3);
    if (repetitive.length) {
      flags.push({
        type: 'repetitive_openings',
        detail: repetitive.map(([open, count]) => `${open} x${count}`).join(', '),
      });
    }

    const firstSentence = normalized.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() ?? '';
    const firstTokens: string[] = firstSentence.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    if (
      firstTokens.length > 0 &&
      firstTokens.length <= 7 &&
      (firstTokens.includes('hello') ||
        firstTokens.includes('dear') ||
        firstTokens.includes('hi') ||
        firstTokens.includes('thanks') ||
        firstTokens.includes('thank'))
    ) {
      flags.push({ type: 'low_information_opening', detail: firstSentence });
    }

    return flags;
  }
}
