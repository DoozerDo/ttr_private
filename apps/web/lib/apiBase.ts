const LOCAL_DEFAULT = "http://localhost:3001";
const DOCKER_DEFAULT = "http://api:3001";

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function isDockerEnvironment(): boolean {
  if (process.env.DOCKER?.toLowerCase() === "true") {
    return true;
  }

  const hostname = process.env.HOSTNAME?.toLowerCase() ?? "";
  if (hostname && (hostname.includes("docker") || hostname.includes("container"))) {
    return true;
  }

  return false;
}

export function getServerApiBaseUrl(): string {
  const serverOnly = normalizeBaseUrl(process.env.API_BASE_URL);
  if (serverOnly) {
    return serverOnly;
  }

  const publicFallback = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (publicFallback) {
    return publicFallback;
  }

  return isDockerEnvironment() ? DOCKER_DEFAULT : LOCAL_DEFAULT;
}

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
