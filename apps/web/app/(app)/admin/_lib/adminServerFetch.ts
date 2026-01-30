import { cookies, headers } from "next/headers";

function resolveAdminApiBase(): string {
  const rawServer = process.env.API_BASE_URL?.trim();
  const rawPublic = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const candidate = rawServer || rawPublic;

  if (candidate) {
    return candidate.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("API_BASE_URL or NEXT_PUBLIC_API_BASE_URL must be configured in production.");
  }

  return "http://localhost:3000";
}

async function collectForwardHeaders(): Promise<Record<string, string> | undefined> {
  const forwarded: Record<string, string> = {};
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    forwarded.cookie = cookieHeader;
  }

  const resolvedHeaders = await headers();
  const authHeader = resolvedHeaders.get("authorization");
  if (authHeader) {
    forwarded.authorization = authHeader;
  }

  return Object.keys(forwarded).length ? forwarded : undefined;
}

async function parseApiError(response: Response, action: string): Promise<string> {
  const statusText = response.statusText?.trim();
  const statusLabel = statusText ? `${response.status} ${statusText}` : `${response.status}`;
  const fallback = `${action} failed (${statusLabel})`;

  const body = await response.text().catch(() => "");
  if (!body) {
    return fallback;
  }

  const snippet = body.length > 200 ? `${body.slice(0, 200)}...` : body;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const message =
      (typeof parsed?.message === "string" && parsed.message.trim()) ||
      (typeof parsed?.error === "string" && parsed.error.trim());
    if (message) {
      return `${action} failed: ${message}`;
    }
  } catch {
    // Ignore non-JSON error payloads.
  }

  return `${fallback}: ${snippet}`;
}

async function ensureJsonResponse<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const message = await parseApiError(response, action);
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${action} returned unexpected content type`);
  }

  return (await response.json()) as T;
}

export async function adminServerFetch<T>(
  path: string,
  action: string,
  init?: RequestInit,
): Promise<T> {
  const apiBase = resolveAdminApiBase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${apiBase}${normalizedPath}`;
  const forwardedHeaders = await collectForwardHeaders();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      ...init,
      headers: forwardedHeaders
        ? { ...(init?.headers ?? {}), ...forwardedHeaders }
        : init?.headers,
    });

    return ensureJsonResponse<T>(response, action);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Fetch ${url} failed: ${message}`);
  }
}

// Verification checklist:
// 1. Log in via /auth/login and confirm access_token cookie is present for localhost:3000.
// 2. Request /admin/users; adminServerFetch should send the Cookie header to the API.
// 3. Ensure /admin/users returns the list without "Admin access required".
