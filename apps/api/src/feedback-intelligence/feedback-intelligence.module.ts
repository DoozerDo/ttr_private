import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { Baseline } from '../baseline/baseline.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { FeedbackItem } from './feedback-item.entity';
import { FeedbackIntelligenceController } from './feedback-intelligence.controller';
import { FeedbackIntelligenceService } from './feedback-intelligence.service';
import { FrictionEvent } from './friction-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedbackItem,
      FrictionEvent,
      Baseline,
      FitAssessment,
      Opportunity,
      AnalyticsEvent,
    ]),
    AdminUsersModule,
  ],
  controllers: [FeedbackIntelligenceController],
  providers: [FeedbackIntelligenceService],
  exports: [FeedbackIntelligenceService],
})
export class FeedbackIntelligenceModule {}

