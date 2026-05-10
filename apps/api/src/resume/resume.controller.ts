import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import { ResumeService } from './resume.service';
import type { GenerateResumeRequest, ResumeGenerationResponse } from './resume.service';
import {
  Entitlements,
  FeatureKey,
  resolveEntitlementsFromUser,
} from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { ensureExportTierAvailable } from '../tiers/export-tier-helpers';
import { withTimeout } from '../common/timeout';
import {
  buildGenerationSuccessOutcome,
  createGenerationRunId,
  mapGenerationExceptionToOutcome,
  type GenerationOutcome,
} from '../generation/generation-outcome';

type ResumeExportFormat = 'docx' | 'pdf';

interface ResumeRequestBody {
  baselineId?: string;
  baselineVersionId?: string;
  jobId?: string;
  analysisId?: string;
  format?: ResumeExportFormat;
  oneTap?: boolean;
  forceRegenerate?: boolean;
  editedResume?: NormalizedResumeDocument;
}

type TieredResumeRequest = Request & {
  user?: {
    id?: string;
    subscriptionTier?: SubscriptionTier;
    betaAccessApproved?: boolean;
    entitlements?: Entitlements;
  };
};

@Controller('resume')
@UseGuards(AuthGuard('jwt'))
export class ResumeController {
  private readonly logger = new Logger(ResumeController.name);

  constructor(private readonly resumeService: ResumeService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateResume(
    @Body() body: ResumeRequestBody,
    @Req() request: TieredResumeRequest,
  ): Promise<GenerationOutcome<ResumeGenerationResponse> & ResumeGenerationResponse> {
    // eslint-disable-next-line no-console
    console.log(
      `[RESUME_GENERATE_RUNTIME_PROOF] version=runtime-proof-2026-05-01-template-filter forceRegenerate=${String(
        body.forceRegenerate ?? false,
      )} score=null`,
    );
    // eslint-disable-next-line no-console
    console.log('[RESUME_GENERATE_ENTRY]', {
      forceRegenerate: Boolean(body.forceRegenerate),
      baselineId: body.baselineId?.trim() ?? null,
      baselineVersionId: body.baselineVersionId?.trim() ?? null,
      jobId: body.jobId?.trim() ?? null,
    });
    // eslint-disable-next-line no-console
    console.log('[RESUME_GENERATE_START]', {
      baselineId: body.baselineId?.trim() ?? null,
      baselineVersionId: body.baselineVersionId?.trim() ?? null,
      jobId: body.jobId?.trim() ?? null,
    });
    return this.executeGenerationOutcome('resume.generate', body, () =>
      this.handleGenerate(body, request),
    );
  }

  /**
   * ROUTE ALIAS (legacy compatibility):
   *
   * `POST /resume` is an alias of `POST /resume/generate`.
   *
   * Canonical route: `POST /resume/generate`
   * Alias route: `POST /resume`
   *
   * Keep both routing through the same handler/service to avoid divergent generation authority.
   * Do not add additional resume generation routes without an explicit deprecation plan.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async createResumeRequest(
    @Body() body: ResumeRequestBody,
    @Req() request: TieredResumeRequest,
  ): Promise<GenerationOutcome<ResumeGenerationResponse> & ResumeGenerationResponse> {
    return this.executeGenerationOutcome('resume.create', body, () =>
      this.handleGenerate(body, request),
    );
  }

  @Post('export')
  async exportResume(
    @Body() body: ResumeRequestBody,
    @Req() request: TieredResumeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format: ResumeExportFormat = body.format ?? 'docx';
    return withTimeout('generation', () =>
      this.handleExport(body, request, res, format),
    );
  }

  @Post('export/:format')
  async exportResumeWithFormat(
    @Param('format') formatParam: string,
    @Body() body: ResumeRequestBody,
    @Req() request: TieredResumeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format = this.normalizeFormat(formatParam);
    return withTimeout('generation', () =>
      this.handleExport(body, request, res, format),
    );
  }

  @Post('readiness')
  async getGenerationReadiness(
    @Body() body: ResumeRequestBody,
    @Req() request: TieredResumeRequest,
  ) {
    const userId = this.getUserId(request);
    const payload = this.parsePayload(body);
    try {
      return await withTimeout('generation', () =>
        this.resumeService.getGenerationReadiness(userId, payload),
      );
    } catch (error) {
      // Product rule: readiness is informational only. Never fail readiness with 422 for non-ID reasons.
      if (error instanceof UnprocessableEntityException) {
        const response = (error as any).getResponse?.() as any;
        const errorRecord = response && typeof response === 'object' ? (response as any).error : null;
        const code = typeof errorRecord?.code === 'string' ? errorRecord.code : 'readiness_error';
        const message =
          typeof errorRecord?.message === 'string'
            ? errorRecord.message
            : 'Readiness could not be evaluated from the current state.';

        return {
          status: 'blocked',
          blocked: true,
          compliance_flags: [],
          reasons: [{ code, message }],
        };
      }
      // eslint-disable-next-line no-console
      console.error('[resume-readiness][error]', {
        userId,
        baselineId: payload.baselineId ?? null,
        baselineVersionId: payload.baselineVersionId ?? null,
        jobId: payload.jobId ?? null,
        analysisId: payload.analysisId ?? null,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error ?? ''),
        stack: error instanceof Error ? error.stack : null,
      });
      throw error;
    }
  }

  private normalizeFormat(value: string): ResumeExportFormat {
    const normalized = (value ?? '').toLowerCase().trim();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'docx') return 'docx';
    throw new BadRequestException('Invalid format. Use docx or pdf.');
  }

  private getUserId(request: TieredResumeRequest) {
    const userId = request.user?.id;
    if (!userId) throw new BadRequestException('Invalid user context');
    return userId;
  }

  private parsePayload(body: ResumeRequestBody): GenerateResumeRequest {
    const baselineId = body.baselineId?.trim();
    const baselineVersionId = body.baselineVersionId?.trim() || null;
    const jobId = body.jobId?.trim();
    const analysisId = body.analysisId?.trim();
    const oneTap = Boolean(body.oneTap);

    if (!baselineId) {
      throw new UnprocessableEntityException({
        error: {
          code: 'studio_not_ready',
          message: 'baselineId is required',
        },
      });
    }
    if (!jobId) {
      throw new UnprocessableEntityException({
        error: {
          code: 'target_context_missing',
          message: 'jobId is required',
        },
      });
    }
    return {
      baselineId,
      baselineVersionId,
      jobId,
      ...(analysisId ? { analysisId } : {}),
      oneTap,
      forceRegenerate: Boolean(body.forceRegenerate),
      editedResume: body.editedResume,
    };
  }

  private async handleGenerate(
    body: ResumeRequestBody,
    request: TieredResumeRequest,
  ) {
    const userId = this.getUserId(request);
    const payload = this.parsePayload(body);

    return this.resumeService.generateResume(userId, payload);
  }

  private async executeGenerationOutcome(
    entrySource: string,
    body: ResumeRequestBody,
    task: () => Promise<ResumeGenerationResponse>,
  ): Promise<GenerationOutcome<ResumeGenerationResponse> & ResumeGenerationResponse> {
    const runId = createGenerationRunId();
    const startedAt = Date.now();
    const payload = {
      baselineId: body.baselineId?.trim() ?? 'null',
      baselineVersionId: body.baselineVersionId?.trim() ?? 'null',
      jobId: body.jobId?.trim() ?? 'null',
      analysisId: body.analysisId?.trim() ?? 'null',
    };
    this.logger.log(
      `[generation] start runId=${runId} artifactType=resume entrySource=${entrySource} baselineId=${payload.baselineId} baselineVersionId=${payload.baselineVersionId} jobId=${payload.jobId ?? 'null'} analysisId=${payload.analysisId ?? 'null'}`,
    );

    try {
      const result = await withTimeout('generation', task);
      const outcome = buildGenerationSuccessOutcome({
        artifactType: 'resume',
        runId,
        code: result.idempotency?.status === 'existing_completed' ? 'duplicate_request_reused' : 'draft_generated',
        message:
          result.idempotency?.status === 'existing_completed'
            ? 'An existing draft was reused.'
            : 'A draft is ready.',
        nextAction: 'review_draft',
        payload: result,
      });
      const duration = Date.now() - startedAt;
      this.logger.log(
        `[generation] success runId=${runId} artifactType=resume entrySource=${entrySource} durationMs=${duration} baselineId=${payload.baselineId} baselineVersionId=${payload.baselineVersionId} jobId=${payload.jobId ?? 'null'} analysisId=${payload.analysisId ?? 'null'}`,
      );
      return {
        ...result,
        ...outcome,
        generationStatus: 'success',
        exportReady: result.exportReady,
      } as unknown as GenerationOutcome<ResumeGenerationResponse> & ResumeGenerationResponse;
    } catch (error) {
      const outcome = mapGenerationExceptionToOutcome({
        artifactType: 'resume',
        error,
        runId,
      });
      const duration = Date.now() - startedAt;
      const logMethod =
        outcome.code === 'generation_timeout' || outcome.retryable ? 'warn' : 'error';
      this.logger[logMethod](
        `[generation] ${outcome.status} runId=${runId} artifactType=resume entrySource=${entrySource} code=${outcome.code} durationMs=${duration} baselineId=${payload.baselineId} baselineVersionId=${payload.baselineVersionId} jobId=${payload.jobId ?? 'null'} analysisId=${payload.analysisId ?? 'null'} message=${outcome.message}`,
      );
      return {
        ...outcome,
        generationStatus: 'error',
        exportReady: false,
        payload: outcome.payload ?? {
          baselineId: payload.baselineId,
          baselineVersionId: payload.baselineVersionId,
          jobId: payload.jobId,
          analysisId: payload.analysisId,
        },
      } as unknown as GenerationOutcome<ResumeGenerationResponse> & ResumeGenerationResponse;
    }
  }

  private async handleExport(
    body: ResumeRequestBody,
    request: TieredResumeRequest,
    res: Response,
    format: ResumeExportFormat,
  ): Promise<StreamableFile> {
    const userId = this.getUserId(request);
    const payload = this.parsePayload(body);

    const entitlements = resolveEntitlementsFromUser(request.user);
    ensureExportTierAvailable(entitlements, FeatureKey.RESUME_EXPORT, 'EXPORT_RESUME');

    const file = await this.resumeService.exportResume(userId, payload, format);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('Content-Length', String(file.buffer.byteLength));
    res.setHeader('X-Compliance-Audit-Id', file.auditId);
    if (file.baselineVersionHash) {
      res.setHeader('X-Baseline-Version-Hash', file.baselineVersionHash);
    }
    res.status(HttpStatus.CREATED);

    return new StreamableFile(file.buffer);
  }
}
