import apiRoutes from "./apiRoutes.json";
import type { JobDto } from "./jobs";

const API_ROUTES = {
  jobs: apiRoutes.jobs,
};

const JOBS_API_PATH = API_ROUTES.jobs;

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

    // In this Next version, these can be async.
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
    // Ignore non-JSON responses to avoid showing HTML.
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
