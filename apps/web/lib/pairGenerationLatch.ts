type PairGenerationLatchRecord = {
  sessionKey: string;
  acquiredAt: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = "ttr:pair_generation_latch:v1:";

function nowMs(): number {
  return Date.now();
}

function safeReadSessionStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeWriteSessionStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemoveSessionStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

function buildLatchStorageKey(pairKey: string): string {
  return `${STORAGE_PREFIX}${pairKey}`;
}

export function tryAcquirePairGenerationLatch(input: {
  pairKey: string | null;
  sessionKey: string | null;
  ttlMs?: number;
}): boolean {
  const pairKey = typeof input.pairKey === "string" ? input.pairKey.trim() : "";
  const sessionKey = typeof input.sessionKey === "string" ? input.sessionKey.trim() : "";
  if (!pairKey || !sessionKey) return false;

  const storageKey = buildLatchStorageKey(pairKey);
  const ttlMs = typeof input.ttlMs === "number" && Number.isFinite(input.ttlMs) ? input.ttlMs : DEFAULT_TTL_MS;
  const raw = safeReadSessionStorage(storageKey);
  const now = nowMs();

  if (raw) {
    try {
      const existing = JSON.parse(raw) as Partial<PairGenerationLatchRecord>;
      const acquiredAt = typeof existing.acquiredAt === "number" ? existing.acquiredAt : 0;
      const existingSessionKey = typeof existing.sessionKey === "string" ? existing.sessionKey : "";
      const expired = !acquiredAt || now - acquiredAt > ttlMs;
      if (!expired && existingSessionKey === sessionKey) {
        // Re-entrant acquisition for the same session key is allowed so a single
        // pair-atomic generation attempt can start multiple artifact requests.
        return true;
      }
      if (!expired) {
        return false;
      }
    } catch {
      // ignore parse errors and overwrite
    }
  }

  safeWriteSessionStorage(
    storageKey,
    JSON.stringify({
      sessionKey,
      acquiredAt: now,
    } satisfies PairGenerationLatchRecord),
  );
  return true;
}

export function releasePairGenerationLatch(pairKey: string | null) {
  const key = typeof pairKey === "string" ? pairKey.trim() : "";
  if (!key) return;
  safeRemoveSessionStorage(buildLatchStorageKey(key));
}
