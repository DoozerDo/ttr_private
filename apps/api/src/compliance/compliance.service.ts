import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job } from '../jobs/job.entity';
import { ComplianceAudit } from './compliance-audit.entity';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from './compliance.types';

type ComplianceContext = {
  actorId: string;
  action: ComplianceAction;
  baselineVersion?: BaselineVersion | null;
  job?: Job | null;
  outputHash?: string | null;
  scopeInflationDetected?: boolean;
};

@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(ComplianceAudit)
    private readonly auditsRepository: Repository<ComplianceAudit>,
  ) {}

  private buildFlags(context: ComplianceContext): ComplianceFlag[] {
    const flags: ComplianceFlag[] = [];

    if (!context.baselineVersion?.hash) {
      flags.push({
        code: ComplianceFlagCode.MISSING_BASELINE_HASH,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Baseline version hash is required.',
      });
    }

    if (context.job && !context.job.company?.trim()) {
      flags.push({
        code: ComplianceFlagCode.UNKNOWN_COMPANY,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Job company must be provided for generation.',
      });
    }

    if (context.scopeInflationDetected) {
      flags.push({
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Detected potential scope inflation against baseline.',
      });
    }

    return flags;
  }

  private buildJobHash(job?: Job | null) {
    if (!job?.rawDescription) return null;
    return createHash('sha256').update(job.rawDescription).digest('hex');
  }

  async validateAndAudit(context: ComplianceContext) {
    const complianceFlags = this.buildFlags(context);
    const blocked = complianceFlags.some(
      (flag) => flag.severity === ComplianceFlagSeverity.BLOCK,
    );

    const audit = this.auditsRepository.create({
      actorId: context.actorId,
      action: context.action,
      baselineVersionHash: context.baselineVersion?.hash ?? null,
      jobHash: this.buildJobHash(context.job),
      outputHash: context.outputHash ?? null,
      complianceFlags,
      passFail: !blocked,
    });

    const saved = await this.auditsRepository.save(audit);

    return {
      complianceFlags,
      blocked,
      audit: saved,
    };
  }
}
