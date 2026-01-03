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
  extraFlags?: ComplianceFlag[];
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

    return [...flags, ...(context.extraFlags ?? [])];
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

  enforceResumeWritingRules({
    baselineSections,
    generatedSections,
  }: {
    baselineSections: Array<{ content: string; title?: string | null }>;
    generatedSections: Array<{ content: string; title?: string | null }>;
  }): ComplianceFlag[] {
    const baselineText = this.mergeText(baselineSections);
    const generatedText = this.mergeText(generatedSections);

    const stylizedCharacters = this.findStylizedPunctuation(generatedText);
    const normalizedBaselineText = this.normalizePunctuation(baselineText);
    const normalizedGeneratedText = this.normalizePunctuation(generatedText);

    const baselineNumbers = this.extractNumbers(normalizedBaselineText);
    const generatedNumbers = this.extractNumbers(normalizedGeneratedText);

    const baselineEntities = this.extractEntities(normalizedBaselineText);
    const generatedEntities = this.extractEntities(normalizedGeneratedText);

    const flags: ComplianceFlag[] = [];

    if (stylizedCharacters.length > 0) {
      flags.push({
        code: ComplianceFlagCode.STYLIZED_PUNCTUATION,
        severity: ComplianceFlagSeverity.BLOCK,
        message: `Stylized punctuation (${stylizedCharacters.join(
          '',
        )}) detected; use plain punctuation only.`,
      });
    }

    for (const num of generatedNumbers) {
      if (!baselineNumbers.has(num)) {
        flags.push({
          code: ComplianceFlagCode.INVENTED_METRIC,
          severity: ComplianceFlagSeverity.BLOCK,
          message: `Metric "${num}" not found in baseline.`,
        });
        break;
      }
    }

    for (const entity of generatedEntities) {
      if (!baselineEntities.has(entity)) {
        const isRole = /manager|engineer|lead|director|chief|officer|vp|president|analyst|specialist|consultant|architect/i.test(
          entity,
        );
        flags.push({
          code: isRole
            ? ComplianceFlagCode.INVENTED_ROLE
            : ComplianceFlagCode.INVENTED_COMPANY,
          severity: ComplianceFlagSeverity.BLOCK,
          message: `${isRole ? 'Role' : 'Company'} "${entity}" not found in baseline.`,
        });
        break;
      }
    }

    return flags;
  }

  private mergeText(sections: Array<{ content: string; title?: string | null }>) {
    return sections
      .map((section) => `${section.title ?? ''} ${section.content ?? ''}`)
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractNumbers(text: string) {
    const matches = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
    return new Set(matches.map((match) => match.trim()));
  }

  private extractEntities(text: string) {
    const candidates = text.match(/\b[A-Z][a-zA-Z0-9&.-]{2,}(?:\s+[A-Z][a-zA-Z0-9&.-]{1,})*/g) ?? [];
    return new Set(candidates.map((candidate) => candidate.trim()));
  }

  private normalizePunctuation(text: string) {
    return text
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[\u00b7\u2022\u2023\u2043\u2219]/g, '•')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findStylizedPunctuation(text: string) {
    const matches =
      text.match(/[\u2010-\u2015\u2212\u2026\u00b7\u2022\u2023\u2043\u2219]/g) ?? [];
    return Array.from(new Set(matches));
  }
}
