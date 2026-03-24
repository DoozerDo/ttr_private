import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { Baseline } from '../baseline/baseline.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { User } from '../users/user.entity';
import { AdminEngagementController } from './admin-engagement.controller';
import { SupportOutreachService } from './support-outreach.service';
import { UserEngagementStateService } from './user-engagement-state.service';
import { UserTriggerEntity } from './user-trigger.entity';
import { UserTriggerService } from './user-trigger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Baseline,
      FitAssessment,
      Opportunity,
      AnalyticsEvent,
      UserTriggerEntity,
    ]),
    AdminUsersModule,
  ],
  controllers: [AdminEngagementController],
  providers: [UserEngagementStateService, UserTriggerService, SupportOutreachService],
  exports: [UserEngagementStateService, UserTriggerService, SupportOutreachService],
})
export class AdminEngagementModule {}

