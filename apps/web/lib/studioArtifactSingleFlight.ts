export type StudioArtifactType = "resume" | "cover_letter";

type SingleFlightRecord = {
  requestId: string;
  acquiredAt: number;
};

const STORAGE_PREFIX = "ttr:studio_artifact_single_flight:v1:";
const DEFAULT_TTL_MS = 2 * 60 * 1000;
const memoryLocks = new Map<string, SingleFlightRecord>();

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

function normalizeId(value: string | null): string {
  return (value ?? "").trim();
}

function resolveTtlMs(inputTtlMs?: number): number {
  return typeof inputTtlMs === "number" && Number.isFinite(inputTtlMs) ? inputTtlMs : DEFAULT_TTL_MS;
}

function pruneIfExpired(storageKey: string, ttlMs: number): void {
  const mem = memoryLocks.get(storageKey);
  if (mem?.acquiredAt && nowMs() - mem.acquiredAt > ttlMs) {
    memoryLocks.delete(storageKey);
  }

  const raw = safeReadSessionStorage(storageKey);
  if (!raw) return;
  try {
    const record = JSON.parse(raw) as Partial<SingleFlightRecord>;
    const acquiredAt = typeof record.acquiredAt === "number" ? record.acquiredAt : 0;
    if (!acquiredAt) {
      safeRemoveSessionStorage(storageKey);
      return;
    }
    if (nowMs() - acquiredAt > ttlMs) {
      safeRemoveSessionStorage(storageKey);
    }
  } catch {
    safeRemoveSessionStorage(storageKey);
  }
}

export function buildStudioArtifactSingleFlightKey(input: {
  baselineId: string | null;
  jobId: string | null;
  analysisId: string | null;
  artifactType: StudioArtifactType;
}): string | null {
  const baselineId = normalizeId(input.baselineId);
  const jobId = normalizeId(input.jobId);
  const analysisId = normalizeId(input.analysisId);
  if (!baselineId || !jobId || !analysisId) return null;
  return `${STORAGE_PREFIX}${baselineId}:${jobId}:${analysisId}:${input.artifactType}`;
}

export function isStudioArtifactSingleFlightInFlight(input: {
  baselineId: string | null;
  jobId: string | null;
  analysisId: string | null;
  artifactType: StudioArtifactType;
  ttlMs?: number;
}): boolean {
  const storageKey = buildStudioArtifactSingleFlightKey(input);
  if (!storageKey) return false;
  const ttlMs = resolveTtlMs(input.ttlMs);

  pruneIfExpired(storageKey, ttlMs);

  const mem = memoryLocks.get(storageKey);
  if (mem?.acquiredAt && nowMs() - mem.acquiredAt <= ttlMs) {
    return true;
  }
  const raw = safeReadSessionStorage(storageKey);
  if (!raw) return false;
  try {
    const record = JSON.parse(raw) as Partial<SingleFlightRecord>;
    const acquiredAt = typeof record.acquiredAt === "number" ? record.acquiredAt : 0;
    if (!acquiredAt) return false;
    return nowMs() - acquiredAt <= ttlMs;
  } catch {
    return false;
  }
}

export function acquireStudioArtifactSingleFlight(input: {
  baselineId: string | null;
  jobId: string | null;
  analysisId: string | null;
  artifactType: StudioArtifactType;
  requestId: string;
  ttlMs?: number;
}): { acquired: boolean; reason: "missing_pair_context" | "already_in_flight" | "acquired" } {
  const storageKey = buildStudioArtifactSingleFlightKey(input);
  if (!storageKey) {
    return { acquired: false, reason: "missing_pair_context" };
  }

  const ttlMs = resolveTtlMs(input.ttlMs);

  // Ensure old locks don't deadlock the UI if a previous request never reported a terminal state.
  pruneIfExpired(storageKey, ttlMs);

  const mem = memoryLocks.get(storageKey);
  if (mem?.acquiredAt && nowMs() - mem.acquiredAt <= ttlMs) {
    return { acquired: false, reason: "already_in_flight" };
  }

  const raw = safeReadSessionStorage(storageKey);
  if (raw) {
    try {
      const existing = JSON.parse(raw) as Partial<SingleFlightRecord>;
      const acquiredAt = typeof existing.acquiredAt === "number" ? existing.acquiredAt : 0;
      if (acquiredAt && nowMs() - acquiredAt <= ttlMs) {
        return { acquired: false, reason: "already_in_flight" };
      }
    } catch {
      // overwrite invalid records
    }
  }

  memoryLocks.set(storageKey, { requestId: input.requestId, acquiredAt: nowMs() });
  safeWriteSessionStorage(
    storageKey,
    JSON.stringify({
      requestId: input.requestId,
      acquiredAt: nowMs(),
    } satisfies SingleFlightRecord),
  );

  return { acquired: true, reason: "acquired" };
}

export function releaseStudioArtifactSingleFlight(input: {
  baselineId: string | null;
  jobId: string | null;
  analysisId: string | null;
  artifactType: StudioArtifactType;
}) {
  const storageKey = buildStudioArtifactSingleFlightKey(input);
  if (!storageKey) return;
  memoryLocks.delete(storageKey);
  safeRemoveSessionStorage(storageKey);
}

// Test-only helper: this module keeps an in-memory shadow map to avoid repeated storage reads.
// Unit tests must reset it to prevent cross-test coupling.
export function __resetStudioArtifactSingleFlightForTests() {
  memoryLocks.clear();
}
