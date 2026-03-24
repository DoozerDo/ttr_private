import { Injectable } from '@nestjs/common';
import { FeedbackIntelligenceService } from '../feedback-intelligence/feedback-intelligence.service';
import { FunnelMetricsService } from '../admin-funnel/funnel-metrics.service';

export type InvestorSnapshot = {
  totalUsers: number;
  reachedAnalysisPercent: number;
  recoveredFromLowScorePercent: number;
  reachedHighScorePercent: number;
  createdOpportunityPercent: number;
  avgTimeToHighScore: number;
  biggestDropOff: string;
  topFrictionPattern: string;
};

@Injectable()
export class InvestorSignalService {
  constructor(
    private readonly funnelMetricsService: FunnelMetricsService,
    private readonly feedbackIntelligenceService: FeedbackIntelligenceService,
  ) {}

  async getInvestorSnapshot(): Promise<InvestorSnapshot> {
    const [metrics, patterns] = await Promise.all([
      this.funnelMetricsService.getFunnelMetrics(),
      this.feedbackIntelligenceService.getFrictionPatterns(),
    ]);
    const dropOffEntries = Object.entries(metrics.funnel.dropOffRates);
    const topDropOff = dropOffEntries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    return {
      totalUsers: metrics.funnel.totalUsers,
      reachedAnalysisPercent:
        metrics.funnel.totalUsers > 0
          ? Number(
              (
                (metrics.funnel.stepCounts.first_analysis_completed / metrics.funnel.totalUsers) *
                100
              ).toFixed(2),
            )
          : 0,
      recoveredFromLowScorePercent: metrics.recovery.recoveryRate,
      reachedHighScorePercent:
        metrics.funnel.totalUsers > 0
          ? Number(
              ((metrics.funnel.stepCounts.high_score_achieved / metrics.funnel.totalUsers) * 100).toFixed(2),
            )
          : 0,
      createdOpportunityPercent:
        metrics.funnel.totalUsers > 0
          ? Number(
              ((metrics.funnel.stepCounts.opportunity_created / metrics.funnel.totalUsers) * 100).toFixed(2),
            )
          : 0,
      avgTimeToHighScore: metrics.time.avgTimeToHighScore,
      biggestDropOff: topDropOff,
      topFrictionPattern: patterns[0]?.label ?? 'none',
    };
  }
}

