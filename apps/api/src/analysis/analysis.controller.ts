import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
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
import { withTimeout } from '../common/timeout';
import { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import { RunExpandedFitAssessmentDto } from './dto/run-expanded-fit-assessment.dto';
import { AlignmentHistoryService } from './services/alignment-history.service';
import { CareerGravityService } from './services/career-gravity.service';
import { ScoreSimulatorService } from './services/score-simulator.service';

@Controller('analysis')
@UseGuards(AuthGuard('jwt'))
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly alignmentHistoryService: AlignmentHistoryService,
    private readonly careerGravityService: CareerGravityService,
    private readonly scoreSimulatorService: ScoreSimulatorService,
  ) {}

  @Post()
  async analyze(
    @Body() body: AnalysisRequest,
    @Req() request: Request & { user?: { id?: string } },
    @Query('debugCompliance') debugCompliance?: string,
    @Query('debugMatching') debugMatching?: string,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return withTimeout('analysis', () =>
      this.analysisService.analyzeForUser(userId, {
        ...body,
        debugCompliance:
          debugCompliance === '1' || debugCompliance === 'true' || Boolean(body.debugCompliance),
        debugMatching:
          debugMatching === '1' || debugMatching === 'true' || Boolean(body.debugMatching),
      }),
    );
  }

  @Post('run')
  async runFitAssessment(
    @Body() body: RunFitAssessmentDto,
    @Req() request: Request & { user?: { id?: string } },
    @Query('debug') debug?: string,
    @Query('debugCompliance') debugCompliance?: string,
    @Query('debugMatching') debugMatching?: string,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const debugEnabled =
      debug === '1' ||
      debug === 'true' ||
      Boolean(body.debug);
    const debugComplianceEnabled =
      debugCompliance === '1' ||
      debugCompliance === 'true' ||
      Boolean((body as { debugCompliance?: boolean }).debugCompliance);
    const debugMatchingEnabled =
      debugMatching === '1' ||
      debugMatching === 'true' ||
      Boolean((body as { debugMatching?: boolean }).debugMatching);

    const payload = {
      ...body,
      debug: debugEnabled,
      debugCompliance: debugComplianceEnabled,
      debugMatching: debugMatchingEnabled,
    };

    if (process.env.NODE_ENV !== 'production') {
      const baselineId = payload.baselineId;
      const jobId = payload.jobId;

      this.logger.log(
        `analysis.run request userId=${userId} baselineId=${baselineId ?? 'missing'} jobId=${jobId ?? 'missing'}`,
      );
    }

    const result = await withTimeout('analysis', () =>
      this.analysisService.runFitAssessment(userId, payload),
    );

    if (process.env.NODE_ENV !== 'production') {
      const assessmentId =
        'assessmentId' in result ? result.assessmentId : undefined;
      const baselineId =
        'baselineId' in result ? result.baselineId : undefined;
      const score =
        'score' in result
          ? result.score
          : 'fit_score' in result
            ? result.fit_score
            : undefined;

      this.logger.log(
        `analysis.run response userId=${userId} assessmentId=${assessmentId ?? 'missing'} baselineId=${baselineId ?? 'missing'} score=${score ?? 'missing'}`,
      );
    }

    return result;
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

    return withTimeout('analysis', () =>
      this.analysisService.runExpandedFitAssessment(userId, body),
    );
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

    return withTimeout('analysis', () =>
      this.analysisService.getFitAssessments(userId, jobId),
    );
  }

  @Get('fit-assessments/:assessmentId')
  async getFitAssessmentById(
    @Param('assessmentId') assessmentId: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return withTimeout('analysis', () =>
      this.analysisService.getFitAssessmentById(userId, assessmentId, {
        forceFreshRecompute: true,
      }),
    );
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

    return withTimeout('analysis', () =>
      this.analysisService.getFitScores(userId, jobId),
    );
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

    return withTimeout('analysis', () =>
      this.analysisService.getLatestAssessment(userId, jobId),
    );
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

    return withTimeout('analysis', () =>
      this.analysisService.getLatestAssessmentForBaseline(
        userId,
        jobId,
        baselineId,
      ),
    );
  }

  @Get('history')
  async getAlignmentHistory(
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return withTimeout('analysis', () =>
      this.alignmentHistoryService.getAlignmentHistory(userId),
    );
  }

  @Get('career-gravity')
  async getCareerGravity(
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return withTimeout('analysis', () =>
      this.careerGravityService.getCareerGravity(userId),
    );
  }

  @Get(':assessmentId/simulation')
  async getFitScoreSimulation(
    @Param('assessmentId') assessmentId: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return withTimeout('analysis', () =>
      this.scoreSimulatorService.getSimulation(userId, assessmentId),
    );
  }
}
