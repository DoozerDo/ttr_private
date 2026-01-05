import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { BaselineVersion } from '../baseline/baseline-version.entity';
import type { Job } from '../jobs/job.entity';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagSeverity,
} from './compliance.types';

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

    return flags;
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

    if (Array.isArray(payload.extraFlags) && payload.extraFlags.length) {
      for (const f of payload.extraFlags) {
        if (!f || typeof f.code !== 'string' || !f.code.trim()) continue;
        flags.push({
          code: f.code as any,
          message: f.message,
          severity: f.severity ?? ComplianceFlagSeverity.BLOCK,
        });
      }
    }

    if (payload.scopeInflationDetected === true) {
      flags.push(
        this.flag(
          'scope_inflation_detected',
          'Potential scope inflation detected.',
          ComplianceFlagSeverity.BLOCK,
        ),
      );
    }

    const blocked = flags.some(
      (f) =>
        (f.severity ?? ComplianceFlagSeverity.BLOCK) === ComplianceFlagSeverity.BLOCK,
    );

    const auditId = this.buildAuditId(payload);

    const baselineVersionHash =
      (payload.baselineVersion as any)?.hash ??
      (payload.baselineVersion as any)?.fileHash ??
      null;

    const jobId = (payload.job as any)?.id ?? null;

    return {
      blocked,
      complianceFlags: flags,
      audit: {
        id: auditId,
        outputHash: outputHash || '',
        action: payload.action,
        actorId: actorId || '',
        baselineVersionHash,
        jobId,
        createdAt: new Date().toISOString(),
      },
    };
  }

  private flag(code: string, message: string, severity: ComplianceFlagSeverity): ComplianceFlag {
    return { code: code as any, message, severity };
  }

  private buildAuditId(payload: ValidateAndAuditRequest): string {
    const baselineHash =
      (payload.baselineVersion as any)?.hash ??
      (payload.baselineVersion as any)?.fileHash ??
      null;

    const jobId = (payload.job as any)?.id ?? null;

    const fingerprint = {
      action: payload.action,
      actorId: String(payload.actorId ?? ''),
      baselineHash,
      jobId,
      outputHash: String(payload.outputHash ?? ''),
    };

    return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  }
}
