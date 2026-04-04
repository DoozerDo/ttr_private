import { Module } from '@nestjs/common';
import { AdminEngagementModule } from '../admin-engagement/admin-engagement.module';
import { AdminFunnelModule } from '../admin-funnel/admin-funnel.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { FeedbackIntelligenceModule } from '../feedback-intelligence/feedback-intelligence.module';
import { AdminSignalController } from './admin-signal.controller';
import { InvestorSignalService } from './investor-signal.service';
import { ProductNarrativeService } from './product-narrative.service';

@Module({
  imports: [
    AdminUsersModule,
    AdminFunnelModule,
    FeedbackIntelligenceModule,
    AdminEngagementModule,
  ],
  controllers: [AdminSignalController],
  providers: [InvestorSignalService, ProductNarrativeService],
  exports: [InvestorSignalService, ProductNarrativeService],
})
export class AdminSignalModule {}

