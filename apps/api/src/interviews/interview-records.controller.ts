import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpException,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { CreateInterviewRecordDto } from './dto/create-interview.dto';
import { ApplyAdditionDecisionsDto } from './dto/apply-addition-decisions.dto';
import { CreateInterviewAcceptedAdditionDto } from './dto/create-accepted-addition.dto';
import { UpdateInterviewRecordDto } from './dto/update-interview.dto';
import { UpdateAcceptedAdditionsDto } from './dto/update-accepted-additions.dto';
import { InterviewRecordsService } from './interview-records.service';
import { withTimeout } from '../common/timeout';
import type {
  ExpandedFitComputeError,
  ExpandedFitComputeOutcome,
} from './interview-records.service';

@Controller('interview-records')
@UseGuards(AuthGuard('jwt'))
export class InterviewRecordsController {
  private readonly logger = new Logger(InterviewRecordsController.name);

  constructor(
    private readonly interviewRecordsService: InterviewRecordsService,
  ) {}

  @Post()
  async createInterviewRecord(
    @Body() body: CreateInterviewRecordDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.createInterviewRecord(userId, body);
  }

  @Post('start')
  async startInterviewFromFitReview(
    @Body()
    body: {
      jobId?: string;
      baselineId?: string;
      baselineVersionId?: string;
    },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.startInterviewFromFitReview(userId, {
      jobId: body.jobId,
      baselineId: body.baselineId,
      baselineVersionId: body.baselineVersionId,
    });
  }

  @Get()
  async listInterviewRecords(
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.listInterviewRecordsForUser(userId);
  }

  @Get(':id')
  async getInterviewRecord(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.getInterviewRecordForUserResponse(
      id,
      userId,
    );
  }

  @Get(':id/recommended-additions')
  async getRecommendedAdditions(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.listRecommendedAdditions(id, userId);
  }

  @Get(':id/accepted-additions')
  async getAcceptedAdditions(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.listAcceptedAdditions(id, userId);
  }

  @Post(':id/accepted-additions')
  async acceptAddition(
    @Param('id') id: string,
    @Body() body: CreateInterviewAcceptedAdditionDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.acceptRecommendation(id, userId, body);
  }

  @Patch(':id')
  async updateInterviewRecord(
    @Param('id') id: string,
    @Body() body: UpdateInterviewRecordDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.updateInterviewRecord(id, userId, body);
  }

  @Post(':id/responses')
  async saveInterviewResponses(
    @Param('id') id: string,
    @Body() body: { responses?: unknown[] },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.saveInterviewResponses(id, userId, {
      responses: body?.responses,
    });
  }

  @Post(':id/decisions')
  async applyAdditionDecisions(
    @Param('id') id: string,
    @Body() body: ApplyAdditionDecisionsDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.applyAdditionDecisions(
      id,
      userId,
      body,
    );
  }

  @Patch(':id/accepted-additions')
  async updateAcceptedAdditions(
    @Param('id') id: string,
    @Body() body: UpdateAcceptedAdditionsDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.updateAcceptedAdditions(
      id,
      userId,
      body?.acceptedAdditionIds ?? [],
    );
  }

  @Post(':id/compute-expanded-fit')
  @HttpCode(200)
  async computeExpandedFit(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ): Promise<ExpandedFitComputeOutcome> {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const runId = randomUUID();
    const startedAt = Date.now();

    try {
      return await withTimeout('compute-expanded-fit', () =>
        this.interviewRecordsService.computeExpandedFit(id, userId, { runId }),
      );
    } catch (error) {
      const outcome = this.buildExpandedFitTimeoutOutcome(error, runId);
      if (outcome.code === 'computation_timeout') {
        this.logger.warn(
          `[expanded-fit] timeout runId=${runId} interviewRecordId=${id} durationMs=${Date.now() - startedAt}`,
        );
      } else {
        this.logger.warn(
          `[expanded-fit] controller-failure runId=${runId} interviewRecordId=${id} code=${outcome.code} durationMs=${Date.now() - startedAt}`,
        );
      }
      return outcome;
    }
  }

  private buildExpandedFitTimeoutOutcome(
    error: unknown,
    runId: string,
  ): ExpandedFitComputeError {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const responseRecord =
        response && typeof response === 'object'
          ? (response as Record<string, unknown>)
          : null;
      const nestedError =
        responseRecord && typeof responseRecord.error === 'object'
          ? (responseRecord.error as Record<string, unknown>)
          : null;
      const status =
        (typeof nestedError?.status === 'string' && nestedError.status) ||
        (typeof responseRecord?.status === 'string' && responseRecord.status) ||
        null;
      const code =
        (typeof nestedError?.code === 'string' && nestedError.code) ||
        (typeof responseRecord?.code === 'string' && responseRecord.code) ||
        null;

      if (status === 'timeout' || code === 'timeout' || code === 'computation_timeout') {
        return {
          status: 'error',
          code: 'computation_timeout',
          message: 'This is taking longer than expected. Please try again.',
          retryable: true,
          nextAction: 'retry_compute',
          runId,
        };
      }
    }

    if (error instanceof Error && /timeout/i.test(error.message)) {
      return {
        status: 'error',
        code: 'computation_timeout',
        message: 'This is taking longer than expected. Please try again.',
        retryable: true,
        nextAction: 'retry_compute',
        runId,
      };
    }

    return {
      status: 'error',
      code: 'computation_failed',
      message: 'Expanded fit could not be computed right now. Save your answers and try again.',
      retryable: true,
      nextAction: 'retry_compute',
      runId,
    };
  }

  @Post(':id/promote-accepted-additions')
  async promoteAcceptedAdditions(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.promoteAcceptedAdditions(id, userId);
  }

  @Delete(':id')
  async deleteInterviewRecord(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.deleteInterviewRecord(id, userId);
  }
}
