import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessCode } from '../access-codes/access-code.entity';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Application } from '../applications/application.entity';
import { BetaFeedback } from '../beta-feedback/beta-feedback.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { User } from '../users/user.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsEvent } from './analytics-event.entity';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalyticsEvent,
      User,
      AccessCode,
      FitAssessment,
      Opportunity,
      Application,
      BetaFeedback,
    ]),
    AdminUsersModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
