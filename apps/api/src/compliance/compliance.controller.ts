import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceAudit } from './compliance-audit.entity';
import {
  ComplianceAction,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from './compliance.types';

@Controller('audit')
@UseGuards(AuthGuard('jwt'))
export class ComplianceController {
  constructor(
    @InjectRepository(ComplianceAudit)
    private readonly auditsRepository: Repository<ComplianceAudit>,
  ) {}

  @Get()
  async list(
    @Req() request: Request & { user?: { id?: string } },
    @Query('action') action?: ComplianceAction,
    @Query('artifact_id') artifactId?: string,
  ) {
    const actorId = request.user?.id;
    if (!actorId) {
      throw new BadRequestException('Invalid user context');
    }

    const where: Record<string, unknown> = { actorId };
    if (action) where.action = action;
    if (artifactId) where.outputHash = artifactId;

    const audits = await this.auditsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return audits;
  }

  @Post()
  async create(
    @Req() request: Request & { user?: { id?: string } },
    @Body()
    body: {
      action?: ComplianceAction;
      baseline_version_id?: string | null;
      baseline_version_hash?: string | null;
      job_id?: string | null;
      output_hash?: string | null;
      compliance_flags?: Array<{ code: ComplianceFlagCode; message?: string | null }>;
    },
  ) {
    const actorId = request.user?.id;
    if (!actorId) {
      throw new BadRequestException('Invalid user context');
    }

    if (!body.action) {
      throw new BadRequestException('action is required');
    }

    const complianceFlags =
      body.compliance_flags?.map((flag) => ({
        code: flag.code,
        message: flag.message ?? flag.code,
        severity: ComplianceFlagSeverity.BLOCK,
      })) ?? [];

    const blocked = complianceFlags.some(
      (flag) => flag.severity === ComplianceFlagSeverity.BLOCK,
    );

    const audit = this.auditsRepository.create({
      actorId,
      action: body.action,
      baselineVersionId: body.baseline_version_id ?? null,
      baselineVersionHash: body.baseline_version_hash ?? null,
      jobId: body.job_id ?? null,
      outputHash: body.output_hash ?? null,
      complianceFlags,
      passFail: !blocked,
    });

    return this.auditsRepository.save(audit);
  }
}
