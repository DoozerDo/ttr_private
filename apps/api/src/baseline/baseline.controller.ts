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
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const sections = await this.baselineService.buildSectionsFromFile(file);

    const baseline = await this.baselineService.createBaseline(
      userId,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: file.path,
      },
      sections,
    );

    return baseline;
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
  async listBaselines(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineService.listBaselinesForUser(userId);
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

    // VERIFY: Ensure versions are only exposed for baselines owned by the requesting user.
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
}
