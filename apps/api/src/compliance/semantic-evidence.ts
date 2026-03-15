export type SemanticEvidenceMatch = {
  bestSimilarity: number;
  bestEvidenceText: string;
  topMatches: Array<{ text: string; similarity: number }>;
};

type SemanticMatchOptions = {
  embeddingProvider?: (text: string) => Promise<number[] | null>;
  topK?: number;
};

function tokenSet(value: string): Set<string> {
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

function tokenJaccard(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || !right.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    leftMagnitude += l * l;
    rightMagnitude += r * r;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export async function findBestSemanticEvidenceMatch(
  claimText: string,
  evidencePool: string[],
  options?: SemanticMatchOptions,
): Promise<SemanticEvidenceMatch> {
  const normalizedClaim = String(claimText ?? '').replace(/\s+/g, ' ').trim();
  const normalizedEvidence = evidencePool
    .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (!normalizedClaim || !normalizedEvidence.length) {
    return {
      bestSimilarity: 0,
      bestEvidenceText: 'Baseline has no matching scope evidence.',
      topMatches: [],
    };
  }

  const scored: Array<{ text: string; similarity: number }> = [];
  const embeddingProvider = options?.embeddingProvider;
  const topK = options?.topK ?? 3;

  if (embeddingProvider) {
    const cache = new Map<string, number[] | null>();
    const getEmbedding = async (value: string): Promise<number[] | null> => {
      if (cache.has(value)) return cache.get(value) ?? null;
      const embedding = await embeddingProvider(value);
      cache.set(value, embedding ?? null);
      return embedding ?? null;
    };

    const claimEmbedding = await getEmbedding(normalizedClaim);
    if (claimEmbedding?.length) {
      for (const evidence of normalizedEvidence) {
        const evidenceEmbedding = await getEmbedding(evidence);
        if (!evidenceEmbedding?.length) continue;
        scored.push({
          text: evidence,
          similarity: cosineSimilarity(claimEmbedding, evidenceEmbedding),
        });
      }
    }
  }

  if (!scored.length) {
    for (const evidence of normalizedEvidence) {
      scored.push({
        text: evidence,
        similarity: tokenJaccard(normalizedClaim, evidence),
      });
    }
  }

  const ordered = scored.sort((left, right) => right.similarity - left.similarity);
  const best = ordered[0] ?? {
    text: 'Baseline has no matching scope evidence.',
    similarity: 0,
  };

  return {
    bestSimilarity: best.similarity,
    bestEvidenceText: best.text,
    topMatches: ordered.slice(0, topK),
  };
}
