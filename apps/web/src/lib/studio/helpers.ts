export type ResumeFocusOption =
  | "Auto (recommended)"
  | "Operational Leadership"
  | "Technical Depth"
  | "Customer Experience Strategy"
  | "Scaling Operations";

export type StudioCardStatus =
  | "not_generated_yet"
  | "ready_to_generate"
  | "generating"
  | "generated_successfully"
  | "blocked_by_compliance"
  | "failed_due_to_system_error";

type SafeDisplayPayload = {
  title?: string;
  description?: string;
  reasons?: string[];
  cta?: {
    label?: string;
    href?: string;
  };
};

export type StudioGenerationPresenter = {
  status: "success" | "blocked" | "error" | "unknown";
  hasExportableContent: boolean;
  display: {
    title: string;
    description: string;
    reasons: string[];
    cta?: {
      label: string;
      href: string;
    };
  } | null;
};

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

function readSafeDisplay(payload: unknown): SafeDisplayPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidate = (record.safeDisplay ?? record.display) as unknown;
  if (!candidate || typeof candidate !== "object") return null;
  const displayRecord = candidate as Record<string, unknown>;

  const title = trimToString(displayRecord.title) || undefined;
  const description = trimToString(displayRecord.description) || undefined;
  const reasons = Array.isArray(displayRecord.reasons)
    ? displayRecord.reasons
        .map((value) => trimToString(value))
        .filter((value) => value.length > 0)
    : [];
  const ctaRaw = displayRecord.cta;
  const cta =
    ctaRaw && typeof ctaRaw === "object"
      ? {
          label: trimToString((ctaRaw as Record<string, unknown>).label) || undefined,
          href: trimToString((ctaRaw as Record<string, unknown>).href) || undefined,
        }
      : undefined;

  if (!title && !description && !reasons.length && !cta?.href) {
    return null;
  }

  return { title, description, reasons, cta };
}

function mapSafeDisplay(
  payload: SafeDisplayPayload | null,
  fallback: { title: string; description: string; reasons?: string[] },
) {
  if (!payload) {
    return {
      title: fallback.title,
      description: fallback.description,
      reasons: fallback.reasons ?? [],
      cta: undefined,
    };
  }

  const reasons =
    payload.reasons?.filter((value) => value.trim().length > 0).slice(0, 4) ??
    fallback.reasons ??
    [];

  const cta =
    payload.cta?.label && payload.cta?.href
      ? {
          label: payload.cta.label,
          href: payload.cta.href,
        }
      : undefined;

  return {
    title: payload.title ?? fallback.title,
    description: payload.description ?? fallback.description,
    reasons,
    cta,
  };
}

function isBlockedPayload(payload: Record<string, unknown>): boolean {
  const generationStatus = trimToString(payload.generationStatus).toLowerCase();
  const status = trimToString(payload.status).toLowerCase();
  if (generationStatus === "blocked") return true;
  if (status === "compliance_blocked" || status === "blocked") return true;
  return Boolean(payload.blocked || payload.compliance_blocked);
}

function isSuccessPayload(payload: Record<string, unknown>): boolean {
  const generationStatus = trimToString(payload.generationStatus).toLowerCase();
  const status = trimToString(payload.status).toLowerCase();
  return generationStatus === "success" || status === "ready" || status === "success";
}

function hasExports(payload: Record<string, unknown>): boolean {
  if (payload.exportReady === true) return true;
  const exportsField = payload.exports;
  if (!exportsField || typeof exportsField !== "object") return false;
  const record = exportsField as Record<string, unknown>;
  return Boolean(record.docx || record.pdf);
}

export function presentResumeGeneration(payload: unknown): StudioGenerationPresenter {
  if (!payload || typeof payload !== "object") {
    return { status: "unknown", hasExportableContent: false, display: null };
  }
  const record = payload as Record<string, unknown>;
  const blocked = isBlockedPayload(record);
  const success = isSuccessPayload(record);
  const previewResume =
    record.preview &&
    typeof record.preview === "object" &&
    (record.preview as Record<string, unknown>).resume &&
    typeof (record.preview as Record<string, unknown>).resume === "object";
  if (blocked) {
    return {
      status: "blocked",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Resume blocked by compliance",
        description:
          "Some generated statements could not be verified against your baseline.",
      }),
    };
  }

  if (success && previewResume) {
    return {
      status: "success",
      hasExportableContent: hasExports(record) && Boolean(previewResume),
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Resume generated successfully",
        description: "Your resume draft is ready for preview and export.",
      }),
    };
  }

  const status = trimToString(record.status).toLowerCase();
  const generationStatus = trimToString(record.generationStatus).toLowerCase();
  if (status === "error" || generationStatus === "error") {
    return {
      status: "error",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Resume generation failed",
        description: "We could not generate a resume from your current inputs.",
      }),
    };
  }

  return { status: "unknown", hasExportableContent: false, display: null };
}

export function presentCoverLetterGeneration(payload: unknown): StudioGenerationPresenter {
  if (!payload || typeof payload !== "object") {
    return { status: "unknown", hasExportableContent: false, display: null };
  }
  const record = payload as Record<string, unknown>;
  const blocked = isBlockedPayload(record);
  const success = isSuccessPayload(record);
  const previewCover =
    record.preview &&
    typeof record.preview === "object" &&
    (record.preview as Record<string, unknown>).coverLetter &&
    typeof (record.preview as Record<string, unknown>).coverLetter === "object";
  const hasContent = typeof record.content === "string" && record.content.trim().length > 0;

  if (blocked) {
    return {
      status: "blocked",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Cover letter blocked by compliance",
        description:
          "Some generated statements could not be verified against your baseline.",
      }),
    };
  }

  if (success && hasContent) {
    return {
      status: "success",
      hasExportableContent: hasExports(record) || hasContent,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Cover letter generated successfully",
        description: "Your cover letter draft is ready for preview and export.",
      }),
    };
  }

  if (success && previewCover) {
    return {
      status: "success",
      hasExportableContent: hasExports(record),
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Cover letter generated successfully",
        description: "Your cover letter draft is ready for preview and export.",
      }),
    };
  }

  return { status: "unknown", hasExportableContent: false, display: null };
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
  if (typeof payload !== "object") return "";

  const display = readSafeDisplay(payload);
  if (display?.description) {
    return display.description;
  }

  const record = payload as Record<string, unknown>;
  const message = trimToString(record.message);
  if (message) return message;

  return "";
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
  const preview = record.preview;
  if (preview && typeof preview === "object") {
    const cover = (preview as Record<string, unknown>).coverLetter;
    if (cover && typeof cover === "object") {
      const document = cover as Record<string, unknown>;
      const salutation = trimToString(document.salutation);
      const opening = trimToString(document.opening);
      const bodyParagraphs = Array.isArray(document.bodyParagraphs)
        ? document.bodyParagraphs.map((value) => trimToString(value)).filter(Boolean)
        : [];
      const closingParagraph = trimToString(document.closingParagraph);
      const signoff = trimToString(document.signoff);
      const signatureName = trimToString(document.signatureName);
      const assembled = [salutation, opening, ...bodyParagraphs, closingParagraph, signoff, signatureName]
        .filter((value): value is string => Boolean(value))
        .join("\n\n")
        .trim();
      if (assembled) return assembled;
    }
  }
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

