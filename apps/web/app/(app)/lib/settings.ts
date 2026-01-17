import { useCallback, useEffect, useState } from "react";
import { AUTO_GENERATE_THRESHOLD } from "./autoGenerateThreshold";

const SETTINGS_STORAGE_KEY = "ttr.settings.v1";
const MIN_AUTO_GENERATE_THRESHOLD = 50;
const MAX_AUTO_GENERATE_THRESHOLD = 100;

type AppSettings = {
  autoGenerateThreshold: number;
};

const isWindowAvailable = () => typeof window !== "undefined";

function normalizeThreshold(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= MIN_AUTO_GENERATE_THRESHOLD && rounded <= MAX_AUTO_GENERATE_THRESHOLD) {
      return rounded;
    }
  }
  return AUTO_GENERATE_THRESHOLD;
}

function readSettingsFromStorage(): AppSettings {
  if (!isWindowAvailable()) {
    return { autoGenerateThreshold: AUTO_GENERATE_THRESHOLD };
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { autoGenerateThreshold: AUTO_GENERATE_THRESHOLD };
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      autoGenerateThreshold: normalizeThreshold(parsed?.autoGenerateThreshold),
    };
  } catch {
    return { autoGenerateThreshold: AUTO_GENERATE_THRESHOLD };
  }
}

function persistSettings(settings: AppSettings) {
  if (!isWindowAvailable()) return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage failures
  }
}

export function getAutoGenerateThreshold(): number {
  return readSettingsFromStorage().autoGenerateThreshold;
}

export function setAutoGenerateThreshold(value: number): void {
  const normalized = normalizeThreshold(value);
  persistSettings({ autoGenerateThreshold: normalized });
}

export function useAutoGenerateThreshold(): [number, (value: number) => void] {
  const [threshold, setThreshold] = useState(() => getAutoGenerateThreshold());

  useEffect(() => {
    if (!isWindowAvailable()) return undefined;

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== SETTINGS_STORAGE_KEY) return;
      setThreshold(getAutoGenerateThreshold());
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updateThreshold = useCallback(
    (value: number) => {
      setAutoGenerateThreshold(value);
      setThreshold(getAutoGenerateThreshold());
    },
    [],
  );

  return [threshold, updateThreshold];
}
