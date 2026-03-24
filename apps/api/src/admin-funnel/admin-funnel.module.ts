import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { Baseline } from '../baseline/baseline.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { User } from '../users/user.entity';
import { AdminFunnelController } from './admin-funnel.controller';
import { FunnelMetricsService } from './funnel-metrics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Baseline, FitAssessment, Opportunity, AnalyticsEvent]),
    AdminUsersModule,
  ],
  controllers: [AdminFunnelController],
  providers: [FunnelMetricsService],
  exports: [FunnelMetricsService],
})
export class AdminFunnelModule {}

