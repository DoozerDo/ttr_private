"use client";

export const BASELINE_UPDATED_EVENT = "ttr:baseline-updated";
const BASELINE_UPDATED_STORAGE_KEY = "ttr:baseline-updated-at";

export type BaselineUpdatedDetail = {
  baselineId?: string | null;
  source?: "analysis" | "baseline" | "interview" | "policy" | "unknown";
  updatedAt?: string;
};

type BaselineUpdatedPayload = {
  baselineId: string | null;
  source: "analysis" | "baseline" | "interview" | "policy" | "unknown";
  updatedAt: string;
};

export function publishBaselineUpdated(detail: BaselineUpdatedDetail = {}) {
  if (typeof window === "undefined") return;

  const payload: BaselineUpdatedPayload = {
    baselineId: detail.baselineId ?? null,
    source: detail.source ?? "unknown",
    updatedAt: detail.updatedAt ?? new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent<BaselineUpdatedPayload>(BASELINE_UPDATED_EVENT, { detail: payload }));
  const storage = window.localStorage;
  if (storage && typeof storage.setItem === "function") {
    storage.setItem(BASELINE_UPDATED_STORAGE_KEY, payload.updatedAt);
  }
}

export function subscribeBaselineUpdated(
  onUpdate: (detail: BaselineUpdatedDetail) => void | Promise<void>,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onCustomEvent = (event: Event) => {
    const custom = event as CustomEvent<BaselineUpdatedPayload>;
    void onUpdate(custom.detail ?? {});
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== BASELINE_UPDATED_STORAGE_KEY) return;
    void onUpdate({ source: "unknown", updatedAt: event.newValue ?? undefined });
  };

  window.addEventListener(BASELINE_UPDATED_EVENT, onCustomEvent as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(BASELINE_UPDATED_EVENT, onCustomEvent as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
