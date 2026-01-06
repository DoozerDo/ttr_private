import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BaselineVersion } from '../baseline/baseline-version.entity';
import type { Job } from '../jobs/job.entity';
import {
  ComplianceAction,
  ComplianceFlagCode,
  ComplianceFlag,
  ComplianceFlagSeverity,
} from './compliance.types';
import { ComplianceAudit } from './compliance-audit.entity';
import { ScopeInflationDetector } from './scope-inflation-detector';

export type ValidateAndAuditRequest = {
  action: ComplianceAction;
  actorId: string;

  baselineVersion?: BaselineVersion | null;
  job?: Job | null;

  outputHash: string;

  extraFlags?: ComplianceFlag[] | undefined;

  scopeInflationDetected?: boolean;
  techMismatchDetected?: boolean;

  [key: string]: unknown;
};

export type ValidateAndAuditResult = {
  blocked: boolean;
  complianceFlags: ComplianceFlag[];
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
  ) {}

  public normalizeText(input: string): string {
    return (input ?? '').replace(/\s+/g, ' ').trim();
  }

  // Preserve section shape so downstream callers can still reference `title`, etc.
  public normalizeSectionsForOutput<
    T extends { content?: string | null; title?: string | null; [key: string]: any },
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
    const content =
      this.normalizeText(payload.normalizedContent ?? payload.rawContent ?? '');

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
        ),
      );
    }

    return flags;
  }

  public detectScopeInflation(payload: {
    baselineSections?: Array<{ content?: string | null; title?: string | null; sectionType?: string }> | null;
    generatedSections?: Array<{ content?: string | null; title?: string | null }> | null;
  }): ComplianceFlag[] {
    const baselineSections = payload.baselineSections ?? [];
    const generatedSections = payload.generatedSections ?? [];
    return this.scopeInflationDetector.detect(baselineSections, generatedSections);
  }

  public enforceTechnologyConsistency(payload: {
    baselineSections?: Array<{ content?: string | null; title?: string | null }> | null;
    jobText?: string | null;
    [key: string]: unknown;
  }): ComplianceFlag[] {
    void payload;
    return [];
  }

  async validateAndAudit(payload: ValidateAndAuditRequest): Promise<ValidateAndAuditResult> {
    const flags: ComplianceFlag[] = [];

    const actorId = String(payload.actorId ?? '').trim();
    const outputHash = String(payload.outputHash ?? '').trim();
    const baselineVersionId = (payload.baselineVersion as any)?.id ?? null;
    const baselineVersionHash =
      (payload.baselineVersion as any)?.hash ??
      (payload.baselineVersion as any)?.fileHash ??
      null;
    const jobId = (payload.job as any)?.id ?? null;

    if (!actorId) {
      flags.push(
        this.flag('missing_actor', 'Actor id is required.', ComplianceFlagSeverity.BLOCK),
      );
    }

    if (!outputHash) {
      flags.push(
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
        flags.push(
          this.flag(
            ComplianceFlagCode.MISSING_BASELINE_VERSION,
            'baselineVersionId is required.',
            ComplianceFlagSeverity.BLOCK,
          ),
        );
      }

      if (!baselineVersionHash) {
        flags.push(
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
        flags.push({
          code: f.code as any,
          message: f.message,
          severity: f.severity ?? ComplianceFlagSeverity.BLOCK,
          evidence: f.evidence,
        });
      }
    }

    if (payload.scopeInflationDetected === true) {
      flags.push(
        this.flag(
          ComplianceFlagCode.SCOPE_INFLATION,
          'Potential scope inflation detected.',
          ComplianceFlagSeverity.BLOCK,
        ),
      );
    }

    const blocked = flags.some(
      (f) =>
        (f.severity ?? ComplianceFlagSeverity.BLOCK) === ComplianceFlagSeverity.BLOCK,
    );

    const audit = this.auditsRepository.create({
      actorId,
      action: payload.action,
      baselineVersionId,
      baselineVersionHash,
      jobId: jobId ?? null,
      outputHash,
      complianceFlags: flags,
      passFail: !blocked,
    });

    const savedAudit = await this.auditsRepository.save(audit);

    return {
      blocked,
      complianceFlags: flags,
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

  private flag(code: string, message: string, severity: ComplianceFlagSeverity): ComplianceFlag {
    return { code: code as any, message, severity };
  }
}
