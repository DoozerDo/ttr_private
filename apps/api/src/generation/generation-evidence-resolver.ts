import type { Baseline } from '../baseline/baseline.entity';
import type { BaselineSection } from '../baseline/baseline-section.entity';
import { resolveBaselineSectionsForGeneration } from '../baseline/baseline-section-source';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import {
  buildResumePlainText,
  formatResumeV2InvalidMessage,
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';

export type GenerationEvidenceSource =
  | 'resume_v2'
  | 'baseline_sections_structured'
  | 'baseline_raw_text'
  | 'fit_analysis';

export type WorkHistoryEvidenceItem = {
  company: string;
  roleTitle: string;
  bullets: string[];
  dates?: string;
  source: GenerationEvidenceSource;
  provenance: {
    baselineId: string;
    baselineVersionId?: string | null;
    baselineParsedRecordCreatedAt?: string | null;
    baselineSectionIds?: string[];
  };
};

export type GenerationEvidenceWarningCode =
  | 'baseline_resume_v2_missing'
  | 'baseline_resume_v2_invalid'
  | 'baseline_resume_v2_ingestion_failed'
  | 'resume_v2_missing'
  | 'resume_v2_invalid'
  | 'unsupported_target_requirements';

export type GenerationEvidenceWarning = {
  code: GenerationEvidenceWarningCode;
  message: string;
  details?: Record<string, unknown>;
};

export type GenerationEvidenceBundle = {
  primarySource: GenerationEvidenceSource;
  sourcesUsed: GenerationEvidenceSource[];
  warnings: GenerationEvidenceWarning[];
  workHistory: WorkHistoryEvidenceItem[];
  usableWorkHistoryEvidence: boolean;
  resumePlainText: string;
  structuredBaselineExperienceCount: number;
  generationAuthority: 'baseline_file' | 'fallback';
  baselineFileUsable: boolean;
  baselineVerified: boolean;
  baselineFileVersionHash: string | null;
};

function normalizeLine(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeLine(String(item ?? '')))
    .filter(Boolean)
    .slice(0, 18);
}

function extractWorkHistoryFromResumeV2(params: {
  baselineId: string;
  baselineVersionId?: string | null;
  resumeV2Json: unknown;
  baselineParsedRecordCreatedAt?: Date | null;
}): { items: WorkHistoryEvidenceItem[]; resumeText: string; warnings: GenerationEvidenceWarning[] } {
  const warnings: GenerationEvidenceWarning[] = [];
  if (!params.resumeV2Json || typeof params.resumeV2Json !== 'object') {
    warnings.push({
      code: 'resume_v2_missing',
      message: 'Persisted Resume V2 is missing; falling back to verified baseline evidence.',
    });
    return { items: [], resumeText: '', warnings };
  }

  const readiness = (params.resumeV2Json as any)?.readiness;
  if (readiness && readiness.usable === false) {
    warnings.push({
      code: 'resume_v2_invalid',
      message: 'Persisted Baseline File is marked needs_review; falling back to verified baseline evidence.',
      details: { readiness },
    });
    return { items: [], resumeText: '', warnings };
  }

  const normalized = normalizeNormalizedResumeDocument(params.resumeV2Json as any);
  const validation = validateNormalizedResumeDocument(normalized as any);
  if (!validation.valid) {
    warnings.push({
      code: 'resume_v2_invalid',
      message: formatResumeV2InvalidMessage({ reasons: validation.reasons ?? [], failures: null }),
      details: { reasons: validation.reasons ?? [] },
    });
    return { items: [], resumeText: '', warnings };
  }

  const experience = Array.isArray((normalized as any)?.experience) ? ((normalized as any).experience as any[]) : [];
  const items: WorkHistoryEvidenceItem[] = experience
    .map((entry) => {
      const company = normalizeLine(String(entry?.company ?? ''));
      const roleTitle = normalizeLine(String(entry?.roleTitle ?? ''));
      const bullets = normalizeBullets(entry?.bullets);
      if (!company || !roleTitle) return null;
      return {
        company,
        roleTitle,
        bullets,
        source: 'resume_v2' as const,
        provenance: {
          baselineId: params.baselineId,
          baselineVersionId: params.baselineVersionId ?? null,
          baselineParsedRecordCreatedAt: params.baselineParsedRecordCreatedAt
            ? params.baselineParsedRecordCreatedAt.toISOString()
            : null,
        },
      };
    })
    .filter(Boolean) as WorkHistoryEvidenceItem[];

  return { items, resumeText: buildResumePlainText(normalized as any), warnings };
}

function extractWorkHistoryFromBaselineSections(params: {
  baseline: Baseline;
  baselineVersionId?: string | null;
  sections: BaselineSection[];
}): { items: WorkHistoryEvidenceItem[]; structuredExperienceCount: number } {
  const structured = extractStructuredBaselineFromSections(params.sections as any);
  const experience = Array.isArray((structured as any)?.experience) ? ((structured as any).experience as any[]) : [];

  const items: WorkHistoryEvidenceItem[] = experience
    .map((entry) => {
      const company = normalizeLine(String(entry?.company ?? ''));
      const roleTitle = normalizeLine(String(entry?.roleTitle ?? ''));
      const bullets = normalizeBullets(entry?.bullets);
      if (!company || !roleTitle || bullets.length === 0) return null;
      return {
        company,
        roleTitle,
        bullets,
        dates: typeof entry?.dates === 'string' ? entry.dates : undefined,
        source: 'baseline_sections_structured' as const,
        provenance: {
          baselineId: params.baseline.id,
          baselineVersionId: params.baselineVersionId ?? null,
          baselineSectionIds: params.sections.map((section) => String((section as any)?.id ?? '')).filter(Boolean),
        },
      };
    })
    .filter(Boolean) as WorkHistoryEvidenceItem[];

  return { items, structuredExperienceCount: items.length };
}

function buildConservativeRawBaselineText(sections: BaselineSection[]): string {
  const joined = (sections ?? [])
    .map((section) => String(section?.content ?? ''))
    .join('\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = joined
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Conservative segmentation: keep only lines that look like headers/bullets with enough signal.
  const keep: string[] = [];
  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;
    const looksLikeBullet = /^[-•*]\s+/.test(normalized);
    const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
    const hasCompanyLikeDelimiter = normalized.includes('|') || /\s-\s/.test(normalized);
    if (looksLikeBullet || hasYear || hasCompanyLikeDelimiter) {
      keep.push(normalized.replace(/^[-•*]\s+/, '- '));
    }
    if (keep.length >= 220) break;
  }

  return keep.join('\n').trim();
}

export function resolveGenerationEvidence(params: {
  baseline: Baseline;
  baselineVersionId?: string | null;
}): GenerationEvidenceBundle {
  const baseline = params.baseline;
  const baselineVersionId = params.baselineVersionId ?? null;

  const warnings: GenerationEvidenceWarning[] = [];
  const sourceSections = resolveBaselineSectionsForGeneration(baseline);

  const parsedRecord = (baseline.parsedRecords?.[0] as any) ?? null;
  const baselineFileUsable = Boolean(parsedRecord?.resumeV2Json?.readiness?.usable);
  const baselineVerified = Boolean(parsedRecord?.flagsJson?.reviewState?.verified);
  const baselineFileVersionHash = typeof baselineVersionId === 'string' ? baselineVersionId : null;
  const v2 = extractWorkHistoryFromResumeV2({
    baselineId: baseline.id,
    baselineVersionId,
    resumeV2Json: parsedRecord?.resumeV2Json ?? null,
    baselineParsedRecordCreatedAt: parsedRecord?.createdAt instanceof Date ? parsedRecord.createdAt : null,
  });
  warnings.push(...v2.warnings);
  const structured = extractWorkHistoryFromBaselineSections({
    baseline,
    baselineVersionId,
    sections: sourceSections as any,
  });
  const canonicalAuthorityAvailable = baselineFileUsable || v2.items.length > 0 || structured.items.length > 0;

  if (v2.items.length > 0) {
    return {
      primarySource: 'resume_v2',
      sourcesUsed: ['resume_v2'],
      warnings,
      workHistory: v2.items,
      usableWorkHistoryEvidence: true,
      resumePlainText: v2.resumeText,
      structuredBaselineExperienceCount: structured.structuredExperienceCount,
      generationAuthority: canonicalAuthorityAvailable ? 'baseline_file' : 'fallback',
      baselineFileUsable: canonicalAuthorityAvailable,
      baselineVerified,
      baselineFileVersionHash,
    };
  }

  if (structured.items.length > 0) {
    return {
      primarySource: 'baseline_sections_structured',
      sourcesUsed: ['baseline_sections_structured'],
      warnings,
      workHistory: structured.items,
      usableWorkHistoryEvidence: true,
      resumePlainText: buildConservativeRawBaselineText(sourceSections as any),
      structuredBaselineExperienceCount: structured.structuredExperienceCount,
      generationAuthority: canonicalAuthorityAvailable ? 'baseline_file' : 'fallback',
      baselineFileUsable: canonicalAuthorityAvailable,
      baselineVerified,
      baselineFileVersionHash,
    };
  }

  const rawText = buildConservativeRawBaselineText(sourceSections as any);
  return {
    primarySource: rawText ? 'baseline_raw_text' : 'fit_analysis',
    sourcesUsed: rawText ? ['baseline_raw_text'] : ['fit_analysis'],
    warnings,
    workHistory: [],
    usableWorkHistoryEvidence: false,
    resumePlainText: rawText,
    structuredBaselineExperienceCount: 0,
    generationAuthority: 'fallback',
    baselineFileUsable: canonicalAuthorityAvailable,
    baselineVerified,
    baselineFileVersionHash,
  };
}
