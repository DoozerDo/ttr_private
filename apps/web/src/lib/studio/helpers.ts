export type ResumeFocusOption =
  | "Auto (recommended)"
  | "Operational Leadership"
  | "Technical Depth"
  | "Customer Experience Strategy"
  | "Scaling Operations";

export function trimToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

export function createDocumentState() {
  return {
    response: null,
    error: null,
    tierGateError: null,
  };
}

export function readTrackerField(source: unknown, key: string): string | undefined {
  if (source === null || source === undefined) return undefined;
  if (typeof source !== "object") return undefined;
  if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined;

  const record = source as Record<string, unknown>;
  const value = record[key];
  if (value === null || value === undefined) return undefined;

  const normalized = typeof value === "string" ? trimToString(value) : String(value).trim();
  return normalized.length ? normalized : undefined;
}

export function collectNormalizedContextValues(
  values: Array<string | null | undefined>,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) continue;

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(normalized);
  }

  return result;
}

export function mapApplicationConfidence(
  score: number | null,
): "Very High" | "High" | "Moderate" | "Low" {
  if (score === null) return "Moderate";
  if (score >= 85) return "Very High";
  if (score >= 70) return "High";
  if (score >= 55) return "Moderate";
  return "Low";
}

export function normalizeAuditId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keys = ["auditId", "audit_id", "id"];
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

export function extractComplianceWarnings(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const raw =
    record.compliance_flags ??
    record.complianceFlags ??
    record.complianceWarnings ??
    record.warningFlags ??
    record.flags ??
    [];
  if (!Array.isArray(raw)) return [];
  const normalized: Array<{ code?: string; message: string; severity?: string }> = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) {
        normalized.push({ message: trimmed });
      }
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const message =
      trimToString(candidate.message) ||
      trimToString(candidate.msg) ||
      trimToString(candidate.description);
    if (!message) continue;
    const code = trimToString(candidate.code) || undefined;
    const severity =
      trimToString(candidate.severity) ||
      trimToString(candidate.flagSeverity) ||
      trimToString(candidate.flag_severity) ||
      undefined;
    normalized.push({
      code,
      message,
      severity,
    });
  }
  return normalized;
}

export function readDuplicateCoverLetterId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const rawError = record.error;
  if (!rawError || typeof rawError !== "object") {
    return undefined;
  }
  const errorRecord = rawError as Record<string, unknown>;
  const code = typeof errorRecord.code === "string" ? errorRecord.code.trim() : undefined;
  if (code !== "COVER_LETTER_DUPLICATE") {
    return undefined;
  }
  const existingId = errorRecord.existingCoverLetterId;
  if (typeof existingId !== "string") {
    return undefined;
  }
  const trimmed = existingId.trim();
  return trimmed || undefined;
}

export function formatPreview(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "Preview unavailable.";
  }
}

function readContentValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const candidate = record.content;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
}

function extractCoverLetterText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const candidateFields: unknown[] = [
    record.content,
    record.letter,
    record.coverLetter,
    record.draft,
    record.generated,
  ];
  for (const candidate of candidateFields) {
    const value = readContentValue(candidate);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function buildCoverLetterParagraphs(payload: unknown): string[] {
  const text = extractCoverLetterText(payload);
  if (!text) return [];
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function getFilenameFromContentDisposition(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const starMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch?.[1]) {
    try {
      return decodeURIComponent(starMatch[1]).trim();
    } catch {
      return starMatch[1].trim();
    }
  }

  const plainMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i);
  const parsed = plainMatch?.[1]?.trim();
  return parsed || null;
}

export function downloadBlob(blob: Blob, fileName: string) {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

