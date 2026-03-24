import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import { UserTriggerService } from '../admin-engagement/user-trigger.service';
import { FeedbackIntelligenceService } from '../feedback-intelligence/feedback-intelligence.service';
import { FunnelMetricsService } from '../admin-funnel/funnel-metrics.service';
import { InvestorSignalService } from './investor-signal.service';
import { ProductNarrativeService } from './product-narrative.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin')
export class AdminSignalController {
  constructor(
    private readonly funnelMetricsService: FunnelMetricsService,
    private readonly feedbackIntelligenceService: FeedbackIntelligenceService,
    private readonly userTriggerService: UserTriggerService,
    private readonly investorSignalService: InvestorSignalService,
    private readonly productNarrativeService: ProductNarrativeService,
  ) {}

  @Get('product-signal')
  async getProductSignal() {
    const [funnelMetrics, frictionPatterns, triggers] = await Promise.all([
      this.funnelMetricsService.getFunnelMetrics(),
      this.feedbackIntelligenceService.getFrictionPatterns(),
      this.userTriggerService.listRecent(500),
    ]);
    const triggerDistribution = triggers.reduce<Record<string, number>>((acc, trigger) => {
      acc[trigger.triggerType] = (acc[trigger.triggerType] ?? 0) + 1;
      return acc;
    }, {});
    const dropOffEntries = Object.entries(funnelMetrics.funnel.dropOffRates).sort((a, b) => b[1] - a[1]);
    const biggestDropOff = dropOffEntries[0]?.[0] ?? 'unknown';
    const recoveryCandidates = [
      {
        action: 'baseline_updated_after_low_score',
        count: funnelMetrics.funnel.stepCounts.baseline_updated_after_low_score,
      },
      {
        action: 'reanalysis_completed',
        count: funnelMetrics.funnel.stepCounts.reanalysis_completed,
      },
    ].sort((a, b) => b.count - a.count);
    const biggestRecoveryDriver = recoveryCandidates[0]?.action ?? 'unknown';
    const totalUsers = funnelMetrics.funnel.totalUsers;
    const keyConversions = {
      reachedAnalysisPercent:
        totalUsers > 0
          ? Number(((funnelMetrics.funnel.stepCounts.first_analysis_completed / totalUsers) * 100).toFixed(2))
          : 0,
      reachedHighScorePercent:
        totalUsers > 0
          ? Number(((funnelMetrics.funnel.stepCounts.high_score_achieved / totalUsers) * 100).toFixed(2))
          : 0,
      createdOpportunityPercent:
        totalUsers > 0
          ? Number(((funnelMetrics.funnel.stepCounts.opportunity_created / totalUsers) * 100).toFixed(2))
          : 0,
      generatedDocumentsPercent:
        totalUsers > 0
          ? Number(((funnelMetrics.funnel.stepCounts.documents_generated / totalUsers) * 100).toFixed(2))
          : 0,
    };
    return {
      funnelMetrics,
      frictionHotspots: frictionPatterns.slice(0, 5),
      triggerDistribution,
      keyConversions,
      topBottleneck: biggestDropOff,
      biggestRecoveryDriver,
    };
  }

  @Get('investor-snapshot')
  getInvestorSnapshot() {
    return this.investorSignalService.getInvestorSnapshot();
  }

  @Post('generate-product-narrative')
  async generateProductNarrative() {
    const [snapshot, productSignal] = await Promise.all([
      this.investorSignalService.getInvestorSnapshot(),
      this.getProductSignal(),
    ]);
    return this.productNarrativeService.generateNarrative({
      snapshot,
      conversions: productSignal.keyConversions,
      recovery: productSignal.funnelMetrics.recovery,
      topFrictionPattern: productSignal.frictionHotspots[0]?.label ?? 'none',
    });
  }
}

