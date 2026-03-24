import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEngagementState, UserEngagementStateService } from './user-engagement-state.service';
import {
  UserTriggerEntity,
  UserTriggerPriority,
  UserTriggerType,
} from './user-trigger.entity';

export type UserTrigger = {
  userId: string;
  triggerType: UserTriggerType;
  priority: UserTriggerPriority;
  reason: string;
  createdAt: Date;
};

const TRIGGER_COOLDOWN_HOURS: Record<UserTriggerType, number> = {
  invite_reminder: 24,
  baseline_completion_nudge: 24,
  first_analysis_nudge: 24,
  low_score_recovery: 48,
  reanalysis_prompt: 24,
  apply_prompt: 24,
  reengagement_ping: 72,
};

const TRIGGER_ORDER: Array<{
  type: UserTriggerType;
  priority: UserTriggerPriority;
  flag: keyof UserEngagementState['stateFlags'];
  reason: (state: UserEngagementState) => string;
}> = [
  {
    type: 'invite_reminder',
    priority: 'medium',
    flag: 'invited_not_started',
    reason: () => 'User was invited but has not started baseline or analysis.',
  },
  {
    type: 'baseline_completion_nudge',
    priority: 'medium',
    flag: 'baseline_started_not_completed',
    reason: () => 'User started baseline but baseline progress is not complete.',
  },
  {
    type: 'first_analysis_nudge',
    priority: 'medium',
    flag: 'analyzed_once_no_followup',
    reason: () => 'User ran one analysis and did not follow up with opportunities.',
  },
  {
    type: 'low_score_recovery',
    priority: 'high',
    flag: 'low_score_no_action',
    reason: (state) => `Most recent score ${state.mostRecentScore ?? 'n/a'} is below 70 with no recovery action.`,
  },
  {
    type: 'reanalysis_prompt',
    priority: 'high',
    flag: 'reanalysis_available_not_used',
    reason: () => 'Baseline changed but user has not re-analyzed the same role yet.',
  },
  {
    type: 'apply_prompt',
    priority: 'medium',
    flag: 'high_score_not_applied',
    reason: (state) => `Most recent score ${state.mostRecentScore ?? 'n/a'} is >= 70 with no opportunity/application action.`,
  },
  {
    type: 'reengagement_ping',
    priority: 'low',
    flag: 'inactive_after_activity',
    reason: () => 'User became inactive after previous meaningful activity.',
  },
];

@Injectable()
export class UserTriggerService {
  constructor(
    private readonly userEngagementStateService: UserEngagementStateService,
    @InjectRepository(UserTriggerEntity)
    private readonly triggerRepository: Repository<UserTriggerEntity>,
  ) {}

  async listRecent(limit = 200): Promise<UserTriggerEntity[]> {
    return this.triggerRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  getTriggerForState(state: UserEngagementState): Omit<UserTrigger, 'createdAt'> | null {
    for (const mapping of TRIGGER_ORDER) {
      if (!state.stateFlags[mapping.flag]) continue;
      return {
        userId: state.userId,
        triggerType: mapping.type,
        priority: mapping.priority,
        reason: mapping.reason(state),
      };
    }
    return null;
  }

  async runEvaluation(): Promise<UserTriggerEntity[]> {
    const states = await this.userEngagementStateService.listStates();
    const emitted: UserTriggerEntity[] = [];

    for (const state of states) {
      const candidate = this.getTriggerForState(state);
      if (!candidate) continue;
      const allowed = await this.isOutsideCooldown(candidate.userId, candidate.triggerType);
      if (!allowed) continue;
      const saved = await this.triggerRepository.save(
        this.triggerRepository.create({
          userId: candidate.userId,
          triggerType: candidate.triggerType,
          priority: candidate.priority,
          reason: candidate.reason,
        }),
      );
      emitted.push(saved);
    }

    return emitted;
  }

  private async isOutsideCooldown(userId: string, triggerType: UserTriggerType): Promise<boolean> {
    const latest = await this.triggerRepository.findOne({
      where: { userId, triggerType },
      order: { createdAt: 'DESC' },
    });
    if (!latest) return true;
    const cooldownHours = TRIGGER_COOLDOWN_HOURS[triggerType];
    const elapsedMs = Date.now() - latest.createdAt.getTime();
    return elapsedMs >= cooldownHours * 60 * 60 * 1000;
  }
}

