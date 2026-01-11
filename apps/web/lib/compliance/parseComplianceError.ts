const COMPLIANCE_ERROR_TYPE = "COMPLIANCE_VIOLATION" as const;
const DEFAULT_VIOLATION_MESSAGE = "Compliance validation failed.";

export type ComplianceFlagUi = {
  code: string;
  message: string;
  severity: string; // "warn" | "block" | "info" etc, keep string to avoid backend lock-in
};

export type ParsedComplianceError = {
  type: typeof COMPLIANCE_ERROR_TYPE;
  violations: ComplianceFlagUi[];
  auditId?: string;
  baselineVersionHash?: string | null;
};

export function parseComplianceError({
  status,
  payload,
}: {
  status: number;
  payload?: unknown;
}): ParsedComplianceError | null {
  if (status < 400 || status >= 500) return null;

  const errorCode = getPayloadErrorCode(payload);
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
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (isJson) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
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
      readStringFromPaths(record, [["code"], ["flagCode"], ["flag_code"]]) ?? "COMPLIANCE_VIOLATION";

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
