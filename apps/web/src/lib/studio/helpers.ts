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
  | "needs_more_baseline_detail"
  | "failed_due_to_system_error";

export type ArtifactFailureCategory =
  | "unsupported_input"
  | "validation_failure"
  | "trace_failure"
  | "generation_blocked"
  | "generation_failed";

export type ArtifactFailurePayload = {
  code: string;
  category: ArtifactFailureCategory;
  message: string;
  detail?: string;
  retryable: boolean;
  userAction?: {
    title: string;
    description: string;
  };
  diagnostics?: {
    failureReasons?: string[];
    unsupportedEnvelope?: string;
    traceCoverage?: number;
    missingRequirements?: string[];
  };
};

export type StudioArtifactFailurePresentation = {
  headline: string;
  explanation: string;
  nextStep: string;
  retryable: boolean;
  category: ArtifactFailureCategory;
  code: string;
  userAction?: {
    title: string;
    description: string;
  };
  diagnostics?: ArtifactFailurePayload["diagnostics"];
  detail?: string;
};

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
  failure?: StudioArtifactFailurePresentation | null;
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
    artifactFailure: null,
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

function trimMessage(value: unknown): string {
  return trimToString(value).replace(/\s+/g, " ").trim();
}

export function readArtifactFailurePayload(payload: unknown): ArtifactFailurePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidate =
    record.response && typeof record.response === "object"
      ? (record.response as Record<string, unknown>)
      : record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : record;

  const code = trimToString(candidate.code);
  const category = trimToString(candidate.category) as ArtifactFailureCategory;
  const message = trimMessage(candidate.message);
  const retryable =
    candidate.retryable === true ||
    trimToString(candidate.retryable).toLowerCase() === "true";

  const validCategories: ArtifactFailureCategory[] = [
    "unsupported_input",
    "validation_failure",
    "trace_failure",
    "generation_blocked",
    "generation_failed",
  ];
  if (!code || !message || !validCategories.includes(category)) return null;

  const userActionRaw = candidate.userAction;
  const userAction =
    userActionRaw && typeof userActionRaw === "object"
      ? {
          title: trimToString((userActionRaw as Record<string, unknown>).title),
          description: trimToString((userActionRaw as Record<string, unknown>).description),
        }
      : undefined;

  const diagnosticsRaw = candidate.diagnostics;
  const diagnostics =
    diagnosticsRaw && typeof diagnosticsRaw === "object"
      ? {
          failureReasons: Array.isArray((diagnosticsRaw as Record<string, unknown>).failureReasons)
            ? ((diagnosticsRaw as Record<string, unknown>).failureReasons as unknown[])
                .map((value) => trimToString(value))
                .filter(Boolean)
            : undefined,
          unsupportedEnvelope: trimToString(
            (diagnosticsRaw as Record<string, unknown>).unsupportedEnvelope,
          ),
          traceCoverage:
            typeof (diagnosticsRaw as Record<string, unknown>).traceCoverage === "number"
              ? ((diagnosticsRaw as Record<string, unknown>).traceCoverage as number)
              : undefined,
          missingRequirements: Array.isArray(
            (diagnosticsRaw as Record<string, unknown>).missingRequirements,
          )
            ? ((diagnosticsRaw as Record<string, unknown>).missingRequirements as unknown[])
                .map((value) => trimToString(value))
                .filter(Boolean)
            : undefined,
        }
      : undefined;

  return {
    code,
    category,
    message,
    detail: trimMessage(candidate.detail) || undefined,
    retryable,
    userAction: userAction?.title || userAction?.description ? userAction : undefined,
    diagnostics,
  };
}

export function readArtifactFailurePresentation(
  payload: unknown,
): StudioArtifactFailurePresentation | null {
  const failure = readArtifactFailurePayload(payload);
  return failure ? presentArtifactFailure(failure) : null;
}

function presentArtifactFailure(failure: ArtifactFailurePayload): StudioArtifactFailurePresentation {
  const base: Record<ArtifactFailureCategory, { headline: string; explanation: string; nextStep: string }> = {
    unsupported_input: {
      headline: "This input isn’t supported yet",
      explanation:
        failure.detail ||
        "The current input does not match the supported artifact contract for this generator.",
      nextStep:
        failure.userAction?.title ||
        "Review the unsupported input requirements before trying again.",
    },
    validation_failure: {
      headline: "We couldn’t generate this artifact",
      explanation:
        failure.detail ||
        "The artifact could not be completed because the generated structure did not pass validation.",
      nextStep:
        failure.userAction?.title ||
        "Review the structure requirements and adjust the source content.",
    },
    trace_failure: {
      headline: "We couldn’t verify this safely",
      explanation:
        failure.detail ||
        "The artifact could not be verified against baseline evidence with enough confidence to return safely.",
      nextStep:
        failure.userAction?.title ||
        "Add or repair baseline evidence so every content line can be traced.",
    },
    generation_blocked: {
      headline: "You’re not ready to generate yet",
      explanation:
        failure.detail ||
        "A readiness or compliance gate is preventing generation right now.",
      nextStep:
        failure.userAction?.title ||
        "Complete the missing baseline requirements before generating again.",
    },
    generation_failed: {
      headline: "Generation didn’t complete",
      explanation:
        failure.detail ||
        "The artifact generator could not produce a valid result from the current inputs.",
      nextStep:
        failure.userAction?.title ||
        "Review the input and try again with stronger baseline evidence.",
    },
  };

  const copy = base[failure.category];
  return {
    headline: copy.headline,
    explanation: failure.message || copy.explanation,
    nextStep: failure.userAction?.description || copy.nextStep,
    retryable: failure.retryable,
    category: failure.category,
    code: failure.code,
    userAction: failure.userAction,
    diagnostics: failure.diagnostics,
    detail: failure.detail,
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

function looksLikeNoEvidenceState(payload: Record<string, unknown>): boolean {
  const status = trimToString(payload.status).toLowerCase();
  const generationStatus = trimToString(payload.generationStatus).toLowerCase();
  const message = formatPreview(payload).toLowerCase();
  const safe = readSafeDisplay(payload);
  const safeText = `${safe?.title ?? ""} ${safe?.description ?? ""}`.toLowerCase();
  if (status === "no_evidence" || generationStatus === "no_evidence") return true;
  return (
    message.includes("no evidence") ||
    safeText.includes("no evidence") ||
    message.includes("no verified baseline evidence") ||
    safeText.includes("no verified baseline evidence")
  );
}

export function presentResumeGeneration(payload: unknown): StudioGenerationPresenter {
  if (!payload || typeof payload !== "object") {
    return { status: "unknown", hasExportableContent: false, display: null };
  }
  const record = payload as Record<string, unknown>;
  const artifactFailure = readArtifactFailurePayload(payload);
  if (artifactFailure) {
    return {
      status: artifactFailure.category === "generation_blocked" ? "blocked" : "error",
      hasExportableContent: false,
      display: null,
      failure: presentArtifactFailure(artifactFailure),
    };
  }
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
        reasons: ["Review flagged items in Results and adjust baseline evidence."],
      }),
      failure: null,
    };
  }

  if (looksLikeNoEvidenceState(record)) {
    return {
      status: "error",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Additional baseline detail required",
        description:
          "We could not assemble strong role specific bullets from your baseline. You can still generate a draft using your existing verified experience.",
        reasons: ["Add or promote baseline evidence, then regenerate."],
      }),
      failure: null,
    };
  }

  if (success && previewResume) {
    return {
      status: "success",
      hasExportableContent: hasExports(record) && Boolean(previewResume),
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Resume generated",
        description: "Verified baseline evidence was assembled into a draft.",
        reasons: ["Review the draft and export DOCX or PDF."],
      }),
      failure: null,
    };
  }

  const status = trimToString(record.status).toLowerCase();
  const generationStatus = trimToString(record.generationStatus).toLowerCase();
  if (status === "error" || generationStatus === "error") {
    return {
      status: "error",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Resume failed to generate",
        description: "We could not generate a resume from your current inputs.",
        reasons: ["Retry after confirming baseline and role targeting inputs."],
      }),
      failure: null,
    };
  }

  return { status: "unknown", hasExportableContent: false, display: null, failure: null };
}

export function presentCoverLetterGeneration(payload: unknown): StudioGenerationPresenter {
  if (!payload || typeof payload !== "object") {
    return { status: "unknown", hasExportableContent: false, display: null };
  }
  const record = payload as Record<string, unknown>;
  const artifactFailure = readArtifactFailurePayload(payload);
  if (artifactFailure) {
    return {
      status: artifactFailure.category === "generation_blocked" ? "blocked" : "error",
      hasExportableContent: false,
      display: null,
      failure: presentArtifactFailure(artifactFailure),
    };
  }
  const blocked = isBlockedPayload(record);
  const success = isSuccessPayload(record);
  const coverParagraphs = buildCoverLetterParagraphs(payload);
  const hasPreviewCover = coverParagraphs.length > 0;
  const hasWarnings = extractComplianceWarnings(payload).some((flag) => {
    const severity = trimToString(flag.severity).toLowerCase();
    return severity === "warn" || severity === "warning";
  });

  if (blocked) {
    return {
      status: "blocked",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Cover letter blocked by compliance",
        description:
          "Some generated statements could not be verified against your baseline.",
        reasons: ["Review flagged items in Results and adjust baseline evidence."],
      }),
      failure: null,
    };
  }

  if (looksLikeNoEvidenceState(record)) {
    return {
      status: "error",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "No evidence available",
        description: "Cover letter generation needs more verified baseline evidence.",
        reasons: ["Add or promote baseline evidence, then regenerate."],
      }),
      failure: null,
    };
  }

  if (success && hasPreviewCover) {
    const defaultDescription = hasWarnings
      ? "Verification signals detected. Personalization may be limited."
      : "Your cover letter draft is ready for preview and export.";
    const defaultReason = hasWarnings
      ? "Review the draft before exporting."
      : "Review the generated draft and download DOCX or PDF.";
    return {
      status: "success",
      hasExportableContent: hasExports(record),
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Cover letter generated successfully",
        description: defaultDescription,
        reasons: [defaultReason],
      }),
      failure: null,
    };
  }

  const status = trimToString(record.status).toLowerCase();
  const generationStatus = trimToString(record.generationStatus).toLowerCase();
  if (status === "error" || generationStatus === "error") {
    return {
      status: "error",
      hasExportableContent: false,
      display: mapSafeDisplay(readSafeDisplay(payload), {
        title: "Cover letter failed to generate",
        description: "We could not generate a cover letter from your current inputs.",
        reasons: ["Retry after confirming baseline and role targeting inputs."],
      }),
      failure: null,
    };
  }

  return { status: "unknown", hasExportableContent: false, display: null, failure: null };
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

function normalizeCoverLetterParagraph(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,;:!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COVER_LETTER_BULLET_PREFIX = /^(?:[•*\-]\s+|\d{1,2}[.)]\s+)/;
const RESUME_HEADING_PATTERN =
  /^(?:employment history|professional experience|work experience|education|skills|summary|experience)$/i;
const RESUME_DATE_RANGE_PATTERN =
  /\b(?:19|20)\d{2}\s*[-–]\s*(?:present|current|(?:19|20)\d{2})\b/i;
const RESUME_EMPLOYMENT_BLOCK_PATTERN =
  /\b[A-Za-z][A-Za-z0-9&.'\-/\s]+(?:\||,)\s*[A-Za-z][A-Za-z0-9&.'\-/\s]+(?:\||,)\s*(?:19|20)\d{2}\b/i;

function isLikelyResumeLeakParagraph(paragraph: string): boolean {
  const value = paragraph.trim();
  if (!value) return true;
  if (RESUME_HEADING_PATTERN.test(value)) return true;
  if (COVER_LETTER_BULLET_PREFIX.test(value)) return true;
  if (RESUME_EMPLOYMENT_BLOCK_PATTERN.test(value)) return true;
  if (
    RESUME_DATE_RANGE_PATTERN.test(value) &&
    /\b(?:location|remote|onsite|hybrid|san|new york|seattle|austin|ca|ny|tx)\b/i.test(value)
  ) {
    return true;
  }
  if (/^[A-Z][A-Za-z .,'-]+ \| [A-Z][A-Za-z .,'-]+ \| (?:19|20)\d{2}/.test(value)) return true;
  if (/^(?:generated from verified evidence|verified baseline used|baseline evidence|job description|resume fragment|candidate profile)$/i.test(value)) {
    return true;
  }
  return false;
}

function stripBulletPrefix(value: string): string {
  return value.replace(COVER_LETTER_BULLET_PREFIX, "").trim();
}

function removeInlineGreeting(value: string): string {
  return value.replace(/^dear hiring team[,]?\s*/i, "").trim();
}

function splitInlineClosing(value: string): { content: string; hasSignoff: boolean } {
  const match = value.match(/\bsincerely[,]?/i);
  if (!match || typeof match.index !== "number") {
    return { content: value.trim(), hasSignoff: false };
  }
  return {
    content: value.slice(0, match.index).trim(),
    hasSignoff: true,
  };
}

function isSignatureLine(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return /^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z'.-]+){0,3}$/.test(normalized);
}

export function normalizeCoverLetterParagraphs(paragraphs: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  let salutationSeen = false;
  let signoffSeen = false;
  let signatureLine = "";
  const body: string[] = [];

  for (const raw of paragraphs) {
    const cleaned = stripBulletPrefix(trimToString(raw));
    if (!cleaned) continue;
    if (isLikelyResumeLeakParagraph(cleaned)) continue;

    const normalized = normalizeCoverLetterParagraph(cleaned);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    if (/^dear hiring team[,]?$/i.test(cleaned)) {
      salutationSeen = true;
      continue;
    }

    if (/^dear hiring team[,]?\s+/i.test(cleaned)) {
      salutationSeen = true;
    }

    const withoutGreeting = removeInlineGreeting(cleaned);
    if (!withoutGreeting) {
      salutationSeen = true;
      continue;
    }

    if (/^sincerely[,]?$/i.test(withoutGreeting)) {
      signoffSeen = true;
      continue;
    }

    const { content, hasSignoff } = splitInlineClosing(withoutGreeting);
    if (hasSignoff) {
      signoffSeen = true;
    }
    if (!content) continue;

    if (isSignatureLine(content) && signoffSeen) {
      signatureLine = signatureLine || content;
      continue;
    }

    body.push(content);
  }

  if (!body.length && !salutationSeen) return [];
  if (!body.length && salutationSeen && !signoffSeen) {
    return ["Dear Hiring Team,", "Sincerely,"].filter(Boolean);
  }

  const finalSalutation = "Dear Hiring Team,";
  const normalizedBody = body.filter(Boolean);
  const closing = normalizedBody.length ? normalizedBody[normalizedBody.length - 1] : "";
  const middleParagraphs = closing ? normalizedBody.slice(0, -1) : normalizedBody;

  deduped.push(finalSalutation);
  deduped.push(...middleParagraphs);
  if (closing) deduped.push(closing);
  deduped.push("Sincerely,");
  if (signatureLine) {
    deduped.push(signatureLine);
  }

  return deduped;
}

function readCoverLetterParagraphSource(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const preview = record.preview;
  if (!preview || typeof preview !== "object") return [];
  const cover = (preview as Record<string, unknown>).coverLetter;
  if (!cover || typeof cover !== "object") return [];
  const paragraphs = (cover as Record<string, unknown>).paragraphs;
  if (!Array.isArray(paragraphs)) return [];
  return paragraphs.map((value) => trimToString(value)).filter(Boolean);
}

export function buildCoverLetterParagraphs(payload: unknown): string[] {
  const paragraphs = readCoverLetterParagraphSource(payload);
  if (!paragraphs.length) return [];
  return normalizeCoverLetterParagraphs(paragraphs);
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

