import {
  BadRequestException,
  Controller,
  HttpException,
  Get,
  Logger,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Express } from 'express';
import { BaselineService } from './baseline.service';
import { BaselineVersionService } from './baseline-version.service';
import { CloneFitReviewBaselineDto } from './dto/fit-review-clone.dto';

type UploadBaselineResponse = {
  baseline: any;
  baselineId: string;
  schemaVersion: string;
  userVerified: boolean;
  rolesCount: number;
  toolsCount: number;
  flagsSummary: {
    missingFields: number;
    lowConfidence: number;
  };
};

const stripBaselineVersioning = <T extends Record<string, unknown>>(baseline: T) => {
  const { version: _version, versions: _versions, ...rest } = baseline;
  return rest;
};

@Controller('baselines')
@UseGuards(AuthGuard('jwt'))
export class BaselineController {
  private readonly logger = new Logger(BaselineController.name);

  constructor(
    private readonly baselineService: BaselineService,
    private readonly baselineVersionService: BaselineVersionService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadBaseline(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: Request & { user?: { id?: string } },
  ): Promise<UploadBaselineResponse> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const parseResult = await this.baselineService.buildSectionsFromFile(file);

    const result = await this.baselineService.createBaseline(
      userId,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: file.path,
      },
      parseResult,
    );

    const canonical = result.ingestion?.canonical;
    const systemFlags = canonical?.system_generated_read_only;

    return {
      baseline: stripBaselineVersioning(
        result.baseline as unknown as Record<string, unknown>,
      ),
      baselineId: result.baseline.id,
      schemaVersion: canonical?.schema_version ?? 'baseline_schema_v1',
      userVerified: canonical?.user_verified ?? false,
      rolesCount: canonical?.experience.length ?? 0,
      toolsCount: canonical?.tooling_and_platforms?.tools.length ?? 0,
      flagsSummary: {
        missingFields: systemFlags?.missing_fields.length ?? 0,
        lowConfidence: systemFlags?.low_confidence_extractions.length ?? 0,
      },
    };
  }

  @Post(':id/reparse')
  async reparseBaseline(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineService.reparseBaselineForUser(id, userId);
  }

  @Get()
  async listBaselines(
    @Req() request: Request & { user?: { id?: string } },
    @Query('includeArchived') includeArchived?: string,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const include = includeArchived === 'true';
    const baselines = await this.baselineService.listBaselinesForUser(userId, include);
    return baselines.map((baseline) =>
      stripBaselineVersioning(baseline as unknown as Record<string, unknown>),
    );
  }

  @Patch(':id/archive')
  async archiveBaseline(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baseline = await this.baselineService.archiveBaseline(userId, id);
    return stripBaselineVersioning(baseline as unknown as Record<string, unknown>);
  }

  @Patch(':id/restore')
  async restoreBaseline(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baseline = await this.baselineService.restoreBaseline(userId, id);
    return stripBaselineVersioning(baseline as unknown as Record<string, unknown>);
  }

  @Get(':id')
  async getBaseline(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baseline = await this.baselineService.getBaselineByIdForUser(id, userId);
    return stripBaselineVersioning(baseline as unknown as Record<string, unknown>);
  }

  @Patch(':id/analysis-score')
  async recordBaselineAnalysisScore(
    @Param('id') id: string,
    @Body() body: { score?: number },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    if (typeof body?.score !== 'number' || Number.isNaN(body.score)) {
      throw new BadRequestException('score must be a number');
    }

    const baseline = await this.baselineService.recordBaselineAnalysisScore(
      userId,
      id,
      body.score,
    );
    return stripBaselineVersioning(baseline as unknown as Record<string, unknown>);
  }

  @Patch(':id/strengthening-additions')
  async appendStrengtheningAddition(
    @Param('id') id: string,
    @Body() body: { detail?: string },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    const detail = typeof body?.detail === 'string' ? body.detail : '';
    const trimmedDetail = detail.trim();

    this.logger.log(
      `PATCH /baselines/${id}/strengthening-additions userId=${userId ?? 'missing'} detailLength=${trimmedDetail.length}`,
    );

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    if (!trimmedDetail) {
      this.logger.warn(
        `PATCH /baselines/${id}/strengthening-additions validation failed: detail is required`,
      );
      throw new BadRequestException('detail is required');
    }

    try {
      const baseline = await this.baselineService.appendStrengtheningAddition(
        userId,
        id,
        trimmedDetail,
      );
      this.logger.log(
        `PATCH /baselines/${id}/strengthening-additions succeeded baselineId=${baseline.id}`,
      );
      return stripBaselineVersioning(baseline as unknown as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `PATCH /baselines/${id}/strengthening-additions failed userId=${userId} detailLength=${trimmedDetail.length} message=${message}`,
        stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        error: {
          code: 'BASELINE_UPDATE_REJECTED',
          message: `This update couldn't be applied because: ${message}`,
          details: {
            baselineId: id,
            reason: message,
          },
        },
      });
    }
  }

  @Get(':id/versions')
  async listBaselineVersions(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineService.listBaselineVersionsForUser(id, userId);
  }

  @Get(':id/blocks')
  async listBaselineBlocks(
    @Param('id') id: string,
    @Query('baseline_version_id') baselineVersionId: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineService.listBlocksForBaselineVersion(
      id,
      baselineVersionId,
      userId,
    );
  }

  @Patch(':id/blocks')
  async updateBaselineBlocks(
    @Param('id') id: string,
    @Body() body: any,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineService.updateBlockPolicies(userId, id, body);
  }

  @Post(':id/promote')
  async promoteBaselineVersion(
    @Param('id') id: string,
    @Body() body: { interviewId?: string; additions?: string[] },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineVersionService.approveVerifiedAdditions(userId, {
      baselineId: id,
      interviewId: body.interviewId,
      additions: body.additions,
    });
  }

  @Post(':baselineId/fit-review/clone')
  async cloneBaselineForFitReview(
    @Param('baselineId') baselineId: string,
    @Body() body: CloneFitReviewBaselineDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const trimmedBaselineId = baselineId?.trim();

    if (!trimmedBaselineId) {
      throw new BadRequestException('Baseline ID is required');
    }

    return this.baselineService.cloneBaselineForFitReview(
      userId,
      trimmedBaselineId,
      body.jobId,
      body.additions,
    );
  }
}
