const UPSTREAM_ENV_KEYS = ["API_BASE_URL", "NEXT_PUBLIC_API_BASE_URL"] as const;

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
  if (!selected) {
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

  return selected.value;
}

