import { HttpException } from '@nestjs/common';
import { ComplianceFlag, ComplianceFlagCode, ComplianceFlagSeverity } from './compliance.types';
import type {
  ComplianceService,
  ValidateAndAuditRequest,
  ValidateAndAuditResult,
} from './compliance.service';

const COMPLIANCE_ERROR_CODE = 'COMPLIANCE_VIOLATION';

type ComplianceDetails = {
  auditId?: string;
  baselineVersionHash?: string | null;
  complianceFlags: ComplianceFlag[];
};

export function parseComplianceViolationError(error: unknown): ComplianceDetails | null {
  if (!(error instanceof HttpException)) return null;
  const response = error.getResponse();
  if (!response || typeof response !== 'object') return null;

  const record = response as Record<string, unknown>;
  const code = readStringFromPaths(record, [
    ['error', 'code'],
    ['errorCode'],
    ['error', 'errorCode'],
    ['code'],
  ]);
  if (code !== COMPLIANCE_ERROR_CODE) return null;

  const details =
    (getValueAtPath(record, ['error', 'details']) ??
      getValueAtPath(record, ['details'])) as Record<string, unknown> | undefined;
  if (!details) return null;

  const complianceFlags = normalizeComplianceFlags(
    getValueAtPath(details, ['compliance_flags']) ??
      getValueAtPath(details, ['complianceFlags']) ??
      getValueAtPath(details, ['flags']) ??
      [],
  );

  const auditId = readStringFromPaths(details, [
    ['audit_id'],
    ['auditId'],
    ['audit', 'id'],
  ]);

  const baselineVersionHash = readStringFromPaths(details, [
    ['baseline_version_hash'],
    ['baselineVersionHash'],
    ['baselineHash'],
  ]);

  return {
    auditId,
    baselineVersionHash: baselineVersionHash ?? null,
    complianceFlags,
  };
}

export async function validateComplianceWithFallback(
  complianceService: ComplianceService,
  payload: ValidateAndAuditRequest,
): Promise<ValidateAndAuditResult> {
  try {
    return await complianceService.validateAndAudit(payload);
  } catch (error) {
    const details = parseComplianceViolationError(error);
    if (!details) throw error;

    return {
      blocked: true,
      complianceFlags: details.complianceFlags,
      audit: {
        id: details.auditId ?? `${payload.action}-${Date.now().valueOf()}`,
        baselineVersionId: payload.baselineVersion?.id ?? null,
        outputHash: payload.outputHash ?? '',
        action: payload.action,
        actorId: payload.actorId,
        baselineVersionHash:
          details.baselineVersionHash ?? payload.baselineVersion?.hash ?? null,
        jobId: payload.job?.id ?? null,
        createdAt: new Date().toISOString(),
      },
    };
  }
}

function normalizeComplianceFlags(source: unknown): ComplianceFlag[] {
  if (!Array.isArray(source)) return [];
  const normalized: ComplianceFlag[] = [];
  const codeFallback = ComplianceFlagCode.INVENTED_METRIC;
  const severityFallback = ComplianceFlagSeverity.BLOCK;

  for (const entry of source) {
    if (!entry) continue;

    if (typeof entry === 'string') {
      const message = entry.trim();
      if (!message) continue;
      normalized.push({
        code: codeFallback,
        severity: severityFallback,
        message,
      });
      continue;
    }

    if (typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const message =
      readStringFromPaths(record, [['message'], ['msg'], ['description']])?.trim() ??
      '';
    if (!message) continue;

    const rawCode = readStringFromPaths(record, [['code'], ['flagCode'], ['flag_code']]);
    const rawSeverity = normalizeSeverity(
      readStringFromPaths(record, [
        ['severity'],
        ['flagSeverity'],
        ['flag_severity'],
        ['level'],
      ]),
    );

    normalized.push({
      code: (rawCode as ComplianceFlagCode) ?? codeFallback,
      severity: (rawSeverity as ComplianceFlagSeverity) ?? severityFallback,
      message,
    });
  }

  return normalized;
}

function normalizeSeverity(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function readStringFromPaths(
  source: unknown,
  paths: string[][],
): string | undefined {
  for (const path of paths) {
    const value = getValueAtPath(source, path);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function getValueAtPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
