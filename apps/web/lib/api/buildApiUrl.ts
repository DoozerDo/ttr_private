export function buildApiUrl(path: string): string | null {
  const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!rawBase) {
    return null;
  }

  const trimmedBase = rawBase.trim();
  if (!trimmedBase) {
    return null;
  }

  const normalizedBase = trimmedBase.replace(/\/+$/, "");

  const normalizedPath = path.trim().replace(/^\/*/, "");
  const ensuredPath = normalizedPath ? `/${normalizedPath}` : "";

  return `${normalizedBase}${ensuredPath}`;
}
