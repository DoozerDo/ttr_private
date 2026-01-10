// apps/web/lib/searchSetsClient.ts

export type SearchSetApiError = {
  message: string;
  status?: number;

  validationErrors?: string[];

  tierGate?: {
    message: string;
    requiredTier?: any;
    currentTier?: any;
    reason?: string;
  } | null;
};

export type SearchSetRunInfo = {
  baselineVersionId?: string | null;
  executedAt?: string | null;
  jobCount?: number | null;
  resultsCount?: number | null;
};

export type SearchSetDto = {
  id: string;

  sourceUrl?: string;
  titlePatterns?: string[];
  seniority?: string[];
  workMode?: string;
  location?: string;

  parseWarning?: string | null;

  createdAt?: string;
  updatedAt?: string;

  lastRun?: SearchSetRunInfo | null;

  lastRunBaselineVersionId?: string | null;
  lastRunAt?: string | null;
  lastRunJobCount?: number | null;
  lastRunResultCount?: number | null;
};

export type SearchSetResultItem = {
  jobId?: string | null;
  title?: string | null;
  company?: string | null;

  verdict?: string | null;
  fitScore?: number | null;

  applyUrl?: string | null;
  sourceUrl?: string | null;

  raw?: Record<string, unknown>;
};

export type SearchSetRunResult = {
  results?: SearchSetResultItem[];
  raw?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v) => typeof v === "string") as string[];
  return out.length ? out : [];
}

function normalizeTierGate(value: unknown): SearchSetApiError["tierGate"] | undefined {
  if (!isObject(value)) return undefined;

  const requiredTierRaw = typeof value.requiredTier === "string" ? value.requiredTier : undefined;
  const currentTierRaw = typeof value.currentTier === "string" ? value.currentTier : undefined;
  const reason = typeof value.reason === "string" ? value.reason : undefined;

  const message =
    typeof value.message === "string" && value.message.trim()
      ? value.message
      : requiredTierRaw
      ? `This action requires ${requiredTierRaw}.`
      : "This action is not available for your current tier.";

  return {
    message,
    requiredTier: requiredTierRaw as any,
    currentTier: currentTierRaw as any,
    reason,
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });

  if (res.status === 401) {
    throw new Error("unauthorized");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));

    const validationErrors = Array.isArray((data as any)?.validationErrors)
      ? ((data as any).validationErrors.filter((v: any) => typeof v === "string") as string[])
      : undefined;

    const tierGate = normalizeTierGate((data as any)?.tierGate);

    const message =
      (data as any)?.message ||
      (data as any)?.error ||
      tierGate?.message ||
      "Request failed";

    const err: SearchSetApiError = {
      message,
      status: res.status,
      validationErrors,
      tierGate: tierGate ?? undefined,
    };

    throw err;
  }

  return (await res.json()) as T;
}

function normalizeSearchSetDto(value: unknown): SearchSetDto {
  if (!isObject(value) || typeof value.id !== "string" || !value.id.trim()) {
    throw { message: "Unexpected response from getSearchSet." } as SearchSetApiError;
  }

  const lastRunRaw = isObject(value.lastRun) ? value.lastRun : null;

  const lastRun: SearchSetRunInfo | null = lastRunRaw
    ? {
        baselineVersionId: asNullableString(lastRunRaw.baselineVersionId),
        executedAt: asNullableString(lastRunRaw.executedAt),
        jobCount: asNullableNumber(lastRunRaw.jobCount),
        resultsCount: asNullableNumber(lastRunRaw.resultsCount),
      }
    : null;

  const parseWarning = asNullableString((value as any).parseWarning);

  return {
    id: value.id,

    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : undefined,
    titlePatterns: asStringArray(value.titlePatterns),
    seniority: asStringArray(value.seniority),
    workMode: typeof value.workMode === "string" ? value.workMode : undefined,
    location: typeof value.location === "string" ? value.location : undefined,

    parseWarning: parseWarning ?? null,

    createdAt: typeof value.createdAt === "string" ? value.createdAt : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,

    lastRun,

    lastRunBaselineVersionId: lastRun?.baselineVersionId ?? null,
    lastRunAt: lastRun?.executedAt ?? null,
    lastRunJobCount: typeof lastRun?.jobCount === "number" ? lastRun.jobCount : null,
    lastRunResultCount: typeof lastRun?.resultsCount === "number" ? lastRun.resultsCount : null,
  };
}

function normalizeSearchSetResultItem(value: unknown): SearchSetResultItem {
  const entry = isObject(value) ? value : undefined;

  const jobId = asNullableString(entry?.jobId);
  const title = asNullableString(entry?.title);
  const company = asNullableString(entry?.company);

  const verdict = asNullableString(entry?.verdict);
  const fitScore = asNullableNumber(entry?.fitScore);

  const applyUrl = asNullableString(entry?.applyUrl);
  const sourceUrl = asNullableString(entry?.sourceUrl);

  return {
    jobId: jobId ?? null,
    title: title ?? null,
    company: company ?? null,
    verdict: verdict ?? null,
    fitScore: fitScore ?? null,
    applyUrl: applyUrl ?? null,
    sourceUrl: sourceUrl ?? null,
    raw: entry,
  };
}

export function normalizeSearchSetRunResult(value: unknown): SearchSetResultItem[] {
  if (Array.isArray(value)) {
    return value.map(normalizeSearchSetResultItem);
  }

  if (isObject(value)) {
    const nestedResults = value.results;
    if (Array.isArray(nestedResults)) {
      return nestedResults.map(normalizeSearchSetResultItem);
    }
  }

  return [];
}

export async function getSearchSet(id: string) {
  const raw = await api<unknown>(`/api/search-sets/${id}`, { cache: "no-store" });
  return normalizeSearchSetDto(raw);
}

export async function runSearchSet(
  id: string,
  baselineVersionId?: string | null,
  limit?: number
): Promise<SearchSetRunResult> {
  const params = new URLSearchParams();

  if (baselineVersionId) {
    params.set("baselineVersionId", baselineVersionId);
  }

  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.set("limit", String(limit));
  }

  const url = params.toString()
    ? `/api/search-sets/${id}/run?${params.toString()}`
    : `/api/search-sets/${id}/run`;

  const raw = await api<unknown>(url, { method: "POST" });
  return {
    raw,
    results: normalizeSearchSetRunResult(raw),
  };
}
