"use client";

export type RecentIntentState =
  | "used_and_committed"
  | "used_not_committed"
  | "refine_intent"
  | null;

const ARTIFACT_USED_KEY = "ttr-recent-intent:artifact-used";
const OPPORTUNITY_COMMIT_KEY = "ttr-recent-intent:opportunity-commit";
const ARTIFACT_REFINE_KEY = "ttr-recent-intent:artifact-refine";
const memorySignals = new Map<string, string>();

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  memorySignals.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function safeStorageRemove(key: string) {
  memorySignals.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
}

function writeSignal(key: string) {
  if (typeof window === "undefined") return;
  safeStorageSet(key, new Date().toISOString());
}

function readSignalTime(key: string): number {
  const raw = memorySignals.get(key) ?? safeStorageGet(key);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function recordArtifactUsedIntent() {
  writeSignal(ARTIFACT_USED_KEY);
}

export function recordOpportunityCommitIntent() {
  writeSignal(OPPORTUNITY_COMMIT_KEY);
}

export function recordArtifactRefineIntent() {
  writeSignal(ARTIFACT_REFINE_KEY);
}

export function clearRecentIntentSignals() {
  if (typeof window === "undefined") return;
  safeStorageRemove(ARTIFACT_USED_KEY);
  safeStorageRemove(OPPORTUNITY_COMMIT_KEY);
  safeStorageRemove(ARTIFACT_REFINE_KEY);
}

export function readRecentIntentState(): RecentIntentState {
  if (typeof window === "undefined") return null;

  const usedAt = readSignalTime(ARTIFACT_USED_KEY);
  const committedAt = readSignalTime(OPPORTUNITY_COMMIT_KEY);
  const refineAt = readSignalTime(ARTIFACT_REFINE_KEY);

  if (refineAt && refineAt >= usedAt && refineAt >= committedAt) {
    return "refine_intent";
  }
  if (usedAt && committedAt && committedAt >= usedAt) {
    return "used_and_committed";
  }
  if (usedAt) {
    return "used_not_committed";
  }
  return null;
}
