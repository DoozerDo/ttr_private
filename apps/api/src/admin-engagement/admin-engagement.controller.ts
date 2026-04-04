import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsUUID } from 'class-validator';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import { UserEngagementStateService } from './user-engagement-state.service';
import { SupportOutreachService } from './support-outreach.service';
import type { UserTriggerType } from './user-trigger.entity';
import { UserTriggerService } from './user-trigger.service';

class GenerateOutreachDraftDto {
  @IsUUID()
  userId!: string;

  @IsIn([
    'invite_reminder',
    'baseline_completion_nudge',
    'first_analysis_nudge',
    'low_score_recovery',
    'reanalysis_prompt',
    'apply_prompt',
    'reengagement_ping',
  ])
  triggerType!: UserTriggerType;
}

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin')
export class AdminEngagementController {
  constructor(
    private readonly stateService: UserEngagementStateService,
    private readonly triggerService: UserTriggerService,
    private readonly outreachService: SupportOutreachService,
  ) {}

  @Get('user-engagement-states')
  async listStates() {
    return this.stateService.listStates();
  }

  @Get('user-triggers')
  async listTriggers() {
    return this.triggerService.listRecent();
  }

  @Post('run-trigger-evaluation')
  async runEvaluation() {
    return this.triggerService.runEvaluation();
  }

  @Post('generate-outreach-draft')
  async generateDraft(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    payload: GenerateOutreachDraftDto,
  ) {
    const states = await this.stateService.listStates();
    const state = states.find((entry) => entry.userId === payload.userId);
    if (!state) {
      return {
        subject: 'User not found',
        message: 'No engagement state exists for the requested user.',
      };
    }
    return this.outreachService.buildDraft({
      triggerType: payload.triggerType,
      state,
    });
  }
}
