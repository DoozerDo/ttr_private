export function getPublicApiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (raw !== undefined) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }

    return trimmed.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return "";
  }

  return null;
}

export function buildPublicApiUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!base || base === "") {
    return `/api${normalizedPath}`;
  }

  return `${base}${normalizedPath}`;
}
