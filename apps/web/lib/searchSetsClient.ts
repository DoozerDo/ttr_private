import { parseTierGateError, type TierGateError } from "@/lib/tiers";

export type SearchSetDto = {
  id: string;
  titlePatterns: string[];
  seniority: string[];
  industry: string[];
  workMode: string[];
  location: string | null;
  sourceUrl: string | null;
  parseWarning: string | null;
  urlBacked: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  lastRunBaselineVersionId?: string | null;
  lastRunResultCount?: number | null;
};

export type SearchSetRunResult = {
  jobId: string;
  title: string | null;
  company: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  fitScore: number | null;
  verdict: string | null;
  dimensionScores?: Record<string, number | null> | null;
  [key: string]: unknown;
};

export interface SearchSetApiError extends Error {
  tierGate?: TierGateError | null;
  validationErrors?: string[];
  payload?: unknown;
}

function buildSearchSetUrl(id: string, suffix?: string) {
  const encoded = encodeURIComponent(id);
  return suffix ? `/api/search-sets/${encoded}${suffix}` : `/api/search-sets/${encoded}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatError(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    const value =
      (typeof candidate.error === "string" ? candidate.error : null) ??
      (typeof candidate.message === "string" ? candidate.message : null) ??
      (typeof candidate.detail === "string" ? candidate.detail : null);

    if (value) {
      return value;
    }
  }

  return fallback;
}

function readValidationErrors(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const candidate = payload as Record<string, unknown>;

  const raw = Array.isArray(candidate.validationErrors)
    ? candidate.validationErrors
    : Array.isArray(candidate.errors)
      ? candidate.errors
      : typeof candidate.detail === "string"
        ? [candidate.detail]
        : undefined;

  if (!raw) return [];

  const entries: string[] = [];

  raw.forEach((entry) => {
    if (typeof entry === "string") {
      entries.push(entry);
    } else if (entry && typeof entry === "object") {
      const detail = (entry as { message?: string }).message;
      if (typeof detail === "string") {
        entries.push(detail);
      }
    }
  });

  return entries.filter(Boolean);
}

function createApiError(message: string, status: number, payload: unknown): SearchSetApiError {
  const error = new Error(message) as SearchSetApiError;
  error.tierGate = parseTierGateError({ status, payload });
  error.validationErrors = readValidationErrors(payload);
  error.payload = payload;
  return error;
}

async function fetchSearchSet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const message = formatError(payload, response.statusText || "Search Set API error");
    throw createApiError(message, response.status, payload);
  }

  return payload as T;
}

export async function getSearchSet(id: string): Promise<SearchSetDto> {
  return fetchSearchSet<SearchSetDto>(buildSearchSetUrl(id), { cache: "no-store" });
}

export async function runSearchSet(
  id: string,
  baselineVersionId: string,
  limit = 10,
): Promise<SearchSetRunResult[]> {
  return fetchSearchSet<SearchSetRunResult[]>(
    buildSearchSetUrl(id, "/run"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baselineVersionId, limit }),
    },
  );
}
