import {
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from './compliance.types';

type ComplianceEvidence = {
  baseline?: string;
  generated?: string;
  generatedClaim?: {
    text?: string;
    type?: 'company' | 'technology' | 'concept' | 'derived' | 'operational_descriptor';
  };
  reason?: string;
  similarity?: number;
};

export type ComplianceUiDiagnosticsItem = {
  code: ComplianceFlagCode;
  severity: ComplianceFlagSeverity;
  confidence?: number;
  message: string;
  evidenceCount: number;
  rawReasons: string[];
  bestSimilarity?: number;
  generatedExamples: string[];
};

export type ComplianceUiShape = {
  reasons: string[];
  diagnostics: ComplianceUiDiagnosticsItem[];
};

const UI_REASON_LABELS: Record<string, string> = {
  invented_company:
    'One or more company references could not be verified against your baseline.',
  invented_role:
    'One or more role or title claims could not be verified against your baseline.',
  invented_metric:
    'One or more metric or outcome claims could not be verified against your baseline.',
  scope_inflation:
    'This draft may imply broader leadership scope than your baseline clearly supports.',
  missing_baseline_support:
    'Some claims are missing clear baseline support.',
  fictional_technology:
    'One or more technology claims could not be verified against your baseline.',
  stylized_punctuation:
    'Formatting must be normalized before export.',
};

function normalizeText(value: string, max = 180): string {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trim()}...`;
}

function dedupe(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

function asEvidence(flag: ComplianceFlag): ComplianceEvidence[] {
  if (!Array.isArray(flag.evidence)) return [];
  return flag.evidence.map((entry) => ({
    baseline: String((entry as { baseline?: string })?.baseline ?? ''),
    generated: String((entry as { generated?: string })?.generated ?? ''),
      reason: String((entry as { reason?: string })?.reason ?? ''),
      generatedClaim: (entry as { generatedClaim?: ComplianceEvidence['generatedClaim'] })
        ?.generatedClaim,
      similarity:
        typeof (entry as { similarity?: number })?.similarity === 'number'
        ? (entry as { similarity?: number }).similarity
        : undefined,
  }));
}

function mapFlagToUiReason(flag: ComplianceFlag): string {
  const code = String(flag.code ?? '').toLowerCase();
  const baseReason = UI_REASON_LABELS[code] ?? 'Some content could not be verified against your baseline.';
  const evidence = asEvidence(flag);
  const hasCompanyTypedClaim = evidence.some(
    (entry) => entry.generatedClaim?.type === 'company',
  );

  if (flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY && hasCompanyTypedClaim) {
    return 'One or more company references could not be verified against your baseline employment history.';
  }

  if (flag.code === ComplianceFlagCode.SCOPE_INFLATION) {
    const examples = dedupe(
      evidence.map((entry) => entry.generated ?? ''),
      2,
    );
    if (!examples.length) return baseReason;
    return `${baseReason} Examples: ${examples.join(' | ')}`;
  }

  if (flag.code === ComplianceFlagCode.INVENTED_ROLE) {
    const examples = dedupe(
      evidence.map((entry) => entry.generated ?? ''),
      1,
    );
    if (!examples.length) return baseReason;
    return `${baseReason} Example: ${examples[0]}`;
  }

  return baseReason;
}

function buildDiagnostics(flag: ComplianceFlag): ComplianceUiDiagnosticsItem {
  const evidence = asEvidence(flag);
  const rawReasons = dedupe(
    evidence
      .map((entry) => entry.reason ?? '')
      .filter((reason) => reason.length > 0),
    6,
  );
  const generatedExamples = dedupe(
    evidence.map((entry) => entry.generated ?? ''),
    3,
  );
  const bestSimilarity = evidence
    .map((entry) => entry.similarity)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => right - left)[0];

  return {
    code: flag.code,
    severity: flag.severity,
    confidence: flag.confidence,
    message: normalizeText(String(flag.message ?? ''), 220),
    evidenceCount: evidence.length,
    rawReasons,
    bestSimilarity,
    generatedExamples,
  };
}

export function shapeComplianceForUi(flags: ComplianceFlag[]): ComplianceUiShape {
  const reasonByCode = new Map<string, string>();
  const diagnostics: ComplianceUiDiagnosticsItem[] = [];

  for (const flag of flags) {
    diagnostics.push(buildDiagnostics(flag));
    const code = String(flag.code ?? '').toLowerCase();
    if (reasonByCode.has(code)) continue;
    reasonByCode.set(code, mapFlagToUiReason(flag));
  }

  const reasons = dedupe(Array.from(reasonByCode.values()), 4);
  return {
    reasons,
    diagnostics,
  };
}
