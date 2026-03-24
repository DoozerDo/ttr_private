import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import { SyntheticTransactionRunnerService } from './synthetic-transaction-runner.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin/synthetic-transactions')
export class SyntheticTransactionsController {
  constructor(
    private readonly syntheticTransactionRunnerService: SyntheticTransactionRunnerService,
  ) {}

  @Post('core-loop-smoke/run')
  runCoreLoopSmoke() {
    return this.syntheticTransactionRunnerService.runCoreLoopSmoke('manual');
  }

  @Get('core-loop-smoke/runs')
  listCoreLoopRuns(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    if (!Number.isFinite(limit) || limit < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return this.syntheticTransactionRunnerService.listRecentSyntheticTransactionRuns(limit);
  }

  @Get('core-loop-smoke/latest')
  getLatestCoreLoopRun() {
    return this.syntheticTransactionRunnerService.getLatestCoreLoopRun();
  }
}
