import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AnalysisService } from './analysis.service';
import type { AnalysisRequest } from './analysis.service';
import { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import { RunExpandedFitAssessmentDto } from './dto/run-expanded-fit-assessment.dto';

@Controller('analysis')
@UseGuards(AuthGuard('jwt'))
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post()
  async analyze(
    @Body() body: AnalysisRequest,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.analyzeForUser(userId, body);
  }

  @Post('run')
  async runFitAssessment(
    @Body() body: RunFitAssessmentDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.runFitAssessment(userId, body);
  }

  @Post('run-expanded')
  async runExpandedFitAssessment(
    @Body() body: RunExpandedFitAssessmentDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.runExpandedFitAssessment(userId, body);
  }

  @Get('fit-assessments')
  async getFitAssessments(
    @Query('jobId') jobId: string | undefined,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.getFitAssessments(userId, jobId);
  }

  @Get('fit-scores')
  async getFitScores(
    @Query('jobId') jobId: string | undefined,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.getFitScores(userId, jobId);
  }

  @Get('job/:jobId/latest')
  async getLatestAssessment(
    @Param('jobId') jobId: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.getLatestAssessment(userId, jobId);
  }

  @Get('job/:jobId/baseline/:baselineId/latest')
  async getLatestAssessmentForBaseline(
    @Param('jobId') jobId: string,
    @Param('baselineId') baselineId: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.getLatestAssessmentForBaseline(
      userId,
      jobId,
      baselineId,
    );
  }
}
