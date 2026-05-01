// Keep this list permissive: production deployments may provide different naming conventions.
const UPSTREAM_ENV_KEYS = [
  "API_BASE_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_API_URL",
  "API_URL",
  "BACKEND_API_BASE_URL",
] as const;
const DEV_DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

export class UpstreamApiConfigError extends Error {
  code: "UPSTREAM_API_URL_MISSING" | "UPSTREAM_API_URL_MALFORMED";
  details?: Record<string, unknown>;

  constructor(
    code: "UPSTREAM_API_URL_MISSING" | "UPSTREAM_API_URL_MALFORMED",
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UpstreamApiConfigError";
    this.code = code;
    this.details = details;
  }
}

function pickRawUpstreamApiBaseUrl(): { key: string; value: string } | null {
  for (const key of UPSTREAM_ENV_KEYS) {
    const normalized = normalizeBaseUrl(process.env[key]);
    if (normalized) {
      return { key, value: normalized };
    }
  }
  return null;
}

export function getRequiredServerApiBaseUrl(): string {
  const selected = pickRawUpstreamApiBaseUrl();
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";

  if (!selected) {
    if (!isProd) {
      return DEV_DEFAULT_API_BASE_URL;
    }
    throw new UpstreamApiConfigError(
      "UPSTREAM_API_URL_MISSING",
      "Missing upstream API base URL. Set API_BASE_URL for Next.js server-side route handlers.",
      { checkedKeys: [...UPSTREAM_ENV_KEYS] },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(selected.value);
  } catch {
    throw new UpstreamApiConfigError(
      "UPSTREAM_API_URL_MALFORMED",
      `Malformed upstream API base URL in ${selected.key}.`,
      { key: selected.key, value: selected.value },
    );
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new UpstreamApiConfigError(
      "UPSTREAM_API_URL_MALFORMED",
      `Unsupported protocol in ${selected.key}.`,
      { key: selected.key, value: selected.value, protocol: parsed.protocol },
    );
  }

  if (!isProd && parsed.hostname === "localhost") {
    parsed.hostname = "127.0.0.1";
    return parsed.toString().replace(/\/+$/, "");
  }

  return selected.value;
}

