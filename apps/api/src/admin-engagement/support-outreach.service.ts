import { Injectable } from '@nestjs/common';
import { UserEngagementState } from './user-engagement-state.service';
import { UserTriggerType } from './user-trigger.entity';

export type OutreachDraft = {
  subject: string;
  message: string;
};

@Injectable()
export class SupportOutreachService {
  buildDraft(input: {
    triggerType: UserTriggerType;
    state: UserEngagementState;
  }): OutreachDraft {
    const { triggerType, state } = input;
    const scoreLabel =
      typeof state.mostRecentScore === 'number' ? `${Math.round(state.mostRecentScore)}` : 'unknown';

    switch (triggerType) {
      case 'invite_reminder':
        return {
          subject: 'Quick nudge: finish setup',
          message:
            "You were invited but haven’t started your baseline yet. Once your baseline is set, you can run your first role analysis and get a real compatibility score. Start with one role you would actually apply to.",
        };
      case 'baseline_completion_nudge':
        return {
          subject: 'Baseline still incomplete',
          message:
            'Your baseline is started but not complete yet. Finish baseline setup so scoring and evidence checks are reliable. After that, run one role analysis and review results before generating documents.',
        };
      case 'first_analysis_nudge':
        return {
          subject: 'Follow-up on your first analysis',
          message:
            'You ran one analysis but there has been no follow-up action yet. Open Results and take the next step shown there. If score is low, update baseline and re-run the same role; if score is strong, move into Studio.',
        };
      case 'low_score_recovery':
        return {
          subject: 'Recover from low-fit score',
          message: `Your latest score is ${scoreLabel}, which means key signals are missing. Update your baseline with real evidence, then re-run the same role to measure change. The goal is directional score improvement with clearer matched signals.`,
        };
      case 'reanalysis_prompt':
        return {
          subject: 'Re-analysis is ready',
          message:
            'Your baseline changed after the last analysis. Re-running the same role now will show whether your score and matched signals improved. Use that delta to decide whether to continue or improve fit further.',
        };
      case 'apply_prompt':
        return {
          subject: 'Strong enough to move forward',
          message: `Your latest score is ${scoreLabel} and there is no application follow-through yet. If this role is still relevant, move from Results into Studio and generate final materials. Then track the application so progress is visible.`,
        };
      case 'reengagement_ping':
        return {
          subject: 'Quick re-engagement check',
          message:
            'You were active earlier but have been inactive recently. Re-open your latest role and continue from the next action shown in Results. If you need help, use the beta guide and Discord support channel.',
        };
      default:
        return {
          subject: 'Beta follow-up',
          message:
            'There is a pending beta follow-up action on your account. Re-open the product and continue from your latest Results step.',
        };
    }
  }
}

