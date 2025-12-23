import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { FitScoreRequest } from './analysis.service';
import { AnalysisService } from './analysis.service';

@Controller('fit-scores')
@UseGuards(AuthGuard('jwt'))
export class FitScoresController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post()
  async score(
    @Body() body: FitScoreRequest,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.scoreCompatibility(userId, body);
  }
}
