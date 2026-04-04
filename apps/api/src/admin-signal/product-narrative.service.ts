import { Injectable } from '@nestjs/common';
import type { InvestorSnapshot } from './investor-signal.service';

@Injectable()
export class ProductNarrativeService {
  generateNarrative(input: {
    snapshot: InvestorSnapshot;
    conversions: {
      reachedAnalysisPercent: number;
      reachedHighScorePercent: number;
      createdOpportunityPercent: number;
      generatedDocumentsPercent: number;
    };
    recovery: {
      usersWithLowScore: number;
      usersWhoRecovered: number;
      recoveryRate: number;
      avgTimeToRecovery: number;
    };
    topFrictionPattern: string;
  }): { narrative: string } {
    const lines = [
      `We currently have ${input.snapshot.totalUsers} users in the measured beta loop, and ${input.conversions.reachedAnalysisPercent}% reach a completed analysis.`,
      `${input.conversions.reachedHighScorePercent}% reach a score of 70 or higher, and ${input.conversions.createdOpportunityPercent}% convert that into an opportunity.`,
      `${input.conversions.generatedDocumentsPercent}% generate documents after moving through the core path.`,
      `${input.recovery.usersWithLowScore} users hit a low score state, and ${input.recovery.usersWhoRecovered} recovered, which is a ${input.recovery.recoveryRate}% recovery rate.`,
      `Average time to recovery is ${input.recovery.avgTimeToRecovery} hours, and average time to high score is ${input.snapshot.avgTimeToHighScore} hours.`,
      `The biggest drop-off is at ${input.snapshot.biggestDropOff.replace(/_/g, ' ')}, and the top recurring friction pattern is ${input.topFrictionPattern}.`,
    ];
    return { narrative: lines.join(' ') };
  }
}

