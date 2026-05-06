import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
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
import { CoverLettersService } from './cover-letters.service';
import type { CoverLetterGenerationResponse } from './cover-letters.service';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import {
  Entitlements,
  FeatureKey,
  assertFeatureAvailable,
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

type TieredRequest = Request & {
  user?: {
    id?: string;
    subscriptionTier?: SubscriptionTier;
    betaAccessApproved?: boolean;
    entitlements?: Entitlements;
  };
};

type CoverLetterExportFormat = 'docx' | 'pdf';

@Controller('cover-letters')
@UseGuards(AuthGuard('jwt'))
export class CoverLettersController {
  private readonly logger = new Logger(CoverLettersController.name);

  constructor(private readonly coverLettersService: CoverLettersService) {}

  @Post('generate')
  async generate(
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
  ): Promise<GenerationOutcome<CoverLetterGenerationResponse> & CoverLetterGenerationResponse> {
    const userId = this.requireUserId(request);

    // eslint-disable-next-line no-console
    console.log('[COVER_LETTER_GENERATE_START]', {
      baselineId: body.baselineId ?? null,
      baselineVersionId: body.baselineVersionId ?? null,
      jobId: body.jobId ?? null,
    });

    const entitlements = resolveEntitlementsFromUser(request.user);
    assertFeatureAvailable(entitlements, FeatureKey.COVER_LETTER_EXPORT);

    return this.executeGenerationOutcome('cover_letters.generate', body, () =>
      this.coverLettersService.generateCoverLetter(userId, body),
    );
  }

  @Get()
  async list(@Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return withTimeout('generation', () =>
      this.coverLettersService.listCoverLetters(userId),
    );
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return withTimeout('generation', () =>
      this.coverLettersService.getCoverLetter(userId, id),
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return withTimeout('generation', () =>
      this.coverLettersService.deleteCoverLetter(userId, id),
    );
  }

  @Post('export')
  async exportCoverLetter(
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTimeout('generation', () =>
      this.handleExport(body, request, res, 'docx'),
    );
  }

  @Post('export/:format')
  async exportCoverLetterWithFormat(
    @Param('format') formatParam: string,
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format = this.normalizeFormat(formatParam);
    return withTimeout('generation', () =>
      this.handleExport(body, request, res, format),
    );
  }

  @Post('readiness')
  async getGenerationReadiness(
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
  ) {
    const userId = this.requireUserId(request);

    // Defensive logging + shielding: readiness is a preflight signal and must not 500 for
    // "normal" UX flows (including post-generation refreshes).
    try {
      this.logger.log(
        `[readiness] cover_letters.readiness request userId=${userId} baselineId=${(body as any)?.baselineId ?? 'null'} baselineVersionId=${(body as any)?.baselineVersionId ?? 'null'} jobId=${(body as any)?.jobId ?? 'null'} analysisId=${(body as any)?.analysisId ?? 'null'}`,
      );
    } catch {
      // ignore logging errors
    }

    try {
      return await withTimeout('generation', () =>
        this.coverLettersService.getGenerationReadiness(userId, body),
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[readiness] cover_letters.readiness failed userId=${userId} message=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private normalizeFormat(value: string): CoverLetterExportFormat {
    const normalized = (value ?? '').toLowerCase().trim();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'docx') return 'docx';
    throw new BadRequestException('Invalid format. Use docx or pdf.');
  }

  private async handleExport(
    body: GenerateCoverLetterDto,
    request: TieredRequest,
    res: Response,
    format: CoverLetterExportFormat,
  ): Promise<StreamableFile> {
    const userId = this.requireUserId(request);

    const entitlements = resolveEntitlementsFromUser(request.user);
    ensureExportTierAvailable(entitlements, FeatureKey.COVER_LETTER_EXPORT, 'EXPORT_COVER');

    const file = await this.coverLettersService.exportCoverLetter(
      userId,
      body,
      format,
    );

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

  private async executeGenerationOutcome(
    entrySource: string,
    body: GenerateCoverLetterDto,
    task: () => Promise<CoverLetterGenerationResponse>,
  ): Promise<GenerationOutcome<CoverLetterGenerationResponse> & CoverLetterGenerationResponse> {
    const runId = createGenerationRunId();
    const startedAt = Date.now();
    const artifactType = 'cover_letter' as const;
    this.logger.log(
      `[generation] start runId=${runId} artifactType=${artifactType} entrySource=${entrySource} baselineId=${body.baselineId ?? 'null'} baselineVersionId=${body.baselineVersionId ?? 'null'} jobId=${body.jobId ?? 'null'} analysisId=${body.analysisId ?? 'null'}`,
    );

    try {
      const result = await withTimeout('generation', task);
      const outcome = buildGenerationSuccessOutcome({
        artifactType,
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
        `[generation] success runId=${runId} artifactType=${artifactType} entrySource=${entrySource} durationMs=${duration} baselineId=${body.baselineId ?? 'null'} baselineVersionId=${body.baselineVersionId ?? 'null'} jobId=${body.jobId ?? 'null'} analysisId=${body.analysisId ?? 'null'}`,
      );
      return {
        ...result,
        ...outcome,
        generationStatus: 'success',
        exportReady: result.exportReady,
      } as unknown as GenerationOutcome<CoverLetterGenerationResponse> & CoverLetterGenerationResponse;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409) {
        const response = error.getResponse();
        const responseRecord =
          response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
        const nestedError =
          responseRecord?.error && typeof responseRecord.error === 'object'
            ? (responseRecord.error as Record<string, unknown>)
            : null;
        const code = String(nestedError?.code ?? responseRecord?.code ?? '').trim();
        const existingCoverLetterId = String(
          nestedError?.existingCoverLetterId ?? responseRecord?.existingCoverLetterId ?? '',
        ).trim();
        if (code === 'COVER_LETTER_DUPLICATE' && existingCoverLetterId) {
          const duration = Date.now() - startedAt;
          this.logger.log(
            `[generation] success runId=${runId} artifactType=${artifactType} entrySource=${entrySource} durationMs=${duration} baselineId=${body.baselineId ?? 'null'} baselineVersionId=${body.baselineVersionId ?? 'null'} jobId=${body.jobId ?? 'null'} analysisId=${body.analysisId ?? 'null'} code=artifact_updated existingCoverLetterId=${existingCoverLetterId}`,
          );
          return {
            status: 'success',
            generationStatus: 'success',
            exportReady: false,
            code: 'artifact_updated',
            message: 'A matching cover letter already exists.',
            retryable: false,
            nextAction: 'review_draft',
            artifactType,
            runId,
            payload: {
              existingCoverLetterId,
            },
          } as unknown as GenerationOutcome<CoverLetterGenerationResponse> & CoverLetterGenerationResponse;
        }
      }
      const outcome = mapGenerationExceptionToOutcome({
        artifactType,
        error,
        runId,
      });
      const duration = Date.now() - startedAt;
      const logMethod =
        outcome.code === 'generation_timeout' || outcome.retryable ? 'warn' : 'error';
      this.logger[logMethod](
        `[generation] ${outcome.status} runId=${runId} artifactType=${artifactType} entrySource=${entrySource} code=${outcome.code} durationMs=${duration} baselineId=${body.baselineId ?? 'null'} baselineVersionId=${body.baselineVersionId ?? 'null'} jobId=${body.jobId ?? 'null'} analysisId=${body.analysisId ?? 'null'} message=${outcome.message}`,
      );
      return {
        ...outcome,
        generationStatus: 'error',
        exportReady: false,
        payload: outcome.payload ?? {
          baselineId: body.baselineId ?? null,
          baselineVersionId: body.baselineVersionId ?? null,
          jobId: body.jobId ?? null,
          analysisId: body.analysisId ?? null,
        },
      } as unknown as GenerationOutcome<CoverLetterGenerationResponse> & CoverLetterGenerationResponse;
    }
  }

  private requireUserId(request: TieredRequest) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return userId;
  }
}
