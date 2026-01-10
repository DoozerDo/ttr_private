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
import type { FitScoreRequest, DebugSource } from './analysis.service';
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

    const headerDebug = isHeaderDebugEnabled(request);
    const queryDebug = isQueryDebugEnabled(request);
    const bodyDebug = Boolean(body?.debug);
    const debugEnabled = headerDebug || queryDebug || bodyDebug;
    const debugSource: DebugSource = determineDebugSource(headerDebug, queryDebug, bodyDebug);

    const payloadWithDebug = {
      ...body,
      debug: debugEnabled,
      debugSource,
    };

    return this.analysisService.scoreCompatibility(userId, payloadWithDebug);
  }
}

const isHeaderDebugEnabled = (req: Request) => {
  return String(req.headers['x-ttr-debug'] ?? '').trim() === '1';
};

const isQueryDebugEnabled = (req: Request) => {
  return String(req.query?.debug ?? '').trim() === '1';
};

const determineDebugSource = (
  headerDebug: boolean,
  queryDebug: boolean,
  bodyDebug: boolean,
): DebugSource => {
  if (headerDebug) return 'header';
  if (queryDebug) return 'query';
  if (bodyDebug) return 'body';
  return 'none';
};
