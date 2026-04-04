import apiRoutes from "./apiRoutes.json";
import type { JobDto } from "./jobs";

const API_ROUTES = {
  jobs: apiRoutes.jobs,
};

const JOBS_API_PATH = API_ROUTES.jobs;

type ListJobsOptions = {
  includeArchived?: boolean;
};

function isServer(): boolean {
  return typeof window === "undefined";
}

function resolveAppOrigin(): string {
  const envOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_ORIGIN ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "";

  if (envOrigin && /^https?:\/\//i.test(envOrigin)) {
    return envOrigin.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}

function buildApiUrl(path: string): string {
  if (!isServer()) return path;
  const origin = resolveAppOrigin();
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function getServerForwardHeaders(): Promise<Record<string, string> | undefined> {
  if (!isServer()) return undefined;

  try {
    const mod = await import("next/headers");

    // Next 16 dynamic APIs can be async.
    const hdrs = await (mod.headers as unknown as () => Promise<Headers>)();
    const cookieStore = await (mod.cookies as unknown as () => Promise<{ toString: () => string }>)();

    const forwarded: Record<string, string> = {};

    const cookieHeader = cookieStore.toString();
    if (cookieHeader) forwarded.cookie = cookieHeader;

    const authHeader = hdrs.get("authorization");
    if (authHeader) forwarded.authorization = authHeader;

    return Object.keys(forwarded).length ? forwarded : undefined;
  } catch {
    return undefined;
  }
}

async function parseErrorMessage(response: Response, action: string): Promise<string> {
  const statusText = response.statusText?.trim();
  const statusLabel = statusText ? `${response.status} ${statusText}` : `${response.status}`;
  const fallback = `${action} failed (${statusLabel})`;
  const body = await response.text().catch(() => "");

  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const message =
      (typeof parsed?.message === "string" && parsed.message.trim()) ||
      (typeof parsed?.error === "string" && parsed.error.trim());

    if (message) return message.trim();
  } catch {
    // Ignore non JSON responses to avoid showing HTML.
  }

  return fallback;
}

async function ensureJsonResponse<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const message = await parseErrorMessage(response, action);
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Invalid response from ${action}`);
  }

  return (await response.json()) as T;
}

function buildListUrl(options?: ListJobsOptions): string {
  // We always request includeArchived true when possible and filter in UI.
  // If the API supports a query param, we pass it through anyway.
  const includeArchived = options?.includeArchived ?? false;
  const query = includeArchived ? "?includeArchived=true" : "";
  return `${JOBS_API_PATH}${query}`;
}

export async function listJobs(options?: ListJobsOptions): Promise<JobDto[]> {
  const url = buildApiUrl(buildListUrl(options));
  const forwardedHeaders = await getServerForwardHeaders();

  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: forwardedHeaders,
  });

  return ensureJsonResponse<JobDto[]>(response, "Load jobs");
}

export async function getJob(jobId: string): Promise<JobDto> {
  const encodedId = encodeURIComponent(jobId);
  const url = buildApiUrl(`${JOBS_API_PATH}/${encodedId}`);

  const forwardedHeaders = await getServerForwardHeaders();

  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: forwardedHeaders,
  });

  return ensureJsonResponse<JobDto>(response, "Load job");
}

export async function archiveJob(jobId: string): Promise<JobDto> {
  const encodedId = encodeURIComponent(jobId);
  const url = buildApiUrl(`${JOBS_API_PATH}/${encodedId}/archive`);

  const forwardedHeaders = await getServerForwardHeaders();

  const response = await fetch(url, {
    method: "PATCH",
    cache: "no-store",
    credentials: "include",
    headers: forwardedHeaders,
  });

  return ensureJsonResponse<JobDto>(response, "Archive job");
}

export async function restoreJob(jobId: string): Promise<JobDto> {
  const encodedId = encodeURIComponent(jobId);
  const url = buildApiUrl(`${JOBS_API_PATH}/${encodedId}/restore`);

  const forwardedHeaders = await getServerForwardHeaders();

  const response = await fetch(url, {
    method: "PATCH",
    cache: "no-store",
    credentials: "include",
    headers: forwardedHeaders,
  });

  return ensureJsonResponse<JobDto>(response, "Restore job");
}
