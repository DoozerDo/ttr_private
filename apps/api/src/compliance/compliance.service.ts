import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BaselineVersion } from '../baseline/baseline-version.entity';
import type { Job } from '../jobs/job.entity';
import { EmbeddingService } from '../ai/embedding.service';
import {
  ComplianceAction,
  ComplianceFlagCode,
  ComplianceFlag,
  ComplianceFlagSeverity,
  ComplianceDebugTrace,
  ComplianceTextSection,
  DocumentType,
  GeneratedTextSourceType,
  JobApplicationContext,
} from './compliance.types';
import { ComplianceAudit } from './compliance-audit.entity';
import { ScopeInflationDetector } from './scope-inflation-detector';
import {
  detectInventedCompany,
  detectInventedMetric,
  detectInventedRole,
  detectFictionalTechnology,
} from './detectors';
import { resolveCompliancePolicy } from './compliance.policy';
import { buildBaselineAllowlistSnapshot } from './baseline-allowlist';
import {
  BaselineAllowlistSnapshot,
  EMPTY_BASELINE_ALLOWLIST,
} from './baseline-allowlist.types';

export type ValidateAndAuditRequest = {
  action: ComplianceAction;
  actorId: string;

  baselineVersion?: BaselineVersion | null;
  job?: Job | null;
  jobContext?: JobApplicationContext;
  baselineSections?: ComplianceTextSection[] | null;
  generatedSections?: ComplianceTextSection[] | null;
  baselineAllowlist?: BaselineAllowlistSnapshot | null;
  documentType?: DocumentType;
  debugCompliance?: boolean;

  outputHash: string;

  extraFlags?: ComplianceFlag[] | undefined;

  scopeInflationDetected?: boolean;
  techMismatchDetected?: boolean;

  [key: string]: unknown;
};

export type ValidateAndAuditResult = {
  blocked: boolean;
  complianceFlags: ComplianceFlag[];
  debugTrace?: ComplianceDebugTrace;
  audit: {
    id: string;
    baselineVersionId: string | null;
    outputHash: string;
    action: ComplianceAction;
    actorId: string;
    baselineVersionHash: string | null;
    jobId: string | null;
    createdAt: string;
  };
};

@Injectable()
export class ComplianceService {
  private readonly scopeInflationDetector = new ScopeInflationDetector();

  constructor(
    @InjectRepository(ComplianceAudit)
    private readonly auditsRepository: Repository<ComplianceAudit>,
    private readonly embeddingService: EmbeddingService,
  ) {}

  public normalizeText(input: string): string {
    const normalized = (input ?? '').replace(/\r\n?/g, '\n');
    return normalized
      .split('\n')
      .map((line) => line.replace(/[\t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Preserve section shape so downstream callers can still reference `title`, etc.
  public normalizeSectionsForOutput<
    T extends {
      content?: string | null;
      title?: string | null;
      [key: string]: any;
    },
  >(sections: T[]): T[] {
    if (!Array.isArray(sections)) return [];

    return sections.map((s) => ({
      ...s,
      title: s?.title ?? null,
      content: this.normalizeText(String(s?.content ?? '')),
    }));
  }

  public enforceResumeWritingRules(payload: {
    normalizedContent?: string;
    rawContent?: string;
    [key: string]: unknown;
  }): ComplianceFlag[] {
    const content = this.normalizeText(
      payload.normalizedContent ?? payload.rawContent ?? '',
    );

    if (!content) return [];

    const flags: ComplianceFlag[] = [];

    if (content.includes('\u0000')) {
      flags.push(
        this.flag(
          'invalid_null_bytes',
          'Content contains invalid null bytes.',
          ComplianceFlagSeverity.BLOCK,
        ),
      );
    }

    const stylizedDashPattern = /[\u2012\u2013\u2014\u2015]/u; // figure dash, en dash, em dash, horizontal bar
    if (stylizedDashPattern.test(content)) {
      flags.push(
        this.flag(
          ComplianceFlagCode.STYLIZED_PUNCTUATION,
          'Content contains stylized dash punctuation. Use standard hyphens instead.',
          ComplianceFlagSeverity.BLOCK,
          0.82,
        ),
      );
    }

    return flags;
  }

  public async detectScopeInflation(payload: {
    baselineSections?: Array<{
      content?: string | null;
      title?: string | null;
      sectionType?: string;
    }> | null;
    generatedSections?: ComplianceTextSection[] | null;
    jobContext?: JobApplicationContext | null;
    documentType?: DocumentType;
    debugTrace?: ComplianceDebugTrace;
  }): Promise<ComplianceFlag[]> {
    const baselineSections = payload.baselineSections ?? [];
    const generatedSections = this.selectBaselineClaimSections(
      payload.generatedSections ?? [],
    );
    return this.scopeInflationDetector.detect(
      baselineSections,
      generatedSections,
      payload.jobContext ?? undefined,
      payload.documentType,
      {
        embeddingProvider: (text: string) =>
          this.embeddingService.embed(text),
        debugTrace: payload.debugTrace,
      },
    );
  }

  public enforceTechnologyConsistency(payload: {
    baselineSections?: ComplianceTextSection[] | null;
    generatedSections?: ComplianceTextSection[] | null;
    jobText?: string | null;
    [key: string]: unknown;
  }): ComplianceFlag[] {
    return this.collectInventedFlags({
      baselineSections: payload.baselineSections,
      generatedSections: payload.generatedSections,
      job: null,
      documentType: DocumentType.UNKNOWN,
    });
  }

  async validateAndAudit(
    payload: ValidateAndAuditRequest,
  ): Promise<ValidateAndAuditResult> {
    const rawFlags: ComplianceFlag[] = [];
    const baselineVersion = payload.baselineVersion;
    const debugTrace: ComplianceDebugTrace | undefined = payload.debugCompliance
      ? {
          enabled: true,
          appliedRules: [],
          evaluatedLines: [],
        }
      : undefined;

    const needsFallback =
      !baselineVersion?.allowedCompanies?.length ||
      !baselineVersion?.allowedRoles?.length ||
      !baselineVersion?.allowedTechnologies?.length ||
      !baselineVersion?.allowedMetricTokens?.length;

    const fallbackSnapshot =
      needsFallback && payload.baselineSections?.length
        ? buildBaselineAllowlistSnapshot(payload.baselineSections)
        : EMPTY_BASELINE_ALLOWLIST;

    const baselineAllowlist: BaselineAllowlistSnapshot = {
      allowedCompanies: baselineVersion?.allowedCompanies?.length
        ? baselineVersion.allowedCompanies
        : fallbackSnapshot.allowedCompanies,
      allowedRoles: baselineVersion?.allowedRoles?.length
        ? baselineVersion.allowedRoles
        : fallbackSnapshot.allowedRoles,
      allowedTechnologies: baselineVersion?.allowedTechnologies?.length
        ? baselineVersion.allowedTechnologies
        : fallbackSnapshot.allowedTechnologies,
      allowedMetricTokens: baselineVersion?.allowedMetricTokens?.length
        ? baselineVersion.allowedMetricTokens
        : fallbackSnapshot.allowedMetricTokens,
    };

    const actorId = String(payload.actorId ?? '').trim();
    const outputHash = String(payload.outputHash ?? '').trim();
    const baselineVersionId = (payload.baselineVersion as any)?.id ?? null;
    const baselineVersionHash =
      (payload.baselineVersion as any)?.hash ??
      (payload.baselineVersion as any)?.fileHash ??
      null;
    const jobId = (payload.job as any)?.id ?? null;

    if (!actorId) {
      rawFlags.push(
        this.flag(
          'missing_actor',
          'Actor id is required.',
          ComplianceFlagSeverity.BLOCK,
        ),
      );
    }

    if (!outputHash) {
      rawFlags.push(
        this.flag(
          'missing_output_hash',
          'Output hash is required.',
          ComplianceFlagSeverity.BLOCK,
        ),
      );
    }

    const baselineRequiredActions: ComplianceAction[] = [
      ComplianceAction.RESUME_GENERATION,
      ComplianceAction.COVER_LETTER_GENERATION,
      ComplianceAction.FOLLOW_UP_GENERATION,
      ComplianceAction.RESUME_EXPORT,
    ];

    if (baselineRequiredActions.includes(payload.action)) {
      if (!baselineVersionId) {
        rawFlags.push(
          this.flag(
            ComplianceFlagCode.MISSING_BASELINE_VERSION,
            'baselineVersionId is required.',
            ComplianceFlagSeverity.BLOCK,
          ),
        );
      }

      if (!baselineVersionHash) {
        rawFlags.push(
          this.flag(
            ComplianceFlagCode.MISSING_BASELINE_HASH,
            'Baseline version hash is required.',
            ComplianceFlagSeverity.BLOCK,
          ),
        );
      }
    }

    if (Array.isArray(payload.extraFlags) && payload.extraFlags.length) {
      for (const f of payload.extraFlags) {
        if (!f || typeof f.code !== 'string' || !f.code.trim()) continue;
        rawFlags.push({
          code: f.code as any,
          message: f.message,
          severity: f.severity ?? ComplianceFlagSeverity.BLOCK,
          confidence: f.confidence,
          evidence: f.evidence,
        });
      }
    }

    if (payload.scopeInflationDetected === true) {
      rawFlags.push(
        this.flag(
          ComplianceFlagCode.SCOPE_INFLATION,
          'Potential scope inflation detected.',
          ComplianceFlagSeverity.BLOCK,
        ),
      );
    }

    // IMPORTANT:
    // FIT_SCORE validates inputs used for scoring, including raw job description text.
    // We must NOT run "invented company/role/technology/metric" detectors on job text,
    // because the job description is not model-generated output and will contain
    // arbitrary company names, product names, and terms. Those detectors are meant
    // for generated artifacts (resume, cover letter, follow-ups, exports).
    const shouldRunInventedDetectors = payload.action !== ComplianceAction.FIT_SCORE;

    if (shouldRunInventedDetectors) {
      const inventedFlags = this.collectInventedFlags({
        baselineSections: payload.baselineSections,
        generatedSections: payload.generatedSections,
        job: payload.job,
        baselineAllowlist,
        jobContext: payload.jobContext,
        documentType: payload.documentType,
        debugTrace,
      });
      rawFlags.push(...inventedFlags);
    }

    const finalFlags = rawFlags.map((flag) =>
      this.applyPolicy(payload.action, flag),
    );

    const blocked = finalFlags.some(
      (f) =>
        (f.severity ?? ComplianceFlagSeverity.BLOCK) ===
        ComplianceFlagSeverity.BLOCK,
    );

    const audit = this.auditsRepository.create({
      actorId,
      action: payload.action,
      baselineVersionId,
      baselineVersionHash,
      jobId: jobId ?? null,
      outputHash,
      complianceFlags: finalFlags,
      passFail: !blocked,
    });

    const savedAudit = await this.auditsRepository.save(audit);

    return {
      blocked,
      complianceFlags: finalFlags,
      ...(debugTrace ? { debugTrace } : {}),
      audit: {
        id: savedAudit.id,
        outputHash: savedAudit.outputHash ?? '',
        baselineVersionId: savedAudit.baselineVersionId,
        action: savedAudit.action,
        actorId: savedAudit.actorId,
        baselineVersionHash: savedAudit.baselineVersionHash,
        jobId: savedAudit.jobId,
        createdAt: savedAudit.createdAt.toISOString(),
      },
    };
  }

  private collectInventedFlags(payload: {
    baselineSections?: ComplianceTextSection[] | null;
    generatedSections?: ComplianceTextSection[] | null;
    job?: Job | null;
    baselineAllowlist?: BaselineAllowlistSnapshot | null;
    jobContext?: JobApplicationContext;
    documentType?: DocumentType;
    debugTrace?: ComplianceDebugTrace;
  }): ComplianceFlag[] {
    const generatedClaimSections = this.normalizeGeneratedSectionsForClaimValidation(
      payload.generatedSections ?? [],
    );
    if (!generatedClaimSections.length) {
      return [];
    }

    return [
      ...detectInventedCompany({
      baselineSections: payload.baselineSections,
      generatedSections: generatedClaimSections,
      job: payload.job,
      baselineAllowlist: payload.baselineAllowlist,
      jobContext: payload.jobContext,
      documentType: payload.documentType,
      debugTrace: payload.debugTrace,
    }),
      ...detectInventedRole({
        baselineSections: payload.baselineSections,
        generatedSections: generatedClaimSections,
        job: payload.job,
        baselineAllowlist: payload.baselineAllowlist,
        jobContext: payload.jobContext,
        documentType: payload.documentType,
        debugTrace: payload.debugTrace,
      }),
      ...detectInventedMetric({
        baselineSections: payload.baselineSections,
        generatedSections: generatedClaimSections,
        job: payload.job,
        baselineAllowlist: payload.baselineAllowlist,
        debugTrace: payload.debugTrace,
      }),
      ...detectFictionalTechnology({
        baselineSections: payload.baselineSections,
        generatedSections: generatedClaimSections,
        job: payload.job,
        baselineAllowlist: payload.baselineAllowlist,
        jobContext: payload.jobContext,
        debugTrace: payload.debugTrace,
      }),
    ];
  }

  private applyPolicy(
    action: ComplianceAction,
    flag: ComplianceFlag,
  ): ComplianceFlag {
    const policy = resolveCompliancePolicy(action, flag.code);
    const baseSeverity = flag.severity ?? ComplianceFlagSeverity.BLOCK;
    if (!policy) {
      return { ...flag, severity: baseSeverity };
    }

    let finalSeverity = policy.severity;

    if (
      typeof policy.blockConfidenceThreshold === 'number' &&
      typeof flag.confidence === 'number'
    ) {
      finalSeverity =
        flag.confidence >= policy.blockConfidenceThreshold
          ? ComplianceFlagSeverity.BLOCK
          : policy.severity;
    }

    return { ...flag, severity: finalSeverity };
  }

  private flag(
    code: string,
    message: string,
    severity: ComplianceFlagSeverity,
    confidence?: number,
  ): ComplianceFlag {
    const normalizedCode = String(code ?? '').toUpperCase();
    const flag: ComplianceFlag = {
      code: code as any,
      message,
      severity,
      type:
        normalizedCode === 'SCOPE_INFLATION'
          ? 'SCOPE_INFLATION'
          : normalizedCode === 'MISSING_BASELINE_HASH'
            ? 'MISSING_BASELINE_HASH'
            : normalizedCode === 'MISSING_BASELINE_VERSION'
              ? 'MISSING_BASELINE_VERSION'
              : normalizedCode === 'INVENTED_COMPANY'
                ? 'INVENTED_COMPANY'
                : normalizedCode === 'INVENTED_ROLE'
                  ? 'INVENTED_ROLE'
                  : normalizedCode === 'INVENTED_METRIC'
                    ? 'INVENTED_METRIC'
                    : normalizedCode === 'FICTIONAL_TECHNOLOGY'
                      ? 'INVALID_ASSERTION'
                      : normalizedCode === 'STYLIZED_PUNCTUATION'
                        ? 'INVALID_ASSERTION'
                        : 'INVALID_ASSERTION',
      sourceText: message,
      location: { section: 'summary' },
      rule: normalizedCode || 'SYSTEM_VALIDATION',
      reason: message,
      conditions: [normalizedCode || 'system_validation'],
    };
    if (confidence !== undefined) {
      flag.confidence = confidence;
    }
    return flag;
  }

  private selectBaselineClaimSections(
    sections: ComplianceTextSection[],
  ): Array<{ title?: string | null; content?: string | null }> {
    if (!Array.isArray(sections) || sections.length === 0) return [];

    const mapped: Array<{ title?: string | null; content?: string | null }> =
      [];

    for (const section of sections) {
      const sectionSourceType =
        section.sourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE;
      const sentenceSources = Array.isArray(section.sentenceSources)
        ? section.sentenceSources
        : [];

      if (sentenceSources.length > 0) {
        const claimSentences = sentenceSources
          .filter(
            (sentence) =>
              (sentence.sourceType ?? sectionSourceType) ===
              GeneratedTextSourceType.BASELINE_EVIDENCE,
          )
          .map((sentence) => this.normalizeText(String(sentence.text ?? '')))
          .filter(Boolean);

        if (claimSentences.length > 0) {
          mapped.push({
            title: section.title,
            content: claimSentences.join(' '),
          });
        }
        continue;
      }

      if (sectionSourceType !== GeneratedTextSourceType.BASELINE_EVIDENCE) {
        continue;
      }

      const content = this.normalizeText(String(section.content ?? ''));
      if (!content) continue;
      mapped.push({
        title: section.title,
        content,
      });
    }

    return mapped;
  }

  private normalizeGeneratedSectionsForClaimValidation(
    sections: ComplianceTextSection[],
  ): ComplianceTextSection[] {
    if (!Array.isArray(sections) || sections.length === 0) return [];

    const normalized: ComplianceTextSection[] = [];

    for (const section of sections) {
      const explicitSectionSourceType = section.sourceType;
      const sentenceSources = Array.isArray(section.sentenceSources)
        ? section.sentenceSources
        : [];

      if (sentenceSources.length > 0) {
        const claimSentences = sentenceSources
          .map((sentence) => ({
            text: this.normalizeText(String(sentence.text ?? '')),
            sourceType:
              sentence.sourceType ?? explicitSectionSourceType,
          }))
          .filter(
            (sentence) =>
              sentence.text.length > 0 &&
              sentence.sourceType === GeneratedTextSourceType.BASELINE_EVIDENCE,
          );

        if (!claimSentences.length) continue;

        normalized.push({
          ...section,
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          sentenceSources: claimSentences,
          content: claimSentences.map((sentence) => sentence.text).join(' '),
        });
        continue;
      }

      // For generated sections without per-sentence provenance, assume they represent baseline-evidence claims.
      const sectionSourceType =
        explicitSectionSourceType ?? GeneratedTextSourceType.BASELINE_EVIDENCE;
      if (sectionSourceType !== GeneratedTextSourceType.BASELINE_EVIDENCE) {
        continue;
      }

      const content = this.normalizeText(String(section.content ?? ''));
      if (!content) continue;

      normalized.push({
        ...section,
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        content,
        sentenceSources: [
          {
            text: content,
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      });
    }

    if (process.env.COMPLIANCE_TRACE === 'true') {
      const needle = 'Achieved revenue of 450000 last quarter.';
      const match = normalized.find((section) => section.content?.includes(needle));
      if (match) {
        console.debug('[compliance-trace] normalizeGeneratedSectionsForClaimValidation hit', {
          title: match.title,
          sourceType: match.sourceType,
          content: match.content,
          sentenceSources: match.sentenceSources,
        });
      }
    }

    return normalized;
  }
}
