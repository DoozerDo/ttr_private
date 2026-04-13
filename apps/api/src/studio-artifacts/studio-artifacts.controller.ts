import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { StudioArtifactsService } from './studio-artifacts.service';

type UserRequest = Request & {
  user?: {
    id?: string;
  };
};

@Controller('studio/artifacts')
@UseGuards(AuthGuard('jwt'))
export class StudioArtifactsController {
  constructor(private readonly studioArtifactsService: StudioArtifactsService) {}

  @Get()
  async getState(
    @Req() request: UserRequest,
    @Query('baselineId') baselineId?: string,
    @Query('baselineVersionId') baselineVersionId?: string,
    @Query('jobId') jobId?: string,
    @Query('analysisId') analysisId?: string,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    if (!baselineId?.trim() || !baselineVersionId?.trim() || !jobId?.trim()) {
      throw new BadRequestException('baselineId, baselineVersionId, and jobId are required');
    }

    return this.studioArtifactsService.readState({
      userId,
      baselineId: baselineId.trim(),
      baselineVersionId: baselineVersionId.trim(),
      jobId: jobId.trim(),
      analysisId: analysisId?.trim() || null,
    });
  }
}
