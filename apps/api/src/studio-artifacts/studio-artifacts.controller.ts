import { BadRequestException, Controller, Get, Query, Req, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { StudioArtifactsService } from './studio-artifacts.service';

type UserRequest = Request & {
  user?: {
    id?: string;
  };
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
      throw new UnprocessableEntityException({
        error: {
          code: 'studio_artifacts_missing_ids',
          message: 'baselineId, baselineVersionId, and jobId are required',
        },
      });
    }

    const analysisIdValue = analysisId?.trim() ? analysisId.trim() : null;
    const idsToValidate = [baselineId, baselineVersionId, jobId].map((id) => String(id).trim());
    if (analysisIdValue) idsToValidate.push(analysisIdValue);

    if (!idsToValidate.every((id) => isUuid(id))) {
      throw new UnprocessableEntityException({
        error: {
          code: 'studio_artifacts_invalid_ids',
          message: analysisIdValue
            ? 'baselineId, baselineVersionId, jobId, and analysisId must be valid UUIDs'
            : 'baselineId, baselineVersionId, and jobId must be valid UUIDs',
        },
      });
    }

    // eslint-disable-next-line no-console
    console.log('[STUDIO_ARTIFACTS_FETCH]', {
      baselineId: baselineId.trim(),
      baselineVersionId: baselineVersionId.trim(),
      jobId: jobId.trim(),
    });

    const state = await this.studioArtifactsService.readState({
      userId,
      baselineId: baselineId.trim(),
      baselineVersionId: baselineVersionId.trim(),
      jobId: jobId.trim(),
      analysisId: analysisIdValue,
    });

    // eslint-disable-next-line no-console
    console.log('[STUDIO_ARTIFACTS_RESULT]', {
      hasResume: Boolean(state.resume?.responseBody),
      hasCoverLetter: Boolean(state.coverLetter?.responseBody),
      hasResumeContent: Boolean(state.resume?.content),
      hasCoverLetterContent: Boolean(state.coverLetter?.content),
      resumeContentLength: state.resume?.content?.length ?? 0,
      coverLetterContentLength: state.coverLetter?.content?.length ?? 0,
    });

    return state;
  }
}
