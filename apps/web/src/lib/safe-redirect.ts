const INTERNAL_BASE = "http://internal";

export function sanitizeReturnPath(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }

  if (!candidate.startsWith("/")) {
    return null;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_BASE);
    if (parsed.origin !== INTERNAL_BASE) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
