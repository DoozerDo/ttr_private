const COMPLIANCE_ERROR_TYPE = "COMPLIANCE_VIOLATION" as const;
const INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE =
  "insufficient_extracted_text" as const;
const DEFAULT_VIOLATION_MESSAGE = "Compliance validation failed.";

export type ComplianceFlagUi = {
  code: string;
  message: string;
  severity: string;
};

export type InsufficientExtractedTextReason =
  | "likely_extraction_failure"
  | "resume_too_short";

export type InsufficientExtractedTextDetails = {
  minChars: number;
  extractedChars: number;
  preview: string;
  reason: InsufficientExtractedTextReason;
  tips: string[];
};

export type ParsedComplianceViolationError = {
  type: typeof COMPLIANCE_ERROR_TYPE;
  violations: ComplianceFlagUi[];
  auditId?: string;
  baselineVersionHash?: string | null;
};

export type ParsedInsufficientExtractedTextError = {
  type: typeof INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE;
  details: InsufficientExtractedTextDetails;
  auditId?: string;
  baselineVersionHash?: string | null;
};

export type ParsedComplianceError =
  | ParsedComplianceViolationError
  | ParsedInsufficientExtractedTextError;

export function parseComplianceError({
  status,
  payload,
}: {
  status: number;
  payload?: unknown;
}): ParsedComplianceError | null {
  if (status < 400 || status >= 500) return null;

  const errorCode = getPayloadErrorCode(payload);

  if (errorCode === INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE) {
    const details = parseInsufficientExtractedTextDetails(payload);
    if (!details) return null;
    return {
      type: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
      details,
      auditId: getAuditId(payload),
      baselineVersionHash: getBaselineVersionHash(payload),
    };
  }

  let violations = extractViolations(payload);

  const isComplianceCode = errorCode === COMPLIANCE_ERROR_TYPE;
  if (!violations.length && !isComplianceCode) return null;

  if (!violations.length) {
    violations = [
      normalizeViolationEntry(payload) ?? {
        code: "COMPLIANCE_VIOLATION",
        message: formatErrorMessage(payload, DEFAULT_VIOLATION_MESSAGE),
        severity: "block",
      },
    ];
  }

  return {
    type: COMPLIANCE_ERROR_TYPE,
    violations,
    auditId: getAuditId(payload),
    baselineVersionHash: getBaselineVersionHash(payload),
  };
}

export function readResponsePayload(response: Response): Promise<unknown> {
  const responseLike = response as Response & {
    headers?: { get?: (name: string) => string | null };
  };
  const contentType = responseLike.headers?.get?.("content-type") ?? "";
  const hasJsonContentType = contentType.includes("application/json");
  const canReadJson = hasJsonContentType || !contentType;

  if (canReadJson && typeof responseLike.json === "function") {
    return responseLike.json().catch(() => null);
  }

  if (typeof responseLike.text === "function") {
    return responseLike.text().catch(() => null);
  }

  if (typeof responseLike.json === "function") {
    return responseLike.json().catch(() => null);
  }

  return Promise.resolve(null);
}

export function formatErrorMessage(payload: unknown, fallback: string): string {
  if (!payload) return fallback;

  if (typeof payload === "string") {
    return payload.trim() || fallback;
  }

  if (typeof payload !== "object" || payload === null) {
    return fallback;
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.message)) {
    const joined = record.message.map(String).join(", ").trim();
    return joined || fallback;
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  const nestedError = record.error;
  if (typeof nestedError === "string" && nestedError.trim()) {
    return nestedError.trim();
  }

  if (typeof nestedError === "object" && nestedError !== null) {
    const nestedMessage = (nestedError as Record<string, unknown>).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage.trim();
    }
  }

  return fallback;
}

export function getPayloadErrorCode(payload: unknown): string | undefined {
  return readStringFromPaths(payload, [
    ["errorCode"],
    ["error", "code"],
    ["error", "errorCode"],
    ["code"],
  ]);
}

function extractViolations(payload: unknown): ComplianceFlagUi[] {
  const paths: string[][] = [
    ["violations"],
    ["error", "details", "violations"],
    ["details", "violations"],

    ["compliance_flags"],
    ["details", "compliance_flags"],
    ["error", "details", "compliance_flags"],
    ["error", "compliance_flags"],

    ["complianceFlags"],
    ["details", "complianceFlags"],
    ["error", "details", "complianceFlags"],
    ["error", "complianceFlags"],
  ];

  for (const path of paths) {
    const candidate = getValueAtPath(payload, path);
    const normalized = normalizeViolations(candidate);
    if (normalized.length) return normalized;
  }

  return [];
}

function normalizeViolations(source: unknown): ComplianceFlagUi[] {
  if (!Array.isArray(source)) return [];

  const normalized: ComplianceFlagUi[] = [];
  for (const entry of source) {
    const violation = normalizeViolationEntry(entry);
    if (violation) normalized.push(violation);
  }

  return normalized;
}

function normalizeViolationEntry(entry: unknown): ComplianceFlagUi | null {
  if (!entry) return null;

  if (typeof entry === "string") {
    const message = entry.trim();
    if (!message) return null;
    return {
      code: "COMPLIANCE_VIOLATION",
      message,
      severity: "block",
    };
  }

  if (typeof entry === "object") {
    const record = entry as Record<string, unknown>;

    const rawCode =
      readStringFromPaths(record, [["code"], ["flagCode"], ["flag_code"]]) ??
      "COMPLIANCE_VIOLATION";

    const rawMessage =
      readStringFromPaths(record, [["message"], ["msg"], ["description"]]) ??
      formatErrorMessage(record, DEFAULT_VIOLATION_MESSAGE);

    const rawSeverity = readStringFromPaths(record, [
      ["severity"],
      ["flagSeverity"],
      ["flag_severity"],
      ["level"],
      ["flagLevel"],
      ["flag_level"],
    ]);

    const code = rawCode.trim() || "COMPLIANCE_VIOLATION";
    const message = rawMessage.trim() || DEFAULT_VIOLATION_MESSAGE;
    const severity = normalizeSeverity(rawSeverity) ?? "block";

    if (!message) return null;

    return { code, message, severity };
  }

  return null;
}

function parseInsufficientExtractedTextDetails(
  payload: unknown,
): InsufficientExtractedTextDetails | null {
  const source =
    (getValueAtPath(payload, ["details"]) ??
      getValueAtPath(payload, ["error", "details"])) as
      | Record<string, unknown>
      | undefined;
  if (!source) return null;

  const minChars = readNumberFromPaths(source, [
    ["minChars"],
    ["min_chars"],
    ["minCharThreshold"],
    ["minimum_chars"],
  ]);
  const extractedChars = readNumberFromPaths(source, [
    ["extractedChars"],
    ["extracted_char_count"],
    ["extracted_characters"],
    ["charCount"],
  ]);
  const preview =
    readStringFromPaths(source, [
      ["preview"],
      ["preview_text"],
      ["extractedTextPreview"],
      ["extracted_text_preview"],
      ["text"],
      ["rawText"],
    ]) ?? "";

  if (minChars === undefined || extractedChars === undefined) {
    return null;
  }

  const rawReason = readStringFromPaths(source, [["reason"]]);
  const reason =
    rawReason === "likely_extraction_failure" ||
    rawReason === "resume_too_short"
      ? (rawReason as InsufficientExtractedTextReason)
      : "resume_too_short";

  const tips =
    (Array.isArray(getValueAtPath(source, ["tips"]))
      ? (getValueAtPath(source, ["tips"]) as unknown[])
      : Array.isArray(getValueAtPath(source, ["tip", "items"]))
        ? (getValueAtPath(source, ["tip", "items"]) as unknown[])
        : []
    )
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length);

  return {
    minChars,
    extractedChars,
    preview,
    reason,
    tips,
  };
}

function getAuditId(payload: unknown): string | undefined {
  return readStringFromPaths(payload, [
    ["auditId"],
    ["audit_id"],
    ["error", "details", "audit_id"],
    ["audit", "id"],
  ]);
}

function getBaselineVersionHash(payload: unknown): string | null {
  return (
    readStringFromPaths(payload, [
      ["baselineVersionHash"],
      ["baseline_version_hash"],
      ["baselineHash"],
      ["details", "baseline_version_hash"],
      ["error", "details", "baseline_version_hash"],
    ]) ?? null
  );
}

function readStringFromPaths(payload: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = getValueAtPath(payload, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readNumberFromPaths(payload: unknown, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = getValueAtPath(payload, path);
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
}

function normalizeSeverity(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function getValueAtPath(payload: unknown, path: string[]): unknown {
  let current: unknown = payload;

  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
