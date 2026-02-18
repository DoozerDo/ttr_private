import {
  BadRequestException,
  Controller,
  Get,
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
  uploadStatus: any;
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

@Controller('baselines')
@UseGuards(AuthGuard('jwt'))
export class BaselineController {
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
      baseline: result.baseline,
      uploadStatus: result.uploadStatus,
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
    return this.baselineService.listBaselinesForUser(userId, include);
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

    return this.baselineService.archiveBaseline(userId, id);
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

    return this.baselineService.restoreBaseline(userId, id);
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

    return this.baselineService.getBaselineByIdForUser(id, userId);
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
